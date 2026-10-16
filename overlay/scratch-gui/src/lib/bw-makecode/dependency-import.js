import {validateResolvedDependencyIdentity} from './dependency-identity.js';
import {prepareArcadeDependencyInputs} from './dependency-project.js';
import {dependencyDiagnosticChannels, makeCodeWorkerErrorEnvelope} from './dependency-diagnostics.js';

export class DependencyImportError extends Error {
    constructor(stage,error,dependencyInputs) {
        super('MakeCode dependency '+stage+': '+String(error?.message || error));
        this.name = 'DependencyImportError';this.code = error?.code || 'DEPENDENCY_IMPORT';
        this.stage = stage;this.cause = error;this.details = makeCodeWorkerErrorEnvelope(error);
        this.dependencyInputs = dependencyInputs;
    }
}

/** Internal shared boundary; the public index supplies its unchanged sync reader.
 * No SDK/worker is loaded until an actual Arcade TypeScript request opts in.
 */
export async function importDependencyProjectFiles(files, options, importFiles) {
    const opts = {...options};
    if (opts.prepareDependencies === false || opts.target !== 'arcade' || typeof files?.['main.ts'] !== 'string') return importFiles(files,opts);
    let snapshot, declaredDependencies;
    try {
        if (!files || typeof files !== 'object' || Array.isArray(files) ||
            Object.values(files).some(value => typeof value !== 'string')) throw new Error('project files must be a string map');
        snapshot = Object.freeze(Object.fromEntries(Object.entries(files)));
        if (typeof snapshot['pxt.json'] !== 'string') throw new Error('current project needs its pxt.json');
        const cfg = JSON.parse(snapshot['pxt.json']);
        declaredDependencies = cfg.dependencies;
    } catch(error) {throw new DependencyImportError('input',error,{target:opts.target});}
    const dependencyInputs = {target:opts.target, declaredDependencies,
        diagnostics:{resolution:{status:'unavailable'},preparation:{status:'unavailable'},translation:{status:'unavailable'}}};
    const resolverFiles = {...snapshot}, resolverOptions = {};
    for (const key of ['fetchExtensions','fetch','baseUrl']) if (Object.prototype.hasOwnProperty.call(opts,key)) resolverOptions[key] = opts[key];
    let resolved;
    try {
        const resolve = opts.resolveProjectInputs || (async (target,current,settings) => {
            const {resolveProjectInputsMakeCode} = await import('./pxt-runtime.js');
            return resolveProjectInputsMakeCode({target,files:current,...settings});
        });
        resolved = await resolve(opts.target,resolverFiles,resolverOptions);
        dependencyInputs.diagnostics.resolution = {status:'observed',channels:dependencyDiagnosticChannels(resolved)};
        if (Object.keys(resolverFiles).length !== Object.keys(snapshot).length ||
            Object.entries(snapshot).some(([key,value]) => resolverFiles[key] !== value)) {
            throw Object.assign(new Error('resolver changed the current input files'),{code:'DEPENDENCY_INPUT_CHANGED'});
        }
        dependencyInputs.currentInputBinding = validateResolvedDependencyIdentity(snapshot,opts.target,resolved);
    } catch(error) {
        dependencyInputs.diagnostics.resolution = {...dependencyInputs.diagnostics.resolution,
            status:'failed',exception:makeCodeWorkerErrorEnvelope(error),channels:dependencyDiagnosticChannels(resolved || error)};
        throw new DependencyImportError('resolution',error,dependencyInputs);
    }
    let prepared;
    try {
        prepared = prepareArcadeDependencyInputs(snapshot,resolved);
        dependencyInputs.diagnostics.preparation = {status:'observed',channels:dependencyDiagnosticChannels(prepared)};
        for (const key of ['provenance','skippedPackages','runtimeConfig','fetchedExtensions']) dependencyInputs[key] = prepared[key];
        dependencyInputs.sourceOrder = resolved.sourceOrder;
    } catch(error) {
        dependencyInputs.diagnostics.preparation = {status:'failed',channels:dependencyDiagnosticChannels(error),exception:makeCodeWorkerErrorEnvelope(error)};
        throw new DependencyImportError('preparation',error,dependencyInputs);
    }
    try {
        const result = importFiles(prepared.files,opts);
        dependencyInputs.diagnostics.translation = {status:'observed',channels:dependencyDiagnosticChannels(result)};
        const dependencyMessages = [];
        for (const stage of ['resolution','preparation']) for (const [channel,evidence] of Object.entries(dependencyInputs.diagnostics[stage].channels)) {
            if (!evidence.provided || evidence.kind !== 'array' || !evidence.value.length ||
                ['fetchedExtensions'].includes(channel)) continue;
            for (const item of evidence.value) dependencyMessages.push(typeof item === 'string' ? item :
                typeof item?.message === 'string' ? item.message : typeof item?.reason === 'string' ? item.reason : JSON.stringify(item));
        }
        return {...result,files:snapshot,source:snapshot['main.ts'],dependencyInputs,dependencyMessages};
    } catch(error) {
        dependencyInputs.diagnostics.translation = {status:'failed',channels:dependencyDiagnosticChannels(error),exception:makeCodeWorkerErrorEnvelope(error)};
        throw new DependencyImportError('translation',error,dependencyInputs);
    }
}
