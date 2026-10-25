/**
 * Run Lite's `circuitplayground` extension (the vendored bundle, exactly the
 * bytes the GUI loads) headless, on a virtual clock, so a test can hold it
 * against pxt-adafruit's simulator (scripts/lib/makecode-adafruit-sim.mjs)
 * on the same timeline (task A9).
 *
 *   const r = await runCpxExtension(async (ext, wait) => {
 *       ext.setall({COLOR: 'red'});
 *       await wait(100);
 *   }, {ms: 1000, at: [50, 500], inputs: [{t: 200, button: 'A', down: true}]});
 *   r.frames  // {50: [10 x 0xRRGGBB], ...} — the ring as the LEDs emit it
 *   r.tones   // [{t, frequency, ms}] — every tone the speaker played
 *
 * The driver is the program: it calls block methods (awaiting the blocking
 * ones, as a Scratch thread does) and `wait(ms)` for MakeCode's pause.
 * Hat blocks are collected from runtime.startHats and handed to `onHat`, so a
 * test can run a handler's blocks when the matching event fires. Inputs go
 * through the extension's own input API, as Lite's CPX pane does.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CPX_BUNDLE = path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/circuitplayground/index.js');

/** The extension's source: the JSON string the bundle hands to makeExt. */
export const cpxExtensionSource = () => {
    const bundle = fs.readFileSync(CPX_BUNDLE, 'utf8');
    const m = /makeExt\(("(?:[^"\\]|\\.)*")\);/s.exec(bundle);
    if (!m) throw new Error('circuitplayground bundle has no makeExt("…") source string');
    return JSON.parse(m[1]);
};

/**
 * @param {(ext: object, wait: (ms: number) => Promise<void>) => Promise<void>} driver
 * @param {object} [opts]
 * @param {number} [opts.ms] how long to run, virtual
 * @param {number[]} [opts.at] virtual times at which to snapshot the ring
 * @param {object[]} [opts.inputs] {t, button|switchRight|light|temperature|sound, …}
 * @param {(opcode: string, fields: object, ext: object, wait: Function) => Promise<void>|void} [opts.onHat]
 * @returns {Promise<{frames: object, tones: object[], error: ?string}>}
 */
export async function runCpxExtension (driver, {ms = 3000, at = [], inputs = [], onHat = null} = {}) {
    const START = 1000000;
    let now = START;
    const timers = [];
    let seq = 0;
    const later = (fn, wait) => {
        const id = ++seq;
        timers.push({id, at: now + Math.max(0, Number(wait) | 0), fn});
        return id;
    };
    const cancel = id => {
        const i = timers.findIndex(t => t.id === id);
        if (i >= 0) timers.splice(i, 1);
    };
    class VirtualDate extends Date {
        constructor (...a) {
            if (a.length) super(...a);
            else super(now);
        }
        static now () {
            return now;
        }
    }
    let error = null;
    const pending = [];
    const runtime = {
        on () {},
        emit () {},
        targets: [],
        startHats: (opcode, fields) => {
            if (onHat) pending.push(Promise.resolve(onHat(opcode, fields, ext, wait)).catch(e => { error = String(e); }));
        }
    };
    let ext = null;
    const ctx = {
        Scratch: {
            vm: {runtime},
            extensions: {register: e => { ext = e; }},
            BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
            ArgumentType: {NUMBER: 'number', STRING: 'string'}
        },
        setTimeout: (fn, wait, ...a) => later(() => fn(...a), wait),
        clearTimeout: cancel,
        Date: VirtualDate,
        Promise, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, parseInt, isNaN
    };
    vm.createContext(ctx);
    vm.runInContext(cpxExtensionSource(), ctx, {filename: 'circuitplayground.js'});
    const wait = t => new Promise(resolve => later(resolve, t));

    for (const input of inputs) {
        later(() => {
            if (input.button) ext.setButton(input.button, Boolean(input.down));
            if ('switchRight' in input) ext.setSwitch(input.switchRight);
            if ('light' in input) ext.setLightLevel(input.light);
            if ('temperature' in input) ext.setTemperature(input.temperature);
            if ('sound' in input) ext.setSoundLevel(input.sound);
            if (input.acceleration) ext.setAcceleration(...input.acceleration);
            if (input.gesture) ext.gesture(input.gesture);
        }, input.t);
    }

    const frames = {};
    const snaps = [...at].sort((a, b) => a - b);
    // The extension runs in its own vm realm; hand back this realm's arrays
    // and objects, or deepStrictEqual sees different prototypes.
    const ring = () => Array.from(ext.ring.shown(), Number);
    const run = Promise.resolve().then(() => driver(ext, wait)).catch(e => { error = String((e && e.stack) || e); });
    const settle = async () => {
        for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
    };
    const end = START + ms;
    for (let guard = 0; guard < 1e6 && !error; guard++) {
        await settle();
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        while (snaps.length && (!next || START + snaps[0] < next.at || next.at > end)) {
            if (START + snaps[0] > end) break;
            frames[snaps.shift()] = ring();
        }
        if (!next || next.at > end) break;
        timers.shift();
        now = Math.max(now, next.at);
        next.fn();
    }
    for (const t of snaps) if (t <= ms) frames[t] = ring();
    void run;
    await Promise.race([Promise.all(pending), settle()]);
    const tones = Array.from(ext.toneLog, e => ({t: e.at - START, frequency: Number(e.frequency), ms: Number(e.ms)}));
    return {frames, tones, error};
}
