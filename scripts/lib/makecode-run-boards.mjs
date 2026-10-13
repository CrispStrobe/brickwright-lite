/**
 * `makecode run` for a program with several boards: every board is its own
 * emulated machine, and their radios share one simulated air.
 *
 * THE BOARDS. bw-board's `microbit-v1` and `calliope-mini-v1`: an nRF51822 with
 * Nordic's S110 SoftDevice emulated at its API, so only the application region
 * of each `.hex` is loaded (as for one board, lib/makecode-run.mjs). The air
 * is the engine's `AirBus`; each machine joins it under its board's name.
 *
 * WHAT IS OBSERVED. Per board: serial, the 5x5 matrix, and for the Calliope
 * mini the two INPUT lines of its motor driver (IN1 = P0.29, IN2 = P0.30) as
 * GPIO edges per slice. The driver and the motors are not modelled: "motor A
 * is being driven" here means "the firmware is switching IN1", nothing about
 * speed, direction or torque. Radio range, loss and timing are not modelled.
 *
 * TIME. The machines advance in turn, one guest millisecond each, so a frame
 * sent by one is on the air before the other runs its next millisecond.
 */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadEngine, v1Section} from './makecode-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUI = path.join(ROOT, 'packages', 'scratch-gui');
const bwBoard = rel => import(pathToFileURL(path.join(GUI, 'node_modules', 'bw-board', 'src', rel)).href);

/** MakeCode target -> the bw-board board that models it. */
export const BOARD_OF_TARGET = {microbit: 'microbit-v1', calliopemini: 'calliope-mini-v1'};

/** Lines worth reporting beside serial and the matrix, per board model. */
export const BOARD_LINES = {
    'calliope-mini-v1': [{name: 'motor A (IN1)', pin: 29}, {name: 'motor B (IN2)', pin: 30}]
};

const BUTTONS = {a: 'button_a', b: 'button_b'};

/** The installed bw-board or engine cannot run several boards on one air. */
export class BoardsUnsupported extends Error {
    constructor (what) {
        super(`${what} — this needs a bw-board with the Calliope mini board and the shared radio air`);
        this.code = 'NO_BOARDS_MODEL';
    }
}

/**
 * `Remote:A@1-2.5` -> hold button A of board "Remote" from 1 s to 2.5 s of
 * guest time. Throws (usage) on anything else: a press that silently did
 * nothing would read as a broken radio.
 * @returns {{board: string, button: string, from: number, to: number}}
 */
export function parsePress (spec) {
    const m = /^(.+):([abAB])@(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(String(spec));
    const fail = why => Object.assign(new Error(`--press ${spec}: ${why} (expected <Board>:<A|B>@<from>-<to>, seconds)`), {usage: true});
    if (!m) throw fail('not understood');
    const from = Number(m[3]), to = Number(m[4]);
    if (!(to > from)) throw fail('the release must come after the press');
    return {board: m[1], button: BUTTONS[m[2].toLowerCase()], from, to};
}

/** Every press names a board of the program, case-insensitively; returns them with the board's own spelling. */
export function resolvePresses (presses, names) {
    return presses.map(p => {
        const name = names.find(n => n.toLowerCase() === p.board.toLowerCase());
        if (!name) {
            throw Object.assign(new Error(`--press names board "${p.board}"; this program has ${names.join(', ')}`), {usage: true});
        }
        return {...p, board: name};
    });
}

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

const plain = v => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)])) :
    Array.isArray(v) ? v.map(plain) : v);

/**
 * Run every board for `seconds` of guest time on one air.
 *
 * @param {object} args
 * @param {Array<{name: string, target: string, hex: string}>} args.boards
 * @param {number} [args.seconds=5]
 * @param {number} [args.sliceMs=50] how often the matrix and the lines are sampled
 * @param {Array<{board: string, button: string, from: number, to: number}>} [args.presses]
 * @param {boolean} [args.sharedAir=true] false gives every board a private air (a control)
 * @param {function(object):void} [args.onEvent] {type: 'serial'|'matrix'|'line'|'press', board, t, ...} as it happens
 * @returns {Promise<{guestSeconds: number, sharedAir: boolean, boards: Array<{name: string, target: string,
 *   model: string, serial: string, frames: Array, lines: Array<{name: string, pin: number, edges: number,
 *   active: Array<{from: number, to: number}>}>, fault: object|null}>}>}
 */
export async function runBoards ({boards, seconds = 5, sliceMs = 50, presses = [], sharedAir = true, onEvent}) {
    const wasm = await loadEngine();
    const {createDebugTarget} = await bwBoard('debug-target-factory.js');
    const {LABWIRED_CATALOG, LABWIRED_BOARDS} = await bwBoard('labwired-catalog.js');
    if (typeof wasm.AirBus !== 'function') throw new BoardsUnsupported('the synced engine has no shared radio air');
    const air = sharedAir ? new wasm.AirBus() : null;
    const emit = e => { if (onEvent) onEvent(e); };

    const machines = [];
    for (const b of boards) {
        const model = BOARD_OF_TARGET[b.target];
        const board = model && LABWIRED_BOARDS[model];
        if (!board) throw new BoardsUnsupported(`no board model for ${b.name} (${b.target})`);
        const {hex} = v1Section(b.hex);
        const {target, adapter} = await createDebugTarget('labwired', {
            wasm, chip: LABWIRED_CATALOG[board.chip], firmware: new TextEncoder().encode(hex), labwiredBoard: board,
            name: b.name, labAir: sharedAir ? air : new wasm.AirBus()});
        const m = {name: b.name, target: b.target, model, engine: target, adapter, serial: '', frames: [], lastFrame: '',
            fault: null, cursor: 0,
            lines: (BOARD_LINES[model] || []).map(l => ({...l, edges: 0, active: [], open: null}))};
        adapter.onSerial(byte => {
            const c = String.fromCharCode(byte);
            m.serial += c;
            emit({type: 'serial', board: m.name, text: c});
        });
        target.onHalt(e => {
            if (!m.fault && e && e.cause !== 'user') m.fault = {cause: e.cause, message: e.message || e.summary || ''};
        });
        for (const id of Object.values(BUTTONS)) adapter.sim.set_board_io_input(id, false);
        if (m.lines.length) {
            adapter.sim.watch_logic_signals(m.lines.map(l => ({kind: 'gpio', peripheral: 'gpio0', pin: l.pin})));
        }
        target.run();
        machines.push(m);
    }
    const byName = new Map(machines.map(m => [m.name, m]));
    // Presses as edges in time order: [ms, machine, button, down].
    const edges = [];
    for (const p of presses) {
        const m = byName.get(p.board);
        if (!m) throw Object.assign(new Error(`no board named "${p.board}"`), {usage: true});
        edges.push([Math.round(p.from * 1000), m, p.button, true], [Math.round(p.to * 1000), m, p.button, false]);
    }
    edges.sort((x, y) => x[0] - y[0]);

    const totalMs = Math.max(sliceMs, Math.round(seconds * 1000));
    let next = 0;
    let ms = 0;
    const faulted = () => machines.some(m => m.fault);
    while (ms < totalMs && !faulted()) {
        while (next < edges.length && edges[next][0] <= ms) {
            const [, m, button, down] = edges[next++];
            m.adapter.sim.set_board_io_input(button, down);
            emit({type: 'press', board: m.name, button, down, t: ms / 1000});
        }
        for (const m of machines) {
            const rv = m.engine.runFor(1e6);
            if (rv === 'idle' && !m.fault) m.fault = {cause: 'stopped', message: 'the engine stopped running'};
        }
        ms++;
        if (ms % sliceMs && ms < totalMs) continue;
        const t = ms / 1000;
        for (const m of machines) {
            const rows = matrixRows(m.engine.video());
            const key = rows ? rows.join('/') : '';
            if (rows && key !== m.lastFrame) {
                m.lastFrame = key;
                const frame = {t, rows};
                m.frames.push(frame);
                emit({type: 'matrix', board: m.name, ...frame});
            }
            if (!m.lines.length) continue;
            const batch = plain(m.adapter.sim.read_logic_edges(m.cursor)) || {};
            m.cursor = batch.cursor ?? m.cursor;
            const counts = m.lines.map(() => 0);
            for (const e of batch.edges || []) if (e.ch >= 0 && e.ch < counts.length) counts[e.ch]++;
            m.lines.forEach((line, i) => {
                line.edges += counts[i];
                const switching = counts[i] > 0;
                if (switching && !line.open) {
                    line.open = {from: Math.max(0, t - sliceMs / 1000)};
                    emit({type: 'line', board: m.name, line: line.name, switching: true, t: line.open.from});
                } else if (!switching && line.open) {
                    line.active.push({from: line.open.from, to: t - sliceMs / 1000});
                    line.open = null;
                    emit({type: 'line', board: m.name, line: line.name, switching: false, t: t - sliceMs / 1000});
                }
            });
        }
    }
    const end = ms / 1000;
    return {guestSeconds: end, sharedAir, boards: machines.map(m => ({
        name: m.name, target: m.target, model: m.model, serial: m.serial, frames: m.frames, fault: m.fault,
        lines: m.lines.map(l => ({name: l.name, pin: l.pin, edges: l.edges,
            active: l.open ? [...l.active, {from: l.open.from, to: end}] : l.active}))}))};
}
