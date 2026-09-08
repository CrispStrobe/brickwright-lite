/** Fixed-profile editor-shaped draft. Not a production Circuit.fromJSON input. */
import {load} from './runtime.js';
import {createHarrisMemoryBoard} from './engine/experimental/harris-80c286-memory-board.js';

const clone = value => JSON.parse(JSON.stringify(value));
const gate = enabled => { if (enabled !== true) throw new Error('EXPERIMENT_DISABLED'); };
const refuse = message => { throw new Error(`UNSUPPORTED_EDITOR_DRAFT: ${message}`); };
function keys(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) refuse('unexpected or missing fields');
}
const kindFor = type => `harris_lab_${type}`;
let pinLists;
function pins() {
    if (!pinLists) {
        const board = createHarrisMemoryBoard({enabled: true});
        pinLists = new Map([...board.circuit.parts].map(([id, part]) => [id, [...part.pins]]));
    }
    return pinLists;
}

export function toEditorDraft(recipe, {enabled = false} = {}) {
    gate(enabled);
    const verified = load(recipe).exportConfiguration();
    const {parts, wires, ...configuration} = verified;
    return {format: 'bw-experimental-editor-circuit', version: 1, configuration,
        circuit: {vcc: 5, holeWires: [],
            parts: parts.map((part, index) => ({id: part.id, kind: kindFor(part.type), params: {},
                terminals: [...pins().get(part.id)], x: (index % 4) * 180,
                y: Math.floor(index / 4) * 180, rotation: 0})),
            wires: wires.map((wire, index) => ({id: `wire_${index}`,
                from: {part: wire.from, terminal: wire.fromTerminal},
                to: {part: wire.to, terminal: wire.toTerminal}}))}};
}

export function fromEditorDraft(draft, {enabled = false} = {}) {
    gate(enabled);
    keys(draft, ['format', 'version', 'configuration', 'circuit']);
    if (draft.format !== 'bw-experimental-editor-circuit' || draft.version !== 1) refuse('unknown format/version');
    keys(draft.configuration, ['format', 'version', 'profile', 'backend', 'romLowAlias', 'rom']);
    const circuit = draft.circuit;
    keys(circuit, ['vcc', 'holeWires', 'parts', 'wires']);
    if (circuit.vcc !== 5 || !Array.isArray(circuit.holeWires) || circuit.holeWires.length) refuse('power or breadboard jumpers');
    if (!Array.isArray(circuit.parts) || circuit.parts.length !== pins().size ||
        !Array.isArray(circuit.wires) || circuit.wires.length > 4096) refuse('part/wire inventory');
    const ids = new Set();
    const parts = circuit.parts.map(part => {
        keys(part, ['id', 'kind', 'params', 'terminals', 'x', 'y', 'rotation']);
        keys(part.params, []);
        if (!pins().has(part.id) || ids.has(part.id)) refuse('unknown or duplicate part');
        ids.add(part.id);
        if (!Number.isFinite(part.x) || !Number.isFinite(part.y) ||
            Math.abs(part.x) > 1000000 || Math.abs(part.y) > 1000000 ||
            ![0, 90, 180, 270].includes(part.rotation)) refuse('invalid layout');
        if (!Array.isArray(part.terminals) || part.terminals.length !== pins().get(part.id).length ||
            new Set(part.terminals).size !== part.terminals.length ||
            part.terminals.some(pin => !pins().get(part.id).includes(pin))) refuse('terminal list differs from engine');
        if (typeof part.kind !== 'string' || !part.kind.startsWith('harris_lab_')) refuse('non-experimental part');
        return {id: part.id, type: part.kind.slice('harris_lab_'.length)};
    });
    const wireIds = new Set();
    const wires = circuit.wires.map(wire => {
        keys(wire, ['id', 'from', 'to']);
        if (typeof wire.id !== 'string' || !/^[\w-]{1,64}$/.test(wire.id) || wireIds.has(wire.id)) refuse('wire identity');
        wireIds.add(wire.id);
        for (const endpoint of [wire.from, wire.to]) {
            keys(endpoint, ['part', 'terminal']);
            if (!ids.has(endpoint.part) || !pins().get(endpoint.part).includes(endpoint.terminal)) refuse('unknown wire endpoint');
        }
        return {from: wire.from.part, fromTerminal: wire.from.terminal,
            to: wire.to.part, toTerminal: wire.to.terminal};
    });
    // The engine validates backend/profile/inventory as well as electrical topology.
    // No aliases, dropped wires or implicit part substitutions are permitted.
    return load({...clone(draft.configuration), parts, wires}).exportConfiguration();
}
