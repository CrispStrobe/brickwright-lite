/** Ordered real Arcade conversion journey, acquired only by explicit opt-in.
 * Headless/manual frames are observations, not a browser/behavior equivalence.
 * Every product return/error is observed before its dependent next phase.
 */
import {conversionException, providedConversionChannels} from './conversion-audit-core.mjs';
import {importProjectFiles} from '../../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectToArcade} from '../../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {assetLibraryRecords, withoutAssetLibraries} from '../../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {captureCodeArtwork} from '../../overlay/scratch-gui/src/lib/bw-code-artwork.js';
import {getCostumeDocument} from '../../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';

export const JOURNEY_PHASES = ['original-runtime', 'code-return', 'code-runtime', 'export', 'reimport', 'reimport-creator', 'reimport-runtime'];
const creatorObservation = creator => ({project: creator.project, assets: creator.assets,
    channels: providedConversionChannels(creator)});
const partialObservation = partial => partial ? {state: partial.state, creator: creatorObservation(partial.creator),
    buffer: partial.buffer, errors: partial.errors, errorEvents: partial.errorEvents, vmConstructed: true,
    runtimeProject: {observed: false, reason: 'Partial failure capture does not call VM serialization'}} : {vmConstructed: false};
const variables = vm => vm.runtime.targets.flatMap(target => Object.values(target.variables || {}).map(value =>
    ({targetId: target.id, targetName: target.getName(), name: value.name, type: value.type, value: value.value})));
const runObservation = run => ({creator: creatorObservation(run.creator), project: JSON.parse(run.vm.toJSON()),
    buffer: run.buffer, errors: run.errors, errorEvents: run.errorEvents,
    threadsStarted: run.threadsStarted, greenFlagThreadsStarted: run.greenFlagThreadsStarted,
    variables: variables(run.vm), loadedOpcodes: run.loadedOpcodes, loadedExtensions: run.loadedExtensions,
    animationResources: run.vm.runtime.bwArcadeAnimationResources,
    artwork: run.artwork, appliedArtwork: run.appliedArtwork,
    extensionCalls: {observed: false}, frameAuthority: 'manual',
    actorPixels: {observed: false, reason: 'Headless VM has no browser renderer'}});

/** initial and creator are the actual same initial audit result/Creator, not
 * a reconstructed class or a second import. Observer failures propagate and
 * must not become an ordinary unsupported product classification.
 */
export async function auditConversionJourney (initial, {creator, frames = 24,
    onObservation = async () => {}} = {}) {
    if (!Number.isInteger(frames) || frames < 0) throw new Error('Journey frames must be a nonnegative integer');
    if (initial.target !== 'arcade') throw new Error('Full journey is supported only for Arcade');
    if (initial.import.status !== 'return' || initial.creator.status !== 'return') {
        return {status: 'unattempted', reason: 'Initial import/Creator did not return', phases: JOURNEY_PHASES.map(phase => ({phase, status: 'unattempted'}))};
    }
    if (!creator || creator.project !== initial.creator.project || creator.assets !== initial.creator.assets) {
        throw new Error('Journey requires the actual observed initial Creator');
    }
    const {runCreatedProgram, SB3Creator, quitStrandedVMs, clearStrayTimers} = await import('../../test/helpers/bw-vm.mjs');
    const ownedVMs = new Set(), phases = [], cleanup = [], runtime = [];
    let active, primary, hasPrimary = false, observerError, observerFailed = false;
    const emit = async event => {
        try { await onObservation(event); }
        catch (error) { observerFailed = true; observerError = error; throw error; }
    };
    const stage = async (phase, operation, observe = value => value, partial = null) => {
        active = phase;
        const began = process.hrtime.bigint(), cpu = process.cpuUsage();
        let value, error, failed = false;
        try { value = await operation(); } catch (caught) { failed = true; error = caught; }
        const productCPU = process.cpuUsage(cpu);
        const productWallSeconds = Number(process.hrtime.bigint() - began) / 1e9;
        let event;
        try { event = failed ? {phase, status: 'throw', exception: conversionException(error),
            ...(partial ? {partialRun: partial()} : {})} :
            {phase, status: 'return', value: observe(value)}; }
        catch (error) { observerFailed = true; observerError = error; throw error; }
        event.productTiming = {wallSeconds: productWallSeconds, cpuMicroseconds: productCPU.user + productCPU.system};
        phases.push(event);
        await emit(event);
        if (failed) throw error;
        return value;
    };
    const execute = async (phase, parsed, {uploads = [], resources = [], artworkContext = null, artworkVM = null} = {}) => {
        let partial;
        const record = {phase, status: 'unattempted'}; runtime.push(record);
        const run = await stage(phase, () => runCreatedProgram(parsed, {frames, storage: true,
            uploads, animationResources: resources, artworkContext, artworkVM,
            frameAuthority: 'manual', countExtensionCalls: false, retainExtensionTimers: true,
            observeRun: value => {
                partial = value; ownedVMs.add(value.vm);
                record.status = 'constructed'; record.partial = partialObservation(value);
                record.errors = value.errors; record.errorEvents = value.errorEvents;
            }}), runObservation, () => {
                record.status = 'throw'; record.partial = partialObservation(partial);
                return record.partial;
            });
        record.status = 'return'; record.errors = run.errors; record.errorEvents = run.errorEvents;
        record.partial = partialObservation(partial); record.threadsStarted = run.threadsStarted;
        return run;
    };
    const imported = initial.import.value;
    let exported, reimported;
    try {
        const first = await execute('original-runtime', creator, {uploads: imported.costumes || [], resources: imported.animationResources || []});
        let baseline, artworkContext;
        await stage('code-return', () => {
            const saved = JSON.parse(first.vm.toJSON());
            const project = withoutAssetLibraries(saved, assetLibraryRecords(first.vm, saved));
            const source = new SB3Creator().decompile(project);
            baseline = new SB3Creator();
            baseline.parse(source);
            artworkContext = captureCodeArtwork(first.vm, baseline.project);
            return {source, project, baseline: creatorObservation(baseline)};
        });
        const second = await execute('code-runtime', baseline, {artworkContext, artworkVM: first.vm});
        exported = await stage('export', () => {
            const saved = JSON.parse(second.vm.toJSON());
            const project = withoutAssetLibraries(saved, assetLibraryRecords(second.vm, saved));
            const before = structuredClone(project);
            const svgs = new Map(), palettes = new Map(), sounds = new Map(), animationDocuments = [], assets = [];
            for (const target of second.vm.runtime.targets) {
                if (!target.isOriginal) continue;
                for (const sound of target.sprite.sounds || []) if (sound.asset) sounds.set(sound.assetId, sound.asset.data);
                for (const costume of target.sprite.costumes || []) {
                    assets.push({target: target.getName(), costume, assetPresent: costume.asset !== undefined});
                    if (costume.asset?.dataFormat === 'svg') svgs.set(costume.assetId, costume.asset.decodeText());
                    const document = getCostumeDocument(costume);
                    if (document?.palette) palettes.set(costume.assetId, document.palette);
                    if (document?.animation?.resource) animationDocuments.push(document);
                }
            }
            const value = projectToArcade(project, {name: 'compatibility-journey', animationDocuments,
                costumeSvg: (_target, costume) => svgs.get(costume.assetId) || null,
                costumePalette: (_target, costume) => palettes.get(costume.assetId) || null,
                soundData: (_target, sound) => sounds.get(sound.assetId) || null});
            if (JSON.stringify(project) !== JSON.stringify(before)) throw new Error('Export changed the actual current project input');
            return {returned: value, channels: providedConversionChannels(value), project, assets,
                animationDocuments, rasterPixels: {observed: false}};
        });
        reimported = await stage('reimport', () => {
            const files = exported.returned.files;
            if (!files || typeof files !== 'object' || Array.isArray(files) ||
                Object.values(files).some(value => typeof value !== 'string')) throw new Error('Export did not return a complete string file map');
            const supplied = structuredClone(files), before = JSON.stringify(supplied);
            // Fresh exported files have their own public sync identity. Never
            // borrow an old dependency resolver/certificate for this new input.
            const returned = importProjectFiles(supplied, {target: 'arcade', name: 'compatibility-reimport', animationResources: true});
            if (JSON.stringify(supplied) !== before) throw new Error('Reimport changed the exact exported input strings');
            return {files: supplied, returned, channels: providedConversionChannels(returned), route: 'PUBLIC_SYNC_EXPORTED_FILES'};
        });
        let fresh;
        await stage('reimport-creator', () => { fresh = new SB3Creator(); fresh.parse(reimported.returned.code); return creatorObservation(fresh); });
        await execute('reimport-runtime', fresh, {uploads: reimported.returned.costumes || [], resources: reimported.returned.animationResources || []});
    } catch (error) { hasPrimary = true; primary = error; }
    finally {
        for (const vm of ownedVMs) {
            const row = {index: cleanup.length}; cleanup.push(row);
            for (const method of ['stopAll', 'quit']) {
                try { vm[method](); row[method] = {status: 'return'}; }
                catch (error) { row[method] = {status: 'throw', exception: conversionException(error)}; }
            }
        }
        for (const [name, operation] of [['quitStrandedVMs', quitStrandedVMs], ['clearStrayTimers', clearStrayTimers]]) {
            try { operation(); cleanup.push({operation: name, status: 'return'}); }
            catch (error) { cleanup.push({operation: name, status: 'throw', exception: conversionException(error)}); }
        }
    }
    if (observerFailed) throw observerError;
    const cleanupFailed = cleanup.some(row => row.status === 'throw' || row.stopAll?.status === 'throw' || row.quit?.status === 'throw');
    const diagnosticChannels = [
        {source: 'initial-import', channels: initial.import.channels},
        {source: 'initial-creator', channels: initial.creator.channels}
    ];
    for (const row of phases) {
        if (row.value?.channels) diagnosticChannels.push({source: row.phase, channels: row.value.channels});
        if (row.value?.baseline?.channels) diagnosticChannels.push({source: `${row.phase}/baseline`, channels: row.value.baseline.channels});
        if (row.value?.creator?.channels) diagnosticChannels.push({source: `${row.phase}/creator`, channels: row.value.creator.channels});
        if (row.partialRun?.creator?.channels) diagnosticChannels.push({source: `${row.phase}/partial-creator`, channels: row.partialRun.creator.channels});
    }
    for (const record of runtime) {
        diagnosticChannels.push({source: `${record.phase}/runtime`, channels: {
            errors: record.errors ? {provided: true, kind: 'array', value: record.errors} : {provided: false},
            errorEvents: record.errorEvents ? {provided: true, kind: 'array', value: record.errorEvents} : {provided: false},
            warnings: {provided: false}
        }});
    }
    let reported = hasPrimary || cleanupFailed, unobserved = false;
    for (const row of diagnosticChannels) for (const key of ['unsupported', 'warnings', 'errors', 'unparsed', 'diagnostics', 'dependencyMessages', 'errorEvents']) {
        const channel = row.channels?.[key];
        // Absence is retained in the complete channel inventory, never converted
        // to an observed empty list or a clean-compatibility certificate.
        if (!channel?.provided) continue;
        if (channel.kind === 'array' && Array.isArray(channel.value)) { if (channel.value.length) reported = true; }
        else if (channel.kind === 'string') { if (channel.value.length) reported = true; }
        else unobserved = true;
    }
    const operationStatus = hasPrimary || cleanupFailed || JOURNEY_PHASES.some(phase =>
        !phases.some(row => row.phase === phase && row.status === 'return')) ? 'failed' : 'completed';
    const compatibilityStatus = reported ? 'reported-diagnostics' : unobserved ? 'unobserved-diagnostics' : 'no-reported-diagnostics';
    const result = {status: operationStatus, operationStatus, compatibilityStatus,
        cleanCompatibility: 'not-established', diagnosticChannels,
        absentChannels: 'Not reported; never inferred empty',
        phases, cleanup, runtime, frames, frameAuthority: 'manual',
        ...(hasPrimary ? {failedAt: active, exception: conversionException(primary)} : {}),
        exportedFiles: exported?.returned.files, reimportRoute: reimported?.route,
        unattempted: JOURNEY_PHASES.filter(phase => !phases.some(row => row.phase === phase)),
        boundary: 'Ordered actual headless stages; no original SDK compilation, browser pixels or behavioral equivalence.'};
    await emit({phase: 'journey-complete', status: 'return', value: result});
    return result;
}
