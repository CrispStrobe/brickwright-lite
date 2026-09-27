/**
 * Run a MakeCode micro:bit program in pxt-microbit's OWN simulator — the
 * sim.js and pxtsim.js lite ships offline (npm run sync:makecode) — headless,
 * in Node, on a virtual clock. The counterpart of microbit-firmware.mjs: that
 * one runs lite's translation of a program, this one runs MakeCode's original,
 * so a test can hold the two side by side.
 *
 * HOW. pxt compiles the TypeScript to simulator JavaScript exactly as the
 * editor does (pxtworker.js in a vm, the census's setup). The simulator's
 * runtime then runs that code against its DalBoard — the LED matrix, buttons,
 * serial, all of it pxt-microbit's own. Two things are replaced, neither of
 * which a program can observe: the board's VIEW (initAsync builds the SVG
 * board; there is no page) and the CLOCK. Time is virtual — timers are queued
 * and fired in order, Date.now() and performance.now() read the queue's clock —
 * so a ten-second game runs in a moment, and deterministically.
 *
 *   const js = await compileMakeCode(ts);
 *   const r = await runMakeCodeSim(js, {ms: 5000, at: [1000, 2000]});
 *   r.serial    // [{t, text}] — each line and the virtual ms it was written at
 *   r.frames    // {1000: [25 brightnesses 0..255], 2000: [...]} — the LEDs at those times
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAKECODE_MICROBIT = path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit');

/** Is the runtime synced (the compiler and the simulator both present)? */
export const makeCodeSimAvailable = () => ['pxtworker.js', 'target.json', 'sim/sim.js', 'sim/pxtsim.js']
    .every(f => fs.existsSync(path.join(MAKECODE_MICROBIT, f)));

let compiler = null;
async function pxt () {
    if (compiler) return compiler;
    const {PXT_GLUE_JS} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js')).href);
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(MAKECODE_MICROBIT, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_MICROBIT, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    compiler = sb;
    return sb;
}

/**
 * MakeCode TypeScript -> the simulator's JavaScript, by pxt itself.
 *
 * @param {string} ts main.ts
 * @returns {Promise<string>} binary.js; throws with pxt's first diagnostics when it does not compile
 */
export async function compileMakeCode (ts) {
    const sb = await pxt();
    const files = {
        'pxt.json': JSON.stringify({name: 'sim', dependencies: {core: '*', radio: '*', microphone: '*'}, files: ['main.ts']}),
        'main.ts': ts
    };
    const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(files, {})));
    if (!r.success) throw new Error(`MakeCode does not compile it: ${JSON.stringify(r.diagnostics.slice(0, 3))}`);
    return r.outfiles['binary.js'];
}

/**
 * Run compiled simulator JavaScript for `ms` virtual milliseconds.
 *
 * @param {string} code binary.js from compileMakeCode
 * @param {object} [opts]
 * @param {number} [opts.ms] how long to run
 * @param {number[]} [opts.at] virtual times at which to snapshot the LED matrix
 * @returns {Promise<{serial: Array<{t: number, text: string}>, frames: object, error: ?string}>}
 */
export async function runMakeCodeSim (code, {ms = 5000, at = []} = {}) {
    const START = 1000000;                        // the sim's clock starts somewhere; only differences count
    let now = START;
    const timers = [];
    let seq = 0;
    const later = (fn, wait, repeat) => {
        const id = ++seq;
        const arm = () => timers.push({id, at: now + Math.max(repeat ? 1 : 0, Number(wait) | 0), fn: () => {
            if (repeat) arm();
            fn();
        }});
        arm();
        return id;
    };
    const cancel = id => {
        const i = timers.findIndex(t => t.id === id);
        if (i >= 0) timers.splice(i, 1);
    };
    const inert = () => new Proxy(function () {}, {
        get: (t, k) => (k === Symbol.toPrimitive ? () => '' : inert()),
        apply: () => inert(),
        construct: () => inert(),
        set: () => true
    });
    class VirtualDate extends Date {
        constructor (...a) {
            if (a.length) super(...a);
            else super(now);
        }
        static now () {
            return now;
        }
    }
    const ctx = {
        console: {log () {}, warn () {}, error () {}, info () {}, debug () {}},
        setTimeout: (fn, wait, ...a) => later(() => fn(...a), wait, false),
        setInterval: (fn, wait) => later(fn, wait, true),
        clearTimeout: cancel,
        clearInterval: cancel,
        Date: VirtualDate,
        performance: {now: () => now},
        requestAnimationFrame: fn => later(() => fn(now), 16, false),
        Promise, Math, JSON, Map, Set, WeakMap, Symbol, Proxy, Reflect, BigInt, Error, TypeError, RangeError,
        Object, Array, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, isFinite,
        encodeURIComponent, decodeURIComponent, TextEncoder, TextDecoder, ArrayBuffer, DataView,
        Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
        navigator: {userAgent: 'node', platform: 'node'},
        location: {hash: '', search: '', href: 'http://localhost/'},
        localStorage: {getItem: () => null, setItem () {}},
        addEventListener () {},
        postMessage () {}
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.parent = ctx;
    ctx.document = inert();
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_MICROBIT, 'sim/pxtsim.js'), 'utf8'), ctx, {filename: 'pxtsim.js'});
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_MICROBIT, 'sim/sim.js'), 'utf8'), ctx, {filename: 'sim.js'});
    const {pxsim} = ctx;

    let buffer = '';
    const serial = [];
    // The board, less its picture: no SVG to build, no view to refresh.
    pxsim.DalBoard.prototype.initAsync = function () {
        return Promise.resolve();
    };
    pxsim.DalBoard.prototype.updateView = function () {};
    pxsim.DalBoard.prototype.writeSerial = function (s) {
        buffer += s;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            serial.push({t: now - START, text: buffer.slice(0, nl).trim()});
            buffer = buffer.slice(nl + 1);
        }
    };
    const runtime = new pxsim.Runtime({type: 'run', code, boardDefinition: {}, parts: [], partDefinitions: {}, fnArgs: {}});
    let error = null;
    runtime.errorHandler = e => {
        error = String((e && e.message) || e);
    };
    const frames = {};
    const snaps = [...at].sort((a, b) => a - b);
    const snap = () => Array.from(runtime.board.ledMatrixState.image.data);

    runtime.board.initAsync({}).then(() => runtime.run(() => {}));
    const settle = async () => {
        for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    };
    const end = START + ms;
    for (let guard = 0; guard < 1e6 && !error; guard++) {
        await settle();
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        // A snapshot is taken with everything due BEFORE it done.
        while (snaps.length && (!next || START + snaps[0] < next.at || next.at > end)) {
            if (START + snaps[0] > end) break;
            frames[snaps.shift()] = snap();
        }
        if (!next || next.at > end) break;
        timers.shift();
        now = Math.max(now, next.at);
        try {
            next.fn();
        } catch (e) {
            error = String((e && e.message) || e);
        }
    }
    for (const t of snaps) if (t <= ms) frames[t] = snap();
    runtime.kill();
    return {serial, frames, error};
}
