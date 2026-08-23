/**
 * Lesson technical review bench — solve a shipped example, read real numbers.
 *
 * A lesson checkpoint asks a learner to OBSERVE something. The only way to know
 * whether the bench it names can produce that observation is to solve the
 * circuit and look. This module loads a shipped circuit through the SAME path
 * the app uses — `bw-circuit-ui`'s `Circuit.fromJSON` over a fully-registered
 * `bw-board` engine — so node voltages, branch currents and LED brightness come
 * from the engine the browser runs, not from a second model written to agree.
 *
 * Two things about it are deliberate, because both were nearly got wrong:
 *
 *   - `registerAllDevices()` runs before any board is built. A second checkout
 *     is a second device registry, and an empty registry silently produces a
 *     circuit that solves to nothing (ROADMAP, "Verify the instrument").
 *   - the circuit file comes from `examples/index.json`, never from a hardcoded
 *     `circuit.json`. Retargetable examples such as `11-toggle-button` ship ten
 *     benches and no `circuit.json` at all; guessing the filename measures a
 *     file the app never opens.
 *
 * Used by `test/lesson-bench-claims.test.mjs` and by `docs/LESSON-REVIEW-WAVE-1.md`.
 */
import {readFileSync, readdirSync, existsSync, realpathSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cui = path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui');
const bwb = path.join(root, 'overlay/scratch-gui/src/lib/bw-board');
export const EXAMPLES = path.join(root, 'overlay/scratch-gui/examples');

/**
 * Instrument check, run before the first solve.
 *
 * Everything this harness reads must live inside THIS worktree. `/tmp/lego` and
 * `/tmp/bw-board` are symlinks to the live checkouts (created 2026-08-22), so a
 * harness that resolved a sibling by relative path — or ran from a worktree
 * under /tmp — would silently measure a tree another session is editing. That
 * has produced two false readings on this project already. Cheaper to assert
 * the layout than to trust it: `existsSync` + `realpath` every input and refuse
 * to run if any of them escapes.
 */
function assertInputsAreLocal() {
    const required = [
        path.join(bwb, 'board.js'),
        path.join(bwb, 'register-all.js'),
        path.join(cui, 'engine.js'),
        path.join(cui, 'model/circuit.js'),
        path.join(cui, 'parts-data'),
        path.join(EXAMPLES, 'index.json')
    ];
    const problems = [];
    for (const file of required) {
        if (!existsSync(file)) { problems.push(`missing: ${file}`); continue; }
        const real = realpathSync(file);
        if (!real.startsWith(realpathSync(root) + path.sep)) {
            problems.push(`escapes the worktree: ${file} -> ${real}`);
        }
    }
    if (problems.length) {
        throw new Error('lesson-bench refuses to measure: its inputs are not this ' +
            `worktree's own.\n  ${problems.join('\n  ')}\n` +
            'Fix the layout rather than the assertion — a measurement taken against ' +
            'another session\'s tree is not reproducible and its failures look real.');
    }
}

let _mod = null;
export async function boot() {
    if (_mod) return _mod;
    assertInputsAreLocal();
    const {setEngine} = await import(path.join(cui, 'engine.js'));
    const {BoardImpl} = await import(path.join(bwb, 'board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(bwb, 'infer-netlist.js'));
    const {hasDevice, getDevice} = await import(path.join(bwb, 'devices.js'));
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    setEngine({BoardImpl, inferNetlist, checkWiring, hasDevice, getDevice});
    const {registerSidecar} = await import(path.join(cui, 'model/parts-registry.js'));
    for (const name of readdirSync(path.join(cui, 'parts-data'))) {
        if (!name.endsWith('.json')) continue;
        const sidecar = JSON.parse(readFileSync(path.join(cui, 'parts-data', name), 'utf8'));
        if (sidecar.kind) registerSidecar(sidecar);
    }
    const {Circuit} = await import(path.join(cui, 'model/circuit.js'));
    _mod = {Circuit, BoardImpl};
    return _mod;
}

let _index = null;
/** Resolve an example's DEFAULT circuit file exactly as index.json declares it. */
export function circuitPathFor(exampleId) {
    if (!_index) {
        const raw = JSON.parse(readFileSync(path.join(EXAMPLES, 'index.json'), 'utf8'));
        _index = new Map((Array.isArray(raw) ? raw : raw.examples).map(e => [e.id, e]));
    }
    const entry = _index.get(exampleId);
    if (!entry) throw new Error(`${exampleId}: not in examples/index.json`);
    const rel = entry.files?.circuit;
    if (!rel) throw new Error(`${exampleId}: index.json declares no circuit file`);
    return rel;
}

/** Same lookup, but `null` instead of a throw when the example ships no circuit.
 *  Nine lessons are `program-only`, and a scanner over the whole catalog has to
 *  tell "this example has no circuit" apart from "this example's circuit is
 *  broken" rather than dying on the first one it meets. */
export function circuitPathOrNull(exampleId) {
    try {
        return circuitPathFor(exampleId);
    } catch {
        return null;
    }
}

export async function load(exampleId, file) {
    const {Circuit} = await boot();
    const rel = file ? path.join(exampleId, file) : circuitPathFor(exampleId);
    const data = JSON.parse(readFileSync(path.join(EXAMPLES, rel), 'utf8'));
    const circuit = Circuit.fromJSON(data);
    if (circuit.netlistError) throw new Error(`${exampleId}: netlist rejected — ${circuit.netlistError}`);
    return {circuit, data, board: circuit.board};
}

/** net id that a given part.terminal sits on, or null */
export function netOf(board, partId, terminal) {
    for (const net of board.nets) {
        if (net.terminals.some(t => t.part === partId && t.terminal === terminal)) return net.id;
    }
    return null;
}

/** every terminal voltage in the circuit, keyed "part.terminal" */
export function terminalVolts(board) {
    const out = {};
    for (const net of board.nets) {
        const v = board.nodeVoltage(net.id);
        for (const t of net.terminals) out[`${t.part}.${t.terminal}`] = v;
    }
    return out;
}

export function report(board, label) {
    const lines = [`--- ${label}`];
    for (const net of board.nets) {
        const members = net.terminals.map(t => `${t.part}.${t.terminal}`).join(' ');
        lines.push(`  net ${net.id.padEnd(10)} V=${fmt(board.nodeVoltage(net.id))}  [${members}]`);
    }
    for (const p of board.parts) {
        if (p.kind === 'led') lines.push(`  LED ${p.id} brightness=${fmt(board.ledBrightness(p.id))}`);
    }
    return lines.join('\n');
}

export const fmt = v => (v === null || v === undefined || Number.isNaN(v) ? String(v) : Number(v).toFixed(4));
