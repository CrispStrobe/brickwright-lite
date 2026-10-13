/**
 * MakeCode's compiler in Node: the same glue the app's Web Worker runs
 * (lib/bw-makecode/pxt-runtime.js PXT_GLUE_JS), evaluated in a vm sandbox with
 * the worker's globals, over the runtime scripts/sync-makecode-runtime.mjs
 * serves. Used by the MakeCode CLI and the census; the tests keep their own
 * copy on purpose, so a change here cannot quietly make them agree with it.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');

const sandboxes = new Map();

/** Is this target's runtime synced? */
export const hasRuntime = target => fs.existsSync(path.join(STATIC, target, 'pxtworker.js'));

async function sandbox (target) {
    if (sandboxes.has(target)) return sandboxes.get(target);
    if (!hasRuntime(target)) {
        throw Object.assign(new Error(`MakeCode ${target} runtime not synced — run \`npm run sync:makecode\``), {code: 'NO_RUNTIME'});
    }
    const {PXT_GLUE_JS} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js')).href);
    const dir = path.join(STATIC, target);
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer, atob,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    const workerBytes = fs.readFileSync(path.join(dir, 'pxtworker.js'));
    sb.__bwOriginalWorkerSha256 = createHash('sha256').update(workerBytes).digest('hex');
    vm.runInContext(workerBytes.toString('utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandboxes.set(target, sb);
    return sb;
}

/**
 * Compile a MakeCode project. Same result shape as the browser's compileMakeCode.
 * @param {string} target 'microbit' | 'arcade'
 * @param {object} files {filename: contents}, pxt.json included
 * @param {{native?: boolean, embedSource?: object, hwVariant?: string, fetchExtensions?: boolean, fetch?: Function}} [opts] hwVariant: an
 *     Arcade board for a native build (ARCADE_HARDWARE in pxt-runtime.js)
 */
async function runCompiler (target, files, opts = {}, projectInputs = false) {
    const sb = await sandbox(target);
    const {onDemandExtensions} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js')).href);
    // CLI audits are offline by default. Fetch only when explicitly requested.
    const onDemand = await onDemandExtensions(target, files, opts.fetchExtensions === true, opts.fetch);
    const getBaseHex = async sha => {
        const p = path.join(STATIC, target, 'hexcache', `${sha}.hex`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    try {
        const r = await sb.bwMakeCode.compile(files, {native: !!opts.native, embedSource: opts.embedSource || null,
            projectInputs,
            hwVariant: opts.hwVariant || '', getBaseHex,
            extensions: onDemand.extensions.map(({id, repo, refs, targets, files: source}) =>
                ({id, repo, refs, targets, files: source}))});
        return {...JSON.parse(JSON.stringify(r)), fetchedExtensions: onDemand.extensions.map(e =>
            ({id: e.id, repo: e.repo, ref: e.refs[0], ...e.fetched}))};
    } catch (error) {
        if (error?.code === 'NO_EXTENSION') {
            error.refused = onDemand.refused;
            error.fetchedExtensions = onDemand.extensions.map(e => ({id: e.id, repo: e.repo, ref: e.refs[0], ...e.fetched}));
        }
        throw error;
    }
}

export const compile = (target, files, opts = {}) => runCompiler(target, files, opts);

/** Original PXT package installation and generated inputs, without compilation.
 * Includes only GitHub packages supplied through the extension resolver, not
 * target libraries. Remote fetching remains explicitly opt-in.
 */
export const resolveProjectInputs = (target, files, opts = {}) => runCompiler(target, files, opts, true);

/** PXT's own tutorial JRES emitter, from this target's pinned original worker.
 * No compilation, package fetching or execution of the tutorial's source.
 */
export async function getTutorialTilemapGenerator (target) {
    const sb = await sandbox(target);
    const generate = text => sb.pxt.emitTilemapsFromJRes(JSON.parse(text));
    generate.provenance = {emitter: 'pxt.emitTilemapsFromJRes', target,
        workerSha256: sb.__bwOriginalWorkerSha256, versions: {...sb.pxtTargetBundle.versions}};
    return generate;
}
