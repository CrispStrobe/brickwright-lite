/**
 * Run a MakeCode ARCADE program in pxt-arcade's OWN simulator — the sim.js,
 * common-sim.js and pxtsim.js lite ships offline (npm run sync:makecode) —
 * headless, in Node, on a virtual clock. The Arcade sibling of makecode-sim.mjs
 * (which runs pxt-microbit's): the same method, a different board.
 *
 * HOW. pxt-arcade compiles the TypeScript to simulator JavaScript exactly as
 * the editor does. The simulator's runtime then runs it against its own Board —
 * scene, sprites, screen, controller, music, all of it pxt-arcade's. What is
 * replaced cannot be observed by a program:
 *   - the VIEW: the game player's canvas drawing, and the DOM it would build
 *     (an inert stand-in document);
 *   - the CLOCK: timers are queued and fired in virtual order, so a ten-second
 *     game runs in a moment, deterministically;
 *   - the SPEAKER: music.playInstructions — the one door every Arcade tone goes
 *     through — is recorded ({t, freq, ms}) and resolves after its duration of
 *     virtual time, so `music.playTone` still takes as long as it sounds.
 *
 *   const js = await compileArcade(ts);
 *   const r = await runArcadeSim(js, {ms: 3000});
 *   r.serial    // [{t, text}] — each console.log line and its virtual ms
 *   r.tones     // [{t, freq, ms}] — each tone played
 *   r.screen()  // the 160x120 screen as palette indices, at the end of the run
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAKECODE_ARCADE = path.join(ROOT, 'packages/scratch-gui/static/makecode/arcade');

/** Is the runtime synced (the compiler and the simulator both present)? */
export const arcadeSimAvailable = () => ['pxtworker.js', 'target.json', 'sim/sim.js', 'sim/common-sim.js', 'sim/pxtsim.js']
    .every(f => fs.existsSync(path.join(MAKECODE_ARCADE, f)));

let compiler = null;
async function pxt () {
    if (compiler) return compiler;
    const {PXT_GLUE_JS} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js')).href);
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(MAKECODE_ARCADE, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_ARCADE, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    compiler = sb;
    return sb;
}

/**
 * Arcade project files -> pxt's verdict, by pxt-arcade itself.
 *
 * @param {object} files {'main.ts', 'pxt.json', ...} (export-arcade's `files`)
 * @returns {Promise<{success: boolean, diagnostics: object[], outfiles: object}>}
 */
export async function compileArcadeFiles (files) {
    const sb = await pxt();
    return JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(files, {})));
}

/**
 * MakeCode Arcade TypeScript -> the simulator's JavaScript.
 *
 * @param {string|object} ts main.ts, or the whole files object
 * @returns {Promise<string>} binary.js; throws with pxt's first diagnostics when it does not compile
 */
export async function compileArcade (ts) {
    const files = typeof ts === 'string' ?
        {'pxt.json': JSON.stringify({name: 'sim', dependencies: {device: '*'}, files: ['main.ts']}), 'main.ts': ts} : ts;
    const r = await compileArcadeFiles(files);
    if (!r.success) throw new Error(`MakeCode Arcade does not compile it: ${JSON.stringify(r.diagnostics.slice(0, 3))}`);
    return r.outfiles['binary.js'];
}

/**
 * Run compiled Arcade simulator JavaScript for `ms` virtual milliseconds.
 *
 * @param {string} code binary.js from compileArcade
 * @param {object} [opts]
 * @param {number} [opts.ms] how long to run
 * @returns {Promise<{serial: Array<{t: number, text: string}>, tones: Array<{t: number, freq: number, ms: number}>,
 *   stops: number[], screen: () => Uint8Array, error: ?string}>}
 */
export async function runArcadeSim (code, {ms = 3000} = {}) {
    const START = 1000000;
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
        Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
        navigator: {userAgent: 'node', platform: 'node'},
        location: {hash: '', search: '', href: 'http://localhost/'},
        localStorage: {getItem: () => null, setItem () {}},
        addEventListener () {},
        removeEventListener () {},
        postMessage () {},
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        getComputedStyle: () => inert(),
        KeyboardEvent: class {},
        MouseEvent: class {},
        PointerEvent: class {},
        AudioContext: function () {
            return inert();
        }
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.parent = ctx;
    ctx.document = inert();
    vm.createContext(ctx);
    for (const f of ['pxtsim.js', 'common-sim.js', 'sim.js']) {
        vm.runInContext(fs.readFileSync(path.join(MAKECODE_ARCADE, 'sim', f), 'utf8'), ctx, {filename: f});
    }
    const {pxsim} = ctx;

    const tones = [];
    const stops = [];
    // Arcade sound instructions: 12 bytes each — wave, flags, frequency u16, duration u16, ...
    const play = b => {
        const d = b.data;
        let total = 0;
        for (let i = 0; i + 12 <= d.length; i += 12) {
            const u16 = k => d[i + k] | (d[i + k + 1] << 8);
            tones.push({t: now - START + total, freq: u16(2), ms: u16(4)});
            total += u16(4);
        }
        return new Promise(resolve => ctx.setTimeout(resolve, total));
    };
    pxsim.music.playInstructions = play;
    pxsim.music.queuePlayInstructions = (when, b) => {
        ctx.setTimeout(() => play(b), when);
    };
    pxsim.music.stopPlaying = () => {
        stops.push(now - START);
    };

    let buffer = '';
    const serial = [];
    let error = null;
    const runtime = new pxsim.Runtime({type: 'run', code, boardDefinition: {}, parts: [], partDefinitions: {}, fnArgs: {}});
    const board = runtime.board;
    const proto = Object.getPrototypeOf(board);
    board.gameplayer = {draw () {}, buttonChanged () {}, dispose () {}};
    proto.initAsync = function () {
        return Promise.resolve();
    };
    proto.updateView = function () {};
    proto.writeSerial = function (s) {
        buffer += s;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            serial.push({t: now - START, text: buffer.slice(0, nl).trim()});
            buffer = buffer.slice(nl + 1);
        }
    };
    runtime.errorHandler = e => {
        error = String((e && e.message) || e);
    };
    board.initAsync({}).then(() => runtime.run(() => {}));
    const settle = async () => {
        for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    };
    const end = START + ms;
    for (let guard = 0; guard < 1e6 && !error; guard++) {
        await settle();
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = Math.max(now, next.at);
        try {
            next.fn();
        } catch (e) {
            error = String((e && e.message) || e);
        }
    }
    // The screen as palette indices: pxt-arcade's ScreenState keeps it as
    // 32-bit colours, so it is mapped back through the palette it holds.
    const screen = () => {
        const s = board.screenState;
        const palette = Array.from(s.palette);
        return Uint8Array.from(s.screen, c => Math.max(0, palette.indexOf(c)));
    };
    runtime.kill();
    return {serial, tones, stops, screen, error};
}
