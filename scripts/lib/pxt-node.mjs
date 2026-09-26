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
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandboxes.set(target, sb);
    return sb;
}

/**
 * Compile a MakeCode project. Same result shape as the browser's compileMakeCode.
 * @param {string} target 'microbit' | 'arcade'
 * @param {object} files {filename: contents}, pxt.json included
 * @param {{native?: boolean, embedSource?: object}} [opts]
 */
export async function compile (target, files, opts = {}) {
    const sb = await sandbox(target);
    const getBaseHex = async sha => {
        const p = path.join(STATIC, target, 'hexcache', `${sha}.hex`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    const r = await sb.bwMakeCode.compile(files, {native: !!opts.native, embedSource: opts.embedSource || null, getBaseHex});
    return JSON.parse(JSON.stringify(r));   // out of the vm's realm
}
