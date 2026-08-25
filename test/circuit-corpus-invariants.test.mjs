import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cui = path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui');
const bwb = path.join(root, 'overlay/scratch-gui/src/lib/bw-board');
const examples = path.join(root, 'overlay/scratch-gui/examples');
const structuralKinds = new Set(['breadboard', 'vcc', 'gnd']);
const mcuKinds = new Set(['mcu', 'stc_mcu', 'stc15_mcu', 'arduino_uno', 'arduino_nano',
    'arduino_mega', 'pi_pico', 'attiny85', 'attiny88']);

const circuitFiles = () => {
    const result = [];
    for (const dirent of readdirSync(examples, {withFileTypes: true})) {
        if (!dirent.isDirectory()) continue;
        for (const name of readdirSync(path.join(examples, dirent.name))) {
            if (name === 'circuit.json' || /^circuit\.[\w-]+\.json$/.test(name)) {
                result.push(path.join(dirent.name, name));
            }
        }
    }
    return result.sort();
};

const endpoint = (wire, side) => {
    const raw = wire[side];
    if (raw && typeof raw === 'object') return raw.board
        ? {board: raw.board, hole: raw.hole}
        : {part: raw.part, terminal: raw.terminal};
    return {part: raw, terminal: wire[`${side}Terminal`]};
};

test('every shipped circuit resolves every wire endpoint into a real electrical net', async () => {
    assert.ok(existsSync(path.join(cui, 'model/circuit.js')));
    const {setEngine} = await import(path.join(cui, 'engine.js'));
    const {BoardImpl} = await import(path.join(bwb, 'board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(bwb, 'infer-netlist.js'));
    const {hasDevice} = await import(path.join(bwb, 'devices.js'));
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    setEngine({
        BoardImpl,
        inferNetlist,
        checkWiring,
        hasDevice
    });
    const {registerSidecar} = await import(path.join(cui, 'model/parts-registry.js'));
    for (const name of readdirSync(path.join(cui, 'parts-data'))) {
        if (!name.endsWith('.json')) continue;
        const sidecar = JSON.parse(readFileSync(path.join(cui, 'parts-data', name), 'utf8'));
        if (sidecar.kind) registerSidecar(sidecar);
    }
    const {Circuit} = await import(path.join(cui, 'model/circuit.js'));
    const {resolveTerminal} = await import(path.join(cui, 'model/terminal-aliases.js'));
    const failures = [];
    const files = circuitFiles();

    for (const rel of files) {
        const data = JSON.parse(readFileSync(path.join(examples, rel), 'utf8'));
        const sourceParts = new Map((data.parts || []).map(part => [part.id, part]));
        for (const wire of data.wires || []) for (const side of ['from', 'to']) {
            const ep = endpoint(wire, side);
            if (ep.board) {
                if (sourceParts.get(ep.board)?.kind !== 'breadboard' || !ep.hole) {
                    failures.push(`${rel}: ${side} points to missing board/hole ${ep.board || '?'}.${ep.hole || '?'}`);
                }
            } else if (!sourceParts.has(ep.part) || !ep.terminal) {
                failures.push(`${rel}: ${side} points to missing terminal ${ep.part || '?'}.${ep.terminal || '?'}`);
            }
        }
        for (const jumper of data.holeWires || []) {
            if (sourceParts.get(jumper.boardId)?.kind !== 'breadboard' || !jumper.a || !jumper.b) {
                failures.push(`${rel}: jumper ${jumper.ref || '?'} points into nowhere`);
            }
        }

        let circuit;
        try {
            circuit = Circuit.fromJSON(data);
        } catch (error) {
            failures.push(`${rel}: loader threw ${error.message}`);
            continue;
        }
        if (circuit.netlistError != null) {
            failures.push(`${rel}: engine rejected circuit (${circuit.netlistError})`);
            continue;
        }
        const parts = circuit.board?.parts || [];
        const nets = circuit.board?.nets || [];
        const loadedParts = new Map(parts.map(part => [part.id, part]));
        if (!parts.length) {
            failures.push(`${rel}: canonical board is empty`);
            continue;
        }

        for (const wire of data.wires || []) for (const side of ['from', 'to']) {
            const ep = endpoint(wire, side);
            if (ep.board) continue;
            const part = loadedParts.get(ep.part);
            const terminal = part ? resolveTerminal(part.kind, ep.terminal, part.terminals || []) : ep.terminal;
            const resolved = nets.some(net => net.terminals.some(item =>
                item.part === ep.part && item.terminal === terminal));
            if (!resolved) failures.push(`${rel}: ${side} ends in nowhere at ${ep.part}.${ep.terminal}`);
        }

        const mcu = parts.find(part => mcuKinds.has(part.kind));
        if (mcu) {
            const adjacency = new Map();
            const link = (a, b) => {
                if (!adjacency.has(a)) adjacency.set(a, new Set());
                if (!adjacency.has(b)) adjacency.set(b, new Set());
                adjacency.get(a).add(b);
                adjacency.get(b).add(a);
            };
            for (const net of nets) {
                const ids = [...new Set(net.terminals.map(item => item.part))];
                for (let i = 1; i < ids.length; i++) link(ids[0], ids[i]);
            }
            const reached = new Set([mcu.id]);
            const queue = [mcu.id];
            while (queue.length) {
                for (const next of adjacency.get(queue.shift()) || []) {
                    if (!reached.has(next)) {
                        reached.add(next);
                        queue.push(next);
                    }
                }
            }
            for (const part of parts) {
                if (!structuralKinds.has(part.kind) && part.id !== mcu.id && !reached.has(part.id)) {
                    failures.push(`${rel}: ${part.id} (${part.kind}) is unreachable from ${mcu.id}`);
                }
            }
        }

        if (!rel.startsWith('33-inductive-no-flyback/') && !rel.startsWith('pc26-motor-clamp/')) {
            for (const load of parts.filter(part => part.kind === 'dc_motor' || part.kind === 'relay')) {
                const lowTerminal = load.kind === 'relay' ? 'coil_b' : 'b';
                const highTerminal = load.kind === 'relay' ? 'coil_a' : 'a';
                const low = nets.find(net => net.terminals.some(item => item.part === load.id && item.terminal === lowTerminal));
                const high = nets.find(net => net.terminals.some(item => item.part === load.id && item.terminal === highTerminal));
                const protectedBy = parts.filter(part => part.kind === 'diode').find(diode =>
                    low?.terminals.some(item => item.part === diode.id && item.terminal === 'anode') &&
                    high?.terminals.some(item => item.part === diode.id && item.terminal === 'cathode'));
                if (!protectedBy) failures.push(`${rel}: ${load.id} lacks a correctly oriented flyback diode`);
            }
        }
    }

    // 1092 -> 1093 on 2026-08-25: pc89-rl-step, the pure RL bench that closed D8.
    // This is a floor on COVERAGE, not a claim about corpus size — it exists so a
    // glob that silently stops matching cannot report zero failures. It moves
    // only when the corpus does, and the commit that moves it says which example.
    assert.equal(files.length, 1093, 'the gate must cover the complete vendored corpus');
    assert.deepEqual(failures, []);
});

test('controller placement remains physically possible across the shipped corpus', async () => {
    const {registerSidecar} = await import(path.join(cui, 'model/parts-registry.js'));
    for (const name of readdirSync(path.join(cui, 'parts-data'))) {
        if (!name.endsWith('.json')) continue;
        const sidecar = JSON.parse(readFileSync(path.join(cui, 'parts-data', name), 'utf8'));
        if (sidecar.kind) registerSidecar(sidecar);
    }
    const {resolveSeatedParts} = await import(path.join(cui, 'interaction/seat-geometry.js'));
    const {partBounds} = await import(path.join(cui, 'interaction/hittest.js'));
    const failures = [];

    for (const rel of circuitFiles()) {
        const data = JSON.parse(readFileSync(path.join(examples, rel), 'utf8'));
        for (const part of data.parts || []) {
            if ((part.kind === 'arduino_uno' || part.kind === 'arduino_mega') && part.seat) {
                failures.push(`${rel}: ${part.id} is too large to claim a breadboard seat`);
            }
        }
        if (path.basename(rel) === 'circuit.json') continue;
        const parts = resolveSeatedParts(data.parts || []);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i];
            const b = parts[j];
            if (!a.seat || !b.seat || a.seat.boardId !== b.seat.boardId ||
                a.kind === 'breadboard' || b.kind === 'breadboard') continue;
            const aa = partBounds(a);
            const bb = partBounds(b);
            const overlapX = Math.min(aa.maxX, bb.maxX) - Math.max(aa.minX, bb.minX);
            const overlapY = Math.min(aa.maxY, bb.maxY) - Math.max(aa.minY, bb.minY);
            if (overlapX > 1 && overlapY > 1) {
                failures.push(`${rel}: ${a.id} overlaps ${b.id} by ${overlapX.toFixed(1)}x${overlapY.toFixed(1)}`);
            }
        }
    }
    assert.deepEqual(failures, []);
});
