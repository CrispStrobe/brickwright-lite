/**
 * Run a MakeCode micro:bit V1 / Calliope mini firmware headless, on the same
 * LabWired engine and board model the app's Debug pane uses (task A7 of
 * docs/OPEN-TASKS-2026-09-29.md).
 *
 * THE ENGINE. The labwired-wasm artifact `npm run sync:labwiredwasm` fetches
 * into packages/scratch-gui/static/labwired/ is the WEB glue (the browser
 * bundle cannot take the nodejs one). wasm-bindgen's web glue also exports
 * initSync({module}), which instantiates from bytes with no fetch — so Node runs
 * the very artifact the app ships, verified by the same sha256, with no second
 * download. Absent, the run is refused by name (EngineMissing), never faked.
 *
 * THE BOARD. bw-board's `microbit-v1` board: an nRF51822 with Nordic's S110
 * SoftDevice EMULATED — only the application window of the .hex is loaded
 * (hex-app-region.js), so no Nordic byte ever runs — and the 5x5 LED matrix as
 * the engine's led-matrix-mux display. A micro:bit firmware is a UNIVERSAL hex
 * (one section per board family); its V1 section is cut out here. A Calliope
 * mini 1/2 firmware is a plain nRF51822 + S110 hex and runs on the same board
 * model: its 5x5 matrix shows, its own RGB LED, motor driver and pin labels are
 * not modelled (and the caller says so).
 *
 * TIME. Bounded by GUEST time (`seconds`), in slices; the matrix is sampled
 * once per slice and reported when it changes. A fault the engine detects ends
 * the run and is returned, not thrown.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUI = path.join(ROOT, 'packages', 'scratch-gui');
/** Where the synced engine lives; BW_LABWIRED_DIR overrides it (a test points it at an empty dir). */
export const engineDir = () => process.env.BW_LABWIRED_DIR || path.join(GUI, 'static', 'labwired');

export class EngineMissing extends Error {
    constructor (dir) {
        const shown = dir.startsWith(ROOT + path.sep) ? path.relative(ROOT, dir) : dir;
        super(`the LabWired engine is not synced (${shown} has no labwired_wasm.js) — run \`npm run sync:labwiredwasm\``);
        this.code = 'NO_ENGINE';
    }
}

/** micro:bit universal-hex board IDs of the V1 (nRF51822) section. */
const V1_BOARD_IDS = new Set([0x9900, 0x9901]);

/**
 * A micro:bit universal hex cut down to its V1 section, as a plain Intel HEX;
 * any other hex is returned unchanged.
 * @param {string} text Intel HEX
 * @returns {{hex: string, universal: boolean}}
 */
export function v1Section (text) {
    if (!/^:0400000A/im.test(text)) return {hex: text, universal: false};
    const out = [];
    let keep = false;
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const type = line.slice(7, 9).toUpperCase();
        if (type === '0A') { keep = V1_BOARD_IDS.has(parseInt(line.slice(9, 13), 16)); continue; }
        if (type === '0B' || type === '0C') continue;           // block end / padding
        if (type === '01') { out.push(line); break; }
        if (keep && (type === '00' || type === '02' || type === '04')) out.push(line);
    }
    if (out.length < 2) throw new Error('this universal hex has no micro:bit V1 section');
    return {hex: `${out.join('\n')}\n`, universal: true};
}

/**
 * Does this Intel HEX carry executable flash, or only an embedded MakeCode
 * project? An nRF51 firmware (V1 section or Calliope) writes address 0 (the
 * SoftDevice's vector table); a source-only .hex writes its project elsewhere.
 * @param {string} text Intel HEX
 */
export function hasFirmware (text) {
    let upper = 0;
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length < 11 || line[0] !== ':') continue;
        const type = line.slice(7, 9);
        if (type === '04') upper = parseInt(line.slice(9, 13), 16) << 16;
        if ((type === '00' || type === '0D') && upper + parseInt(line.slice(3, 7), 16) === 0) return true;
    }
    return false;
}

let engine = null;

/** The instantiated engine module (cached), or throws EngineMissing. */
export async function loadEngine () {
    if (engine) return engine;
    const dir = engineDir();
    const glue = path.join(dir, 'labwired_wasm.js');
    const wasm = path.join(dir, 'labwired_wasm_bg.wasm');
    if (!fs.existsSync(glue) || !fs.existsSync(wasm)) throw new EngineMissing(dir);
    const mod = await import(pathToFileURL(glue).href);
    mod.initSync({module: fs.readFileSync(wasm)});
    engine = mod;
    return engine;
}

const bwBoard = rel => import(pathToFileURL(path.join(GUI, 'node_modules', 'bw-board', 'src', rel)).href);

/** A matrix frame as 5 rows of '#' (lit) and '.' (dark). */
function matrixRows (frame) {
    if (!frame || !frame.rgba || !frame.width) return null;
    const rows = [];
    for (let y = 0; y < frame.height; y++) {
        let r = '';
        for (let x = 0; x < frame.width; x++) r += frame.rgba[(y * frame.width + x) * 4] > 128 ? '#' : '.';
        rows.push(r);
    }
    return rows;
}

/**
 * Run a V1 / Calliope firmware for `seconds` of guest time.
 *
 * @param {object} args
 * @param {string} args.hex Intel HEX text (a universal micro:bit hex, or a plain nRF51 hex)
 * @param {number} [args.seconds=5] guest time
 * @param {number} [args.sliceMs=50] how often the matrix is sampled, in guest ms
 * @param {function(string):void} [args.onSerial] each serial byte, as text, as it arrives
 * @param {function({t:number, rows:string[]}):void} [args.onMatrix] each changed matrix picture
 * @returns {Promise<{serial: string, frames: Array<{t:number, rows:string[]}>, fault: object|null,
 *   guestSeconds: number, universal: boolean}>}
 */
export async function runNrf51 ({hex, seconds = 5, sliceMs = 50, onSerial, onMatrix}) {
    const wasm = await loadEngine();
    const {createDebugTarget} = await bwBoard('debug-target-factory.js');
    const {LABWIRED_CATALOG, LABWIRED_BOARDS} = await bwBoard('labwired-catalog.js');
    const board = LABWIRED_BOARDS['microbit-v1'];
    const chip = LABWIRED_CATALOG[board.chip];
    const {hex: plain, universal} = v1Section(hex);
    const {target, adapter} = await createDebugTarget('labwired', {
        wasm, chip, firmware: new TextEncoder().encode(plain), labwiredBoard: board});
    let serial = '';
    adapter.onSerial(b => {
        const c = String.fromCharCode(b);
        serial += c;
        if (onSerial) onSerial(c);
    });
    let fault = null;
    target.onHalt(e => { if (!fault && e && e.cause !== 'user') fault = {cause: e.cause, message: e.message || e.summary || ''}; });
    const frames = [];
    let last = '';
    target.run();
    const slices = Math.max(1, Math.round(seconds * 1000 / sliceMs));
    let t = 0;
    for (let i = 0; i < slices && !fault; i++) {
        const rv = target.runFor(sliceMs * 1e6);
        t = (i + 1) * sliceMs / 1000;
        const rows = matrixRows(target.video());
        const key = rows ? rows.join('/') : '';
        if (rows && key !== last) {
            last = key;
            const frame = {t, rows};
            frames.push(frame);
            if (onMatrix) onMatrix(frame);
        }
        if (rv === 'idle' && !fault) fault = {cause: 'stopped', message: 'the engine stopped running'};
    }
    return {serial, frames, fault, guestSeconds: t, universal};
}
