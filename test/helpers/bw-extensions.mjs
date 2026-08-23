/**
 * Load lite's BUNDLED extensions the way the shipped app loads them, from the
 * git source of truth (`overlay/scratch-vm/...`) rather than from the installed
 * `node_modules/scratch-vm` copy.
 *
 * Why overlay and not node_modules: `scripts/apply-vm-overlay.mjs` copies the
 * overlay onto node_modules as a post-install step. A developer machine whose
 * last apply-vm-overlay predates an extension edit therefore holds a STALE
 * copy — measured 2026-08-23: three extensions (stc12, stc12live, controller)
 * differed, and the stale stc12 reported 12 opcodes where the shipped one has
 * 20. Reading the overlay removes that whole class of false reading.
 *
 * The four `extension-support` / `util` modules the adapter pulls in are stock
 * upstream scratch-vm and come from the installed copy; the overlay does not
 * carry them.
 *
 * Extensions are resolved to their ids STATICALLY and constructed LAZILY.
 * Constructing all 26 does not terminate: several LEGO BLE extensions start a
 * reconnect/poll loop in their constructor (measured — a full sweep ran past
 * 10 minutes). Only the handful an example actually needs is ever built.
 */
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {REPO, INTEGRATED} from './bw-integrated.mjs';

export {REPO};
export const OVERLAY_EXT = path.join(REPO, 'overlay', 'scratch-vm', 'src', 'extensions', 'crispstrobe');
export const VM_SRC = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src');

const nodeRequire = createRequire(import.meta.url);
const SUPPORT = {
    'argument-type': 'extension-support/argument-type',
    'block-type': 'extension-support/block-type',
    'target-type': 'extension-support/target-type',
    cast: 'util/cast'
};

let adapterCache = null;
function shimRequire (spec) {
    const base = path.basename(spec);
    if (base === 'adapter') return loadAdapter();
    if (SUPPORT[base]) return nodeRequire(path.join(VM_SRC, SUPPORT[base]));
    throw new Error(`bw-extensions: unresolved require(${spec})`);
}
function evalCjs (file) {
    const module_ = {exports: {}};
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', '__filename', '__dirname',
        readFileSync(file, 'utf8'))(shimRequire, module_, module_.exports, file, path.dirname(file));
    return module_.exports;
}
function loadAdapter () {
    if (!adapterCache) adapterCache = evalCjs(path.join(OVERLAY_EXT, 'adapter.js'));
    return adapterCache;
}

/**
 * `extension id -> directory`, read statically from the source.
 *
 * The directory name is NOT the id in general (`ev3dev/` registers as
 * `scratchtoev3`), so the id is taken from the extension's own
 * `// ID: <id>` header or, failing that, the `id:` field of its getInfo
 * literal. Static because construction is not safe (see the file header).
 */
export function bundledExtensionIds () {
    const ids = new Map();
    for (const name of readdirSync(OVERLAY_EXT)) {
        const dir = path.join(OVERLAY_EXT, name);
        if (!statSync(dir).isDirectory()) continue;
        const entry = path.join(dir, 'index.js');
        if (!existsSync(entry)) continue;
        const source = readFileSync(entry, 'utf8');
        const header = source.match(/^\s*\/\/\s*ID:\s*([\w.-]+)\s*$/m);
        const field = source.match(/\bid:\s*["']([\w.-]+)["']/);
        const id = (header && header[1]) || (field && field[1]) || name;
        ids.set(id, name);
    }
    return ids;
}

/** Build the class for one bundled extension directory. */
export function loadExtensionClass (dir) {
    return evalCjs(path.join(OVERLAY_EXT, dir, 'index.js'));
}

/**
 * A runtime stub with the surface the bundled extensions touch at construction
 * time. `stc` carries the pin/port/part/table declarations, because stc12 gates
 * its port and matrix blocks on them: probing against an empty runtime
 * under-reports its opcode set (12 instead of 20), which would make this gate
 * accuse a correct extension of missing blocks.
 */
export function stubRuntime (stc) {
    return {
        stc: stc || {device: 'stc89c52rc', pins: [], ports: [], parts: [], tables: []},
        targets: [], ioDevices: {}, peripheralExtensions: {}, _events: {},
        emit () {}, on () {}, once () {}, off () {}, addListener () {}, removeListener () {},
        registerPeripheralExtension () {}, getTargetForStage () { return null; },
        requestRedraw () {}, startHats () {}, requestBlocksUpdate () {}
    };
}

/**
 * Construct one extension and report what it defines.
 *
 * Returns `{id, opcodes, methods, error}`. Both sets matter: scratch-vm needs
 * getInfo() to DEFINE the block and a same-named method to RUN it, and the two
 * can disagree — a block listed with no implementation loads into the palette
 * and then does nothing.
 *
 * Timers started during construction are cleared afterwards. Several
 * extensions start a poll loop on construct; left running, node:test never
 * exits and the gate reads as a hang rather than a result.
 */
export function probeExtension (Cls, runtime) {
    const timers = [];
    const realInterval = globalThis.setInterval;
    const realTimeout = globalThis.setTimeout;
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.setInterval = (...args) => { const h = realInterval(...args); timers.push(h); return h; };
    globalThis.setTimeout = (...args) => { const h = realTimeout(...args); timers.push(h); return h; };
    globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
    try {
        const instance = new Cls(runtime);
        const info = instance.getInfo();
        const opcodes = new Set();
        for (const block of info.blocks || []) {
            if (block && typeof block === 'object' && block.opcode) opcodes.add(block.opcode);
        }
        const methods = new Set();
        for (let o = instance; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
            for (const key of Object.getOwnPropertyNames(o)) {
                try { if (typeof instance[key] === 'function') methods.add(key); } catch { /* getter */ }
            }
        }
        return {id: info.id, instance, opcodes, methods, error: null};
    } catch (error) {
        return {id: null, instance: null, opcodes: new Set(), methods: new Set(),
            error: (error && error.message) || String(error)};
    } finally {
        for (const handle of timers) { try { clearInterval(handle); clearTimeout(handle); } catch { /* noop */ } }
        globalThis.setInterval = realInterval;
        globalThis.setTimeout = realTimeout;
        if (realRaf === undefined) delete globalThis.requestAnimationFrame;
    }
}
