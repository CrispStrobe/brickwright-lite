/**
 * Run a MicroPython program in lite's OWN micro:bit simulator firmware —
 * overlay/scratch-gui/static/microbit-sim/build/firmware.{js,wasm}, the
 * MicroPython build the Code tab's simulator pane runs — headless, in Node.
 *
 * WHY. "generateMicroPython succeeded" is not "the program runs". Measured on
 * MakeCode's 206 compiling doc apps as lite imported them (2026-09-27): all
 * 206 generated, and 111 of them stopped at their first step in this
 * firmware (a yield-less task the scheduler could not drive, `import json`
 * that the simulator build does not have, `_radio_last_num` never defined).
 * Only running the program says so.
 *
 * HOW. The firmware is an Emscripten module that calls out to a `board`
 * object for every peripheral (the simulator page's board/*.ts). This file is
 * that board with no page behind it: a 5x5 pixel array, buttons, a radio that
 * delivers scheduled packets, a serial log, and a filesystem holding main.py.
 * Time is VIRTUAL — every sleep advances the clock and resumes at once — so a
 * five-second program runs in about a second, and deterministically.
 *
 *   const r = await runOnMicrobitFirmware(py, {ms: 5000, radio: [[300, '5']]});
 *   r.traceback   // the Python error that stopped it, or null
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIRMWARE_DIR = path.join(ROOT, 'overlay/scratch-gui/static/microbit-sim/build');

let firmware = null;
const load = () => {
    if (!firmware) {
        firmware = {
            js: fs.readFileSync(path.join(FIRMWARE_DIR, 'firmware.js'), 'utf8'),
            wasm: fs.readFileSync(path.join(FIRMWARE_DIR, 'firmware.wasm'))
        };
    }
    return firmware;
};

/** The simulator's flash filesystem (board/fs.ts), enough for main.py. */
class FileSystem {
    constructor () {
        this.files = [];
    }
    create (name) {
        const at = this.find(name);
        const file = {name, bytes: new Uint8Array(0)};
        if (at >= 0) {
            this.files[at] = file;
            return at;
        }
        this.files.push(file);
        return this.files.length - 1;
    }
    find (name) {
        return this.files.findIndex(f => f && f.name === name);
    }
    name (i) {
        return this.files[i] ? this.files[i].name : undefined; // eslint-disable-line no-undefined
    }
    size (i) {
        return this.files[i].bytes.length;
    }
    remove (i) {
        this.files[i] = null;
    }
    readbyte (i, offset) {
        const f = this.files[i];
        return f && offset < f.bytes.length ? f.bytes[offset] : -1;
    }
    write (i, data) {
        const f = this.files[i];
        const grown = new Uint8Array(f.bytes.length + data.length);
        grown.set(f.bytes);
        grown.set(data, f.bytes.length);
        f.bytes = grown;
        return true;
    }
}

/**
 * @param {string} py the program (main.py)
 * @param {object} [opts]
 * @param {number} [opts.ms] virtual milliseconds to run for
 * @param {Array<[number, string]>} [opts.radio] packets: [arrival ms, text]
 * @param {object} [opts.buttons] {a: true, b: true} held down throughout
 * @returns {Promise<{out: string, traceback: ?string, panic: ?number, pixels: number[][], sent: string[], ended: string}>}
 */
export async function runOnMicrobitFirmware (py, {ms = 5000, radio = [], buttons = {}} = {}) {
    const {js, wasm} = load();
    let clock = 0;
    let module = null;
    let ended = null;
    let finish;
    const finished = new Promise(resolve => {
        finish = resolve;
    });
    const end = why => {
        if (!ended) {
            ended = why;
            finish();
        }
    };
    const serial = [];
    const sent = [];
    const pixels = Array.from({length: 5}, () => [0, 0, 0, 0, 0]);
    const inbox = radio.slice();
    let rxQueue = null;
    let panic = null;

    // Every other peripheral: present, quiet, reading 0.
    const quiet = () => new Proxy(function () {}, {get: (t, k) => (k === 'value' ? 0 : quiet()), apply: () => 0});
    const button = key => ({isPressed: () => !!buttons[key], getAndClearPresses: () => 0});
    const board = new Proxy({
        initialize () {},
        stopComponents () {},
        ticksMilliseconds: () => clock,
        writeSerialOutput (text) {
            serial.push(text);
            // main.py is over (or died) and MicroPython has fallen into its REPL.
            if (/>>> $/.test(serial.join('').slice(-8))) end('repl');
        },
        readSerialInput: () => -1,
        throwPanic (code) {
            panic = code;
            throw new Error(`panic ${code}`);
        },
        throwReset () {
            throw new Error('reset');
        },
        writeRadioRxBuffer (packet) {
            const at = module._microbit_radio_rx_buffer();
            module.HEAPU8.set(packet, at);
            return at;
        },
        buttons: [button('a'), button('b'), button('logo')],
        pins: Array.from({length: 32}, () => new Proxy({}, {get: () => () => 0})),
        display: {
            setPixel: (x, y, v) => {
                pixels[y][x] = v;
            },
            getPixel: (x, y) => pixels[y][x],
            clear: () => pixels.forEach(row => row.fill(0)),
            lightLevel: {value: 0}
        },
        accelerometer: {setRange () {}, state: {accelerometerX: {value: 0}, accelerometerY: {value: 0},
            accelerometerZ: {value: -1024}, gesture: {value: 'none'}}},
        compass: {getFieldStrength: () => 0, state: {compassHeading: {value: 0}, compassX: {value: 0},
            compassY: {value: 0}, compassZ: {value: 0}}},
        temperature: {value: 21},
        microphone: {microphoneOn () {}, setThreshold () {}, soundLevel: {value: 0}},
        radio: {
            enable () {
                rxQueue = [];
            },
            disable () {
                rxQueue = null;
            },
            updateConfig () {},
            send (data) {
                sent.push(Buffer.from(data).toString('latin1'));
            },
            peek () {
                // A due packet, framed as the simulator's radio frames it; the
                // 01 00 01 header is MicroPython's for a radio.send(str).
                while (rxQueue && inbox.length && inbox[0][0] <= clock) {
                    const payload = Buffer.concat([Buffer.from([1, 0, 1]), Buffer.from(inbox.shift()[1], 'latin1')]);
                    const packet = new Uint8Array(payload.length + 6);
                    packet[0] = payload.length;
                    packet.set(payload, 1);
                    packet[1 + payload.length] = 127;
                    rxQueue.push(packet);
                }
                return rxQueue ? rxQueue[0] : undefined; // eslint-disable-line no-undefined
            },
            pop () {
                if (rxQueue) rxQueue.shift();
            }
        },
        audio: quiet(),
        dataLogging: quiet()
    }, {get: (t, k) => (k in t ? t[k] : quiet())});

    const context = {
        console: {log () {}, warn () {}, error () {}},
        // Virtual time: a sleep of N ms moves the clock N ms and resumes now.
        setTimeout (fn, wait) {
            if (ended) return 0;
            clock += Math.max(0, Number(wait) || 0);
            if (clock > ms) {
                end('time');
                return 0;
            }
            setImmediate(() => {
                if (!ended) fn();
            });
            return 0;
        },
        clearTimeout () {},
        setImmediate,
        performance: {now: () => clock},
        TextDecoder,
        TextEncoder,
        WebAssembly,
        Uint8Array,
        Promise,
        Date
    };
    context.window = context;
    context.self = context;
    vm.createContext(context);
    vm.runInContext(`${js}\n;this.createModule = createModule;`, context, {filename: 'firmware.js'});
    const files = new FileSystem();
    files.write(files.create('main.py'), new TextEncoder().encode(py));
    module = await context.createModule({
        board,
        fs: files,
        conversions: {
            convertAccelerometerStringToNumber: () => -1,
            convertSoundThresholdNumberToString: () => 'low',
            convertAudioBuffer: () => {}
        },
        noInitialRun: true,
        instantiateWasm (imports, done) {
            WebAssembly.instantiate(wasm, imports).then(r => done(r.instance));
            return {};
        }
    });
    let error = null;
    const guard = setTimeout(() => end('wall clock'), 30000);
    module.cwrap('mp_js_main', 'null', ['number'], {async: true})(64 * 1024)
        .then(() => end('returned'), e => {
            error = String((e && e.message) || e);
            end('threw');
        });
    await finished;
    clearTimeout(guard);
    // The program's own output: not the REPL banner it falls into after main.py.
    const out = serial.join('').replace(/MicroPython v\d[\s\S]*$/, '');
    const at = out.indexOf('Traceback');
    return {
        out,
        traceback: at >= 0 ? out.slice(at).replace(/MicroPython v[\s\S]*$/, '').trim() : null,
        panic,
        error,
        pixels,
        sent,
        ended
    };
}
