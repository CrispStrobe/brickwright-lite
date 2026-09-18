/**
 * A synthesised design, as a picture: the Verilog you wrote, turned into the
 * gates it actually compiled to.
 *
 * This is the visual analog the FPGA tab was missing. The whole app is about
 * seeing and manipulating, and every other surface is visual — the Circuit
 * canvas, the Code tab's blocks — while the FPGA tab was a Verilog textbox. HDL
 * is not a Scratch script (concurrent, structural), so the honest visual analog
 * is not blocks: it is a SCHEMATIC. yosys2digitaljs already turns a Yosys
 * netlist into a gate graph (`{devices, connectors}`); this module turns that
 * graph into a layout-agnostic MODEL — nodes with sided ports, edges carrying
 * their net name — that a renderer lays out (elkjs) and draws (SVG), and that
 * a signal view can light by net value.
 *
 * It reads the digitaljs graph, NOT the raw Yosys JSON, so it needs no bit-level
 * net bookkeeping and stays testable without yosys2digitaljs: a hand-written
 * `{devices, connectors}` is a valid input.
 *
 * @module
 */

// digitaljs device type -> how to draw it. `glyph` is the symbol on the box;
// `kind` groups IO/constant/gate for styling. Types not listed fall back to a
// box labelled with the type, so an unrecognised cell is shown honestly rather
// than dropped.
const GATE_GLYPHS = {
    And: '&', Nand: '&', Or: '≥1', Nor: '≥1',
    Xor: '=1', Xnor: '=1', Not: '1', Repeater: '', Constant: '',
    Mux: 'MUX', Dff: 'DFF', Eq: '=', Ne: '≠',
    Lt: '<', Le: '≤', Gt: '>', Ge: '≥',
    Addition: '+', Subtraction: '−', Multiplication: '×',
    ShiftLeft: '≪', ShiftRight: '≫',
    Negation: '−', UnaryAnd: '&', UnaryOr: '≥1', UnaryXor: '=1'
};

// Gates whose output is logically inverted — drawn with a bubble on the output.
const INVERTING = new Set(['Nand', 'Nor', 'Xnor', 'Not']);

/** Which side of a box a port sits on, from its name. digitaljs names a gate's
 *  single output `out`; everything else (in1, in2, in, clk, arst, sel, …) is an
 *  input. Deriving it this way needs no per-cell port schema. */
function portSide (name) {
    return (name === 'out' || /^out\d*$/.test(name)) ? 'out' : 'in';
}

/**
 * Build a layout-agnostic schematic model from a digitaljs circuit.
 *
 * @param {{devices: object, connectors: Array}} circuit  yosys2digitaljs output
 * @returns {{nodes: Array, edges: Array, problems: Array}}
 *   nodes: {id, kind:'input'|'output'|'constant'|'gate', type, glyph, label,
 *           inverting, ports:[{id, name, side:'in'|'out'}]}
 *   edges: {id, net, from:{node, port}, to:{node, port}}
 */
export function buildSchematicModel (circuit) {
    const devices = (circuit && circuit.devices) || {};
    const connectors = (circuit && circuit.connectors) || [];
    const problems = [];

    // Collect the ports each device actually uses, and which side they are on.
    const ports = new Map(); // devId -> Map(portName -> side)
    const usePort = (devId, name, side) => {
        if (!ports.has(devId)) ports.set(devId, new Map());
        // An 'out' side wins if a name is ambiguous — a driver is a driver.
        const cur = ports.get(devId).get(name);
        if (cur !== 'out') ports.get(devId).set(name, side);
    };
    for (const c of connectors) {
        if (c.from && c.from.id != null) usePort(c.from.id, c.from.port, 'out');
        if (c.to && c.to.id != null) usePort(c.to.id, c.to.port, 'in');
    }

    const nodes = [];
    for (const [id, dev] of Object.entries(devices)) {
        const type = dev.type || 'Unknown';
        let kind = 'gate';
        if (type === 'Input') kind = 'input';
        else if (type === 'Output') kind = 'output';
        else if (type === 'Constant') kind = 'constant';
        // Inputs/Outputs are labelled by their net; gates by their instance
        // label if any, else nothing (the glyph carries the meaning).
        const label = (kind === 'input' || kind === 'output')
            ? (dev.net || dev.label || id)
            : (dev.label || '');
        const glyph = Object.prototype.hasOwnProperty.call(GATE_GLYPHS, type)
            ? GATE_GLYPHS[type]
            : type; // unknown cell: show its type name, do not hide it
        const portList = [...(ports.get(id) || new Map()).entries()]
            .map(([name, side]) => ({id: `${id}.${name}`, name, side}));
        // An IO device with no connector still deserves its single port, so it
        // renders as a real terminal rather than a bare box.
        if (!portList.length) {
            if (kind === 'input' || kind === 'constant') portList.push({id: `${id}.out`, name: 'out', side: 'out'});
            else if (kind === 'output') portList.push({id: `${id}.in`, name: 'in', side: 'in'});
        }
        nodes.push({id, kind, type, glyph,
            label: String(label),
            inverting: INVERTING.has(type),
            bits: dev.bits || 1,
            ports: portList});
    }

    const edges = [];
    let n = 0;
    for (const c of connectors) {
        if (!c.from || !c.to) { problems.push({code: 'dangling-connector'}); continue; }
        edges.push({
            id: `e${n++}`,
            net: c.name || '',
            from: {node: c.from.id, port: `${c.from.id}.${c.from.port}`},
            to: {node: c.to.id, port: `${c.to.id}.${c.to.port}`}
        });
    }

    return {nodes, edges, problems};
}

// Box sizes. IO terminals are wider (they carry a name); gates are compact.
export const NODE_SIZE = {
    input: {w: 62, h: 26}, output: {w: 62, h: 26}, constant: {w: 40, h: 26},
    gate: {w: 46, h: 40}
};

/**
 * Turn the model into an ELK graph (nodes with sided ports + edges). Kept
 * separate from the semantic model so the model can be tested without a layout
 * engine, and so the ELK options live in one place.
 *
 * @param {{nodes: Array, edges: Array}} model
 * @returns {object} an elkjs graph
 */
export function toElkGraph (model) {
    const children = model.nodes.map(node => {
        const size = NODE_SIZE[node.kind] || NODE_SIZE.gate;
        return {
            id: node.id,
            width: size.w,
            height: Math.max(size.h, node.ports.length * 12 + 8),
            properties: {'org.eclipse.elk.portConstraints': 'FIXED_SIDE'},
            ports: node.ports.map(p => ({
                id: p.id,
                properties: {'org.eclipse.elk.port.side': p.side === 'out' ? 'EAST' : 'WEST'}
            }))
        };
    });
    return {
        id: 'root',
        layoutOptions: {
            'org.eclipse.elk.algorithm': 'layered',
            'org.eclipse.elk.direction': 'RIGHT',
            'org.eclipse.elk.spacing.nodeNode': '24',
            'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '44',
            'org.eclipse.elk.spacing.edgeNode': '12',
            'org.eclipse.elk.edgeRouting': 'ORTHOGONAL'
        },
        children,
        edges: model.edges.map(e => ({
            id: e.id,
            sources: [e.from.port],
            targets: [e.to.port]
        }))
    };
}
