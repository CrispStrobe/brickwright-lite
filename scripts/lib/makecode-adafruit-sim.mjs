/**
 * Run a MakeCode Circuit Playground Express program in pxt-adafruit's OWN
 * simulator — the sim.js / common-sim.js / pxtsim.js Lite ships offline (npm
 * run sync:makecode) — headless, in Node, on a virtual clock. The adafruit
 * counterpart of makecode-sim.mjs (micro:bit), and the reference the
 * `circuitplayground` extension is held against (task A9): the same program
 * run here and through Lite's extension must read the same.
 *
 *   const js = await compileAdafruit(ts);
 *   const r = await runAdafruitSim(js, {ms: 3000, at: [500, 1000], inputs: [{t: 200, button: 'A', down: true}]});
 *   r.frames  // {500: [10 x 0xRRGGBB], ...} — the ring as SENT (after brightness)
 *   r.tones   // [{t, frequency, ms}] — every mixer sound instruction, virtual ms
 *   r.serial  // [{t, text}]
 *
 * Inputs are applied to the simulator's own board state at their virtual
 * time: {button: 'A'|'B'|'A+B', down}, {switchRight}, {light}, {temperature},
 * {sound}. As in makecode-sim.mjs, only the board's VIEW and the CLOCK are
 * replaced; nothing a program can observe.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAKECODE_ADAFRUIT = path.join(ROOT, 'packages/scratch-gui/static/makecode/adafruit');

/** Is the runtime synced (the compiler and the simulator both present)? */
export const adafruitSimAvailable = () => ['pxtworker.js', 'target.json', 'sim/sim.js', 'sim/common-sim.js', 'sim/pxtsim.js', 'sim/bluebird.min.js']
    .every(f => fs.existsSync(path.join(MAKECODE_ADAFRUIT, f)));

let compiler = null;
async function pxt () {
    if (compiler) return compiler;
    const {PXT_GLUE_JS} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js')).href);
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(MAKECODE_ADAFRUIT, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_ADAFRUIT, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    compiler = sb;
    return sb;
}

/**
 * MakeCode Circuit Playground TypeScript -> the simulator's JavaScript, by pxt.
 *
 * @param {string} ts main.ts
 * @returns {Promise<string>} binary.js; throws with pxt's first diagnostics when it does not compile
 */
export async function compileAdafruit (ts) {
    const sb = await pxt();
    const files = {
        'pxt.json': JSON.stringify({name: 'sim', dependencies: {'circuit-playground': '*'}, files: ['main.ts']}),
        'main.ts': ts
    };
    const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(files, {})));
    if (!r.success) throw new Error(`MakeCode does not compile it: ${JSON.stringify(r.diagnostics.slice(0, 3))}`);
    return r.outfiles['binary.js'];
}

/**
 * Run compiled simulator JavaScript for `ms` virtual milliseconds.
 *
 * @param {string} code binary.js from compileAdafruit
 * @param {object} [opts]
 * @param {number} [opts.ms] how long to run
 * @param {number[]} [opts.at] virtual times at which to snapshot the ring
 * @param {object[]} [opts.inputs] board inputs at virtual times (see the module comment)
 * @returns {Promise<{frames: object, tones: object[], serial: object[], error: ?string}>}
 */
export async function runAdafruitSim (code, {ms = 3000, at = [], inputs = []} = {}) {
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
    // pxt-core 6's simulator runs on Bluebird (Promise.delay, Promise.map…),
    // which the editor page loads before pxtsim.js.
    vm.runInContext(fs.readFileSync(path.join(MAKECODE_ADAFRUIT, 'sim/bluebird.min.js'), 'utf8'), ctx, {filename: 'bluebird.min.js'});
    if (ctx.P && !ctx.Promise.delay) ctx.Promise = ctx.P;
    for (const file of ['sim/pxtsim.js', 'sim/common-sim.js', 'sim/sim.js']) {
        vm.runInContext(fs.readFileSync(path.join(MAKECODE_ADAFRUIT, file), 'utf8'), ctx, {filename: file});
    }
    const {pxsim} = ctx;

    let buffer = '';
    const serial = [];
    const tones = [];
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
    // The speaker: what was asked for and when, not an oscillator. pxt-adafruit
    // 1.6.8 plays every tone through its mixer, as a buffer of 12-byte sound
    // instructions queued `when` ms ahead: [wave, flags, frequency u16 LE,
    // duration u16 LE, startVolume u16, endVolume u16, endFrequency u16].
    pxsim.AudioContextManager.queuePlayInstructions = (when, b) => {
        const data = (b && b.data) || [];
        let t = now - START + (Number(when) | 0);
        for (let i = 0; i + 12 <= data.length; i += 12) {
            const frequency = data[i + 2] | (data[i + 3] << 8);
            const ms = data[i + 4] | (data[i + 5] << 8);
            tones.push({t, frequency, ms});
            t += ms;
        }
    };
    pxsim.AudioContextManager.playInstructionsAsync = b => {
        pxsim.AudioContextManager.queuePlayInstructions(0, b);
        return Promise.resolve();
    };

    const runtime = new pxsim.Runtime({type: 'run', code, boardDefinition: {}, parts: [], partDefinitions: {}, fnArgs: {}});
    let error = null;
    runtime.errorHandler = e => {
        error = String((e && e.message) || e);
    };
    const board = () => runtime.board;
    const ring = () => {
        const state = board().tryGetNeopixelState(board().defaultNeopixelPin().id);
        if (!state || !state.buffer) return Array(10).fill(0);
        return Array.from({length: state.length}, (_, i) => {
            const [r, g, b] = state.pixelColor(i);
            return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
        });
    };
    const apply = input => {
        const b = board();
        if (input.button) {
            const index = {A: 0, B: 1, 'A+B': 2}[input.button];
            b.buttonState.buttons[index].setPressed(Boolean(input.down));
        }
        if ('switchRight' in input) b.slideSwitchState.setState(!input.switchRight);
        if ('light' in input) b.lightSensorState.setLevel(input.light);
        if ('temperature' in input) b.thermometerState.setLevel(input.temperature);
        if ('sound' in input) b.microphoneState.setLevel(input.sound);
        if (input.acceleration) b.accelerometerState.accelerometer.update(...input.acceleration);
        // pxt-adafruit 1.6.8's own Shake widget queues this same event on
        // the original simulator bus (sim/sim.js: DEVICE_ID_GESTURE = 13).
        if (input.gesture === 'shake') b.bus.queue(13, 11);
        else if ('gesture' in input) throw new Error(`Unsupported test gesture: ${input.gesture}`);
    };
    for (const input of inputs) later(() => apply(input), input.t, false);

    const frames = {};
    const snaps = [...at].sort((a, c) => a - c);
    runtime.board.initAsync({}).then(() => runtime.run(() => {}));
    const settle = async () => {
        for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    };
    const end = START + ms;
    for (let guard = 0; guard < 1e6 && !error; guard++) {
        await settle();
        timers.sort((a, c) => a.at - c.at || a.id - c.id);
        const next = timers[0];
        while (snaps.length && (!next || START + snaps[0] < next.at || next.at > end)) {
            if (START + snaps[0] > end) break;
            frames[snaps.shift()] = ring();
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
    for (const t of snaps) if (t <= ms) frames[t] = ring();
    runtime.kill();
    return {frames, tones, serial, error};
}
