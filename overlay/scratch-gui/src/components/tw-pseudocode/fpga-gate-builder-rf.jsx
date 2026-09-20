import React from 'react';
import {connect} from 'react-redux';
import {ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge,
    useNodesState, useEdgesState, useReactFlow, Handle, Position} from '@xyflow/react';
// React Flow's stylesheet uses GLOBAL classes (.react-flow__*) that its own JS
// applies. scratch-webpack-configuration runs css-loader with `modules` on for
// ALL .css, which would HASH those classes and break the canvas. The `!!` prefix
// plus inline loaders bypass the configured rule and inject this one stylesheet
// globally (css-loader defaults `modules` off).
import '!!style-loader!css-loader!@xyflow/react/dist/style.css';
import {GATE_DEFS, modelToVerilog, modelToCst, derivePorts, parseVerilogPorts} from '../../lib/bw-fpga/gate-builder.js';
import {reactFlowToModel, modelToReactFlow} from '../../lib/bw-fpga/gate-builder-rf.js';
import {gateShape} from '../../lib/bw-fpga/glyphs.js';
import {canvasToSvg} from '../../lib/bw-fpga/canvas-svg.js';
import {buildPaletteCatalog} from '../../lib/bw-fpga/palette-catalog.js';
import FpgaGatePalette, {DRAG_MIME} from './fpga-gate-palette.jsx';
import {NodeInspector, NodeContextMenu} from './fpga-node-inspector.jsx';
import {evalModel, stepClock} from '../../lib/bw-fpga/gate-eval.js';
import {EXAMPLES} from '../../lib/bw-fpga/examples.js';
import {BUILTINS} from '../../lib/bw-fpga/builtins.js';
import {sevenSegSvg, seg7Value, ledValue, ledBankValues} from '../../lib/bw-fpga/output-devices.js';
import {layerPositions} from '../../lib/bw-fpga/auto-layout.js';
import {CHALLENGES, challengeById, isUnlocked} from '../../lib/bw-fpga/challenges.js';
import {grade} from '../../lib/bw-fpga/grader.js';
import FpgaChallengePanel from './fpga-challenges.jsx';
import TruthTableModal from './fpga-truth-table.jsx';

const PROGRESS_KEY = 'bw-fpga-progress';
const loadProgress = () => {
    try { return new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]')); } catch (e) { return new Set(); }
};
const saveProgress = set => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify([...set])); } catch (e) { /* private mode: keep in memory */ }
};

// The gate glyphs are shared with the CLI/schematic renderer; their classes are
// styled once here, scoped under `.bw-glyph` so they never touch the rest of the app.
const GLYPH_CSS = `
.bw-glyph .gate{fill:#fff;stroke:#334155;stroke-width:2}
.bw-glyph .gate-line{fill:none;stroke:#334155;stroke-width:2;stroke-linecap:round}
.bw-glyph .bus-tap{fill:#0284c7;stroke:none}
.bw-glyph .gate-op{font:700 20px Arial,sans-serif;fill:#111;text-anchor:middle;dominant-baseline:middle}
.bw-glyph .gate-label{font:700 11px Arial,sans-serif;fill:#111;text-anchor:middle;dominant-baseline:middle}
.bw-glyph .bus-label{font:9px Arial,sans-serif;fill:#64748b;text-anchor:middle}`;

const L10N = {
    en: {
        addInput: '+ Input',
        addOutput: '+ Output',
        width: 'width',
        widthTitle: 'Bit width of the next node — >1 makes a bus',
        addMemory: '+ RAM',
        memoryTitle: 'A synchronous single-port RAM (4×4, fits the board pins)',
        saveAsSubcircuit: '⤓ Save as subcircuit',
        saveTitle: 'Save this whole design as a reusable subcircuit',
        yourBlocks: 'Your blocks:',
        portsTitle: 'ports:',
        useAsVerilog: '⤵ Use as Verilog',
        hint: 'drag to place, connect a green output to a blue input, then synthesise',
        errNoPorts: 'Add inputs and outputs before saving a subcircuit — they become its ports.'
    },
    de: {
        addInput: '+ Eingang',
        addOutput: '+ Ausgang',
        width: 'Breite',
        widthTitle: 'Bitbreite des nächsten Knotens — >1 erzeugt einen Bus',
        addMemory: '+ RAM',
        memoryTitle: 'Ein synchroner Single-Port-RAM (4×4, passt auf die Board-Pins)',
        saveAsSubcircuit: '⤓ Als Teilschaltung speichern',
        saveTitle: 'Speichere diesen gesamten Entwurf als wiederverwendbare Teilschaltung',
        yourBlocks: 'Deine Blöcke:',
        portsTitle: 'Ports:',
        useAsVerilog: '⤵ Als Verilog verwenden',
        hint: 'Ziehen zum Platzieren, verbinde einen grünen Ausgang mit einem blauen Eingang, dann synthetisieren',
        errNoPorts: 'Füge Ein- und Ausgänge hinzu, bevor du eine Teilschaltung speicherst — sie werden deren Ports.'
    }
};
const pickLocale = loc => (loc && L10N[String(loc).slice(0, 2)] ? String(loc).slice(0, 2) : 'en');

/**
 * The gate builder on a real node/wire canvas — React Flow (MIT). Drag, pan,
 * zoom, a minimap, and handles you connect; the design that synthesises is still
 * OUR model, produced by the tested bridge and fed to the tested Verilog
 * generator. This is the scalable canvas the hand-rolled SVG could not become,
 * and the foundation for hierarchy/buses/memory.
 *
 * Loaded lazily (React Flow is ~heavy) and only behind the FPGA flag.
 */

// A logic gate: input handles down the left (one per port), one output right.
// A gate drawn with the SHARED glyph (the same shape the CLI/schematic use), so
// an AND looks like an AND on the canvas too — not a labelled box.
const GATE_W = 60;
const GateNode = ({data}) => {
    const def = GATE_DEFS[data.gtype] || {ins: ['a', 'b']};
    const ins = def.ins || [];
    const height = Math.max(40, ins.length * 16 + 12);
    const shape = gateShape({type: data.gtype, x: 0, y: 0, width: GATE_W, height});
    return (
        <div style={{position: 'relative', width: GATE_W, height}}>
            {ins.map((p, i) => (
                <Handle key={p} type="target" position={Position.Left} id={p}
                    style={{top: `${((i + 1) / (ins.length + 1)) * 100}%`, background: '#0284c7'}} />
            ))}
            <svg className="bw-glyph" width={GATE_W} height={height} viewBox={`0 0 ${GATE_W} ${height}`}
                style={{display: 'block', overflow: 'visible'}}
                dangerouslySetInnerHTML={{__html: shape}} />
            <Handle type="source" position={Position.Right} id="out" style={{background: '#22c55e'}} />
        </div>
    );
};

// The colour a logic value reads as: 1 live-green, 0 grey, unknown pale.
const valueColor = v => (v === 1 || v === '1' ? '#16a34a' : v === 0 || v === '0' ? '#94a3b8' : '#cbd5e1');

// An input (drives, handle right) or output (sinks, handle left). In Run mode it
// shows its live value; a 1-bit input toggles on click, and a BUS input (width>1)
// takes a real multi-bit number in a field — so the arithmetic/compare/mux family
// actually computes, not just 0/1 logic. The colour reads 1-bit levels; a bus
// value shows as its number.
const IoNode = ({data}) => {
    const isIn = data.kind === 'in';
    const live = data.live;
    const running = live !== undefined;
    const w = data.width || 1;
    const editable = isIn && running && w > 1;
    const max = w < 31 ? (1 << w) - 1 : Number.MAX_SAFE_INTEGER;
    const swatch = w === 1 ? valueColor(live) : (isIn ? '#0284c7' : '#ca8a04');
    return (
        <div style={{position: 'relative', padding: '6px 10px', borderRadius: 12,
            border: `1.3px solid ${running ? swatch : (isIn ? '#0284c7' : '#ca8a04')}`,
            background: isIn ? '#e0f2fe' : '#fef9c3', fontFamily: 'monospace', fontSize: 11,
            cursor: running && isIn && w === 1 ? 'pointer' : 'default'}}>
            {isIn ? null : <Handle type="target" position={Position.Left} id="in" style={{background: '#0284c7'}} />}
            {data.name}{w > 1 ? `[${w - 1}:0]` : ''}
            {editable ? (
                <input type="number" min={0} max={max} value={String(live)} className="nodrag"
                    data-testid={`bw-fpga-rf-inval-${data.name}`}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                        const v = Math.max(0, Math.min(max, parseInt(e.target.value, 10) || 0));
                        if (data.setValue) data.setValue(v);
                    }}
                    style={{width: Math.max(38, String(max).length * 10 + 18), marginLeft: 6,
                        fontFamily: 'monospace', fontSize: 11}} />
            ) : (running ? <b style={{marginLeft: 6, color: valueColor(live)}}>{String(live)}</b> : null)}
            {isIn ? <Handle type="source" position={Position.Right} id="out" style={{background: '#22c55e'}} /> : null}
        </div>
    );
};

// A subcircuit instance: input handles down the left, output handles down the
// right, one per the module's ports. The module name is the label.
const InstanceNode = ({data}) => {
    const ports = data.ports || [];
    const ins = ports.filter(p => p.dir === 'in');
    const outs = ports.filter(p => p.dir === 'out');
    return (
        <div style={{position: 'relative', minWidth: 74, minHeight: Math.max(40, ports.length * 14 + 8),
            padding: '6px 10px', border: '1.6px double #7c3aed', borderRadius: 6, background: '#faf5ff',
            textAlign: 'center', fontSize: 11, fontWeight: 'bold'}}>
            {ins.map((p, i) => (
                <Handle key={`i${p.name}`} type="target" position={Position.Left} id={p.name}
                    style={{top: `${((i + 1) / (ins.length + 1)) * 100}%`, background: '#0284c7'}} />
            ))}
            <span>{data.module}</span>
            {outs.map((p, i) => (
                <Handle key={`o${p.name}`} type="source" position={Position.Right} id={p.name}
                    style={{top: `${((i + 1) / (outs.length + 1)) * 100}%`, background: '#22c55e'}} />
            ))}
        </div>
    );
};

// A synchronous single-port RAM: clk/addr/din/we in on the left, the registered
// read data (dout) out on the right. The label shows its geometry (words x bits).
const MEM_INS = ['clk', 'addr', 'din', 'we'];
const MemoryNode = ({data}) => {
    const dw = data.dataWidth || 4;
    const aw = data.addrWidth || 2;
    return (
        <div style={{position: 'relative', minWidth: 84, minHeight: MEM_INS.length * 14 + 10,
            padding: '6px 10px', border: '1.6px solid #0f766e', borderRadius: 6, background: '#f0fdfa',
            textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#0f766e'}}>
            {MEM_INS.map((p, i) => (
                <Handle key={p} type="target" position={Position.Left} id={p}
                    style={{top: `${((i + 1) / (MEM_INS.length + 1)) * 100}%`, background: '#0284c7'}} />
            ))}
            <div>{'\u25A6 RAM'}</div>
            <div style={{fontWeight: 'normal', opacity: 0.75}}>{`${1 << aw}\u00D7${dw}`}</div>
            {data.live !== undefined ? (
                <div style={{fontWeight: 'normal', fontFamily: 'monospace', color: '#0369a1'}}>
                    {'dout '}<b>{String(data.live)}</b>
                </div>
            ) : null}
            <Handle type="source" position={Position.Right} id="dout" style={{top: '50%', background: '#22c55e'}} />
        </div>
    );
};

// A constant source: drives a fixed value (double-click to edit). No inputs.
const ConstNode = ({data}) => (
    <div style={{position: 'relative', padding: '6px 12px', borderRadius: 4,
        border: '1.4px solid #7c3aed', background: '#f5f3ff', fontFamily: 'monospace',
        fontSize: 13, fontWeight: 'bold', color: '#6d28d9'}}>
        {data.value != null ? String(data.value) : '0'}
        <Handle type="source" position={Position.Right} id="out" style={{background: '#22c55e'}} />
    </div>
);

// A tunnel: a NAMED net. Every tunnel with the same name is one wire, so a
// signal wired into one is read from the others — no drawn wire between them.
const TunnelNode = ({data}) => (
    <div style={{position: 'relative', padding: '5px 14px 5px 10px', borderRadius: 3,
        border: '1.4px solid #0891b2', background: '#ecfeff', fontFamily: 'monospace',
        fontSize: 11, color: '#0e7490', clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)'}}>
        <Handle type="target" position={Position.Left} id="in" style={{background: '#0284c7'}} />
        {'⤷ '}{data.name || 'net'}
        <Handle type="source" position={Position.Right} id="out" style={{background: '#22c55e'}} />
    </div>
);

// An LED output device — a viewing instrument, not logic. One input; in Run mode
// it glows when the wire feeding it is 1 (data.live = 1|0|undefined).
const LedNode = ({data}) => {
    const on = data.live === 1;
    const known = data.live === 1 || data.live === 0;
    return (
        <div style={{position: 'relative', width: 44, height: 44, borderRadius: '50%',
            border: `2px solid ${on ? '#dc2626' : '#94a3b8'}`,
            background: on ? 'radial-gradient(circle at 35% 30%, #fecaca, #ef4444 70%)' : (known ? '#f1f5f9' : '#f8fafc'),
            boxShadow: on ? '0 0 12px 3px rgba(239,68,68,0.6)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: on ? '#7f1d1d' : '#94a3b8', fontWeight: 'bold'}}>
            <Handle type="target" position={Position.Left} id="in" style={{background: '#0284c7'}} />
            {'LED'}
        </div>
    );
};

// A seven-segment display — an instrument reading four input bits (d0..d3) and
// showing the hex digit (via the SHARED seven-segment face). data.value is set
// in Run mode from the live values on its inputs.
const Seg7Node = ({data}) => {
    const value = typeof data.value === 'number' ? data.value : null;
    const svg = sevenSegSvg(value == null ? {} : value);
    return (
        <div style={{position: 'relative', padding: '6px 8px', border: '1.6px solid #334155',
            borderRadius: 6, background: '#0f172a'}}>
            {/* A single BUS wire on top feeds the whole value; the per-bit d0..d3
                on the left still work for hand-built logic. */}
            <Handle type="target" position={Position.Top} id="d" style={{left: '50%', background: '#22c55e'}} />
            {['d0', 'd1', 'd2', 'd3'].map((p, i) => (
                <Handle key={p} type="target" position={Position.Left} id={p}
                    style={{top: `${((i + 1) / 5) * 100}%`, background: '#0284c7'}} />
            ))}
            <svg width={34} height={54} viewBox="0 0 100 160" style={{display: 'block'}}
                dangerouslySetInnerHTML={{__html: svg}} />
        </div>
    );
};

// An LED bank — several bits shown at once as a row of lamps (one device rather
// than N separate LEDs). data.bits input handles; data.live is a per-bit array.
const LedBankNode = ({data}) => {
    const bits = data.bits || 4;
    const live = data.live || [];
    return (
        <div style={{position: 'relative', display: 'flex', gap: 4, padding: '8px 8px',
            border: '1.6px solid #334155', borderRadius: 6, background: '#0f172a'}}>
            {/* A single BUS wire on the left lights all lamps from its bits; the
                per-bit d0..d(n-1) on top still work for hand-built logic. */}
            <Handle type="target" position={Position.Left} id="d" style={{top: '50%', background: '#22c55e'}} />
            {Array.from({length: bits}, (_, i) => {
                const on = live[i] === 1;
                const known = live[i] === 1 || live[i] === 0;
                return (
                    <div key={i} style={{position: 'relative'}}>
                        <Handle type="target" position={Position.Top} id={`d${i}`}
                            style={{background: '#0284c7', left: '50%'}} />
                        <div style={{width: 16, height: 16, borderRadius: '50%',
                            border: `1.5px solid ${on ? '#f87171' : '#475569'}`,
                            background: on ? 'radial-gradient(circle at 35% 30%, #fecaca, #ef4444 70%)' : (known ? '#1e293b' : '#0b1220'),
                            boxShadow: on ? '0 0 8px 2px rgba(239,68,68,0.6)' : 'none'}} />
                    </div>
                );
            })}
        </div>
    );
};

const nodeTypes = {gate: GateNode, io: IoNode, instance: InstanceNode, memory: MemoryNode, const: ConstNode, tunnel: TunnelNode, led: LedNode, seg7: Seg7Node, ledbank: LedBankNode};

// A starter so the canvas is not blank: a AND b → y.
const STARTER = () => modelToReactFlow({
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 'g', kind: 'gate', type: 'and'}, {id: 'y', kind: 'out', name: 'y'}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
        {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]
}, {a: {x: 0, y: 20}, b: {x: 0, y: 110}, g: {x: 160, y: 60}, y: {x: 300, y: 60}});

const InnerBuilder = ({onUseVerilog, seed, locale}) => {
    const start = React.useMemo(() => (seed ? modelToReactFlow(seed) : STARTER()), [seed]);
    const [nodes, setNodes, onNodesChange] = useNodesState(start.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(start.edges);

    // ── Undo / redo ──────────────────────────────────────────────────────────
    // Snapshot the canvas BEFORE each discrete edit (place, connect, delete,
    // move, generate…); Ctrl-Z steps back, Ctrl-Shift-Z / Ctrl-Y forward. Refs
    // hold the latest nodes/edges so a snapshot captures the pre-edit state
    // without waiting for React to flush the setter.
    const nodesRef = React.useRef(nodes);
    const edgesRef = React.useRef(edges);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    const pastRef = React.useRef([]);
    const futureRef = React.useRef([]);
    const [, bumpHist] = React.useReducer(x => x + 1, 0);
    const takeSnapshot = React.useCallback(() => {
        pastRef.current.push({nodes: nodesRef.current, edges: edgesRef.current});
        if (pastRef.current.length > 100) pastRef.current.shift();
        futureRef.current = [];
        bumpHist();
    }, []);
    const undo = React.useCallback(() => {
        const prev = pastRef.current.pop();
        if (!prev) return;
        futureRef.current.push({nodes: nodesRef.current, edges: edgesRef.current});
        setNodes(prev.nodes); setEdges(prev.edges); bumpHist();
    }, [setNodes, setEdges]);
    const redo = React.useCallback(() => {
        const next = futureRef.current.pop();
        if (!next) return;
        pastRef.current.push({nodes: nodesRef.current, edges: edgesRef.current});
        setNodes(next.nodes); setEdges(next.edges); bumpHist();
    }, [setNodes, setEdges]);

    React.useEffect(() => {
        if (seed) {
            const rf = modelToReactFlow(seed);
            setNodes(rf.nodes);
            setEdges(rf.edges);
        }
    }, [seed, setNodes, setEdges]);
    const [problems, setProblems] = React.useState([]);
    const [library, setLibrary] = React.useState([]); // saved subcircuits + code blocks
    const [codeOpen, setCodeOpen] = React.useState(false); // the Verilog code-block editor
    const [ttOpen, setTtOpen] = React.useState(false); // the truth-table → circuit modal
    const CODE_STARTER = 'module my_block(input a, input b, output y);\n  assign y = a & b;\nendmodule\n';
    const [codeText, setCodeText] = React.useState(CODE_STARTER);
    const [codeErr, setCodeErr] = React.useState('');
    const [newWidth, setNewWidth] = React.useState(1); // bit width for the next node
    const [inspect, setInspect] = React.useState(null); // {id, x, y} of the node being edited
    const [menu, setMenu] = React.useState(null); // {target:'node'|'edge', id, x, y}
    const [running, setRunning] = React.useState(false); // live-simulation mode
    const [inputs, setInputs] = React.useState({}); // live input values, by input name
    const [clockState, setClockState] = React.useState({}); // dff state for stepClock
    const [showLearn, setShowLearn] = React.useState(false); // learning-path panel
    const [active, setActive] = React.useState(null); // active challenge id
    const [passed, setPassed] = React.useState(loadProgress); // completed challenge ids
    const [checkResult, setCheckResult] = React.useState(null);
    const idRef = React.useRef(100);
    const nid = p => `${p}${idRef.current++}`;

    // Save the whole canvas as a reusable subcircuit — the composition primitive.
    const saveSubcircuit = () => {
        const model = reactFlowToModel(nodes, edges);
        const ports = derivePorts(model);
        if (!ports.length) { setProblems([{reason: L10N[pickLocale(locale)].errNoPorts}]); return; }
        const base = 'block';
        let n = 1;
        const names = new Set(library.map(m => m.name));
        while (names.has(`${base}${n}`)) n++;
        setLibrary(lib => [...lib, {name: `${base}${n}`, nodes: model.nodes, edges: model.edges, ports}]);
    };
    // A Code block is a subcircuit defined by raw Verilog (icestudio-style): parse
    // its ports so it wires up, add it to the library, and it instantiates like any
    // saved block — the generator emits the Verilog verbatim.
    const addCodeBlock = () => {
        const {name, ports} = parseVerilogPorts(codeText);
        if (!ports.length) { setCodeErr('No input/output ports found — declare them in the module header.'); return; }
        if (library.some(m => m.name === name)) { setCodeErr(`A block named "${name}" already exists — rename the module.`); return; }
        setLibrary(lib => [...lib, {name, ports, verilog: codeText}]);
        setCodeErr('');
        setCodeOpen(false);
    };
    const addInstance = mod => setNodes(ns => [...ns, {
        id: nid('u'), type: 'instance', position: {x: 200, y: 40 + (ns.length % 6) * 45},
        data: {kind: 'instance', module: mod.name, ports: mod.ports}
    }]);

    // Only examples that carry a gate model can seed the model canvas; the
    // Verilog-only starters live in the examples browser, not the palette.
    const catalog = React.useMemo(() => buildPaletteCatalog(EXAMPLES.filter(e => e.model && e.model.nodes), BUILTINS), []);
    const rf = useReactFlow();
    // The canvas is often mounted inside a collapsed <details> (zero height), so
    // React Flow's mount-time fitView fits nothing and the design is off-screen —
    // the "empty canvas" bug. Re-fit whenever the container gains/changes size.
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        const el = canvasRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => {
            if (el.clientHeight > 0 && el.clientWidth > 0) {
                try { rf.fitView({padding: 0.2, duration: 0}); } catch (e) { /* not ready yet */ }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [rf]);

    // Turn a palette drag descriptor into a canvas node at `position`. A RAM
    // defaults to a 4x4 (2-bit addr, 4-bit data) — the shape that fits the
    // header pins and is proven to place-and-route to a bitstream.
    const placeNode = (item, position) => {
        takeSnapshot();
        if (item.kind === 'gate') {
            setNodes(ns => [...ns, {id: nid('g'), type: 'gate', position, data: {kind: 'gate', gtype: item.gtype, width: newWidth}}]);
        } else if (item.kind === 'in' || item.kind === 'out') {
            setNodes(ns => {
                const n = ns.filter(x => x.data.kind === item.kind).length + 1;
                return [...ns, {id: nid(item.kind === 'in' ? 'i' : 'o'), type: 'io', position,
                    data: {kind: item.kind, name: `${item.kind === 'in' ? 'in' : 'out'}${n}`, width: newWidth}}];
            });
        } else if (item.kind === 'memory') {
            setNodes(ns => [...ns, {id: nid('m'), type: 'memory', position, data: {kind: 'memory', dataWidth: 4, addrWidth: 2}}]);
        } else if (item.kind === 'const') {
            setNodes(ns => [...ns, {id: nid('k'), type: 'const', position, data: {kind: 'const', value: 1}}]);
        } else if (item.kind === 'tunnel') {
            setNodes(ns => {
                const n = ns.filter(x => x.data.kind === 'tunnel').length + 1;
                return [...ns, {id: nid('t'), type: 'tunnel', position, data: {kind: 'tunnel', name: `net${n}`}}];
            });
        } else if (item.kind === 'led') {
            setNodes(ns => [...ns, {id: nid('led'), type: 'led', position, data: {kind: 'led'}}]);
        } else if (item.kind === 'seg7') {
            setNodes(ns => [...ns, {id: nid('seg'), type: 'seg7', position, data: {kind: 'seg7'}}]);
        } else if (item.kind === 'ledbank') {
            setNodes(ns => [...ns, {id: nid('bank'), type: 'ledbank', position, data: {kind: 'ledbank', bits: item.bits || 4}}]);
        } else if (item.kind === 'template' && item.model) {
            // Drop a starter near the cursor, id-remapped so it MERGES onto the
            // canvas instead of clobbering whatever is already there. Lay it out
            // as a schematic (a big block like the 7-seg decoder is unreadable in
            // the bridge's zig-zag).
            const seeded = modelToReactFlow(item.model, layerPositions(item.model));
            const idMap = {};
            const placed = seeded.nodes.map(n => {
                const id = nid('t');
                idMap[n.id] = id;
                return {...n, id, position: {x: (n.position ? n.position.x : 0) + position.x,
                    y: (n.position ? n.position.y : 0) + position.y}};
            });
            const wired = seeded.edges.map((e, i) => ({...e, id: `te${idRef.current}_${i}`,
                source: idMap[e.source] || e.source, target: idMap[e.target] || e.target}));
            setNodes(ns => [...ns, ...placed]);
            setEdges(es => [...es, ...wired]);
        }
    };

    const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const onDrop = e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        let item;
        try { item = JSON.parse(raw); } catch (err) { return; }
        placeNode(item, rf.screenToFlowPosition({x: e.clientX, y: e.clientY}));
    };
    const onConnect = React.useCallback(params => { takeSnapshot(); setEdges(es => addEdge(params, es)); }, [setEdges, takeSnapshot]);

    // Keyboard on the canvas: Ctrl-Z undo, Ctrl-Shift-Z / Ctrl-Y redo, and a
    // snapshot just before React Flow deletes the selection (capture phase fires
    // before its own Delete/Backspace handler).
    const onCanvasKeyDown = e => {
        const meta = e.ctrlKey || e.metaKey;
        if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { takeSnapshot(); }
    };

    // Load a freshly synthesised (or otherwise built) model onto the canvas.
    const loadModel = model => {
        takeSnapshot();
        // Lay the generated design out as a schematic (inputs left → output
        // right, gates by depth) instead of the bridge's naive zig-zag.
        const seeded = modelToReactFlow(model, layerPositions(model));
        setNodes(seeded.nodes);
        setEdges(seeded.edges);
        setTtOpen(false);
        // The generated design lands at fresh positions, so the previous fit
        // region no longer frames it — without this its gates sit off-screen
        // (LOOK-verified: a generated XOR showed only its I/O). Fit once React
        // Flow has measured the new nodes (a frame later).
        setTimeout(() => { try { rf.fitView({padding: 0.2, duration: 300}); } catch (e) { /* not ready */ } }, 60);
    };

    // Export the canvas as a standalone SVG — the SAME nodes/glyphs/wires shown,
    // at their live positions. A CLI-inspectable snapshot of the design.
    const exportSvg = () => {
        const model = reactFlowToModel(nodes, edges, library);
        const positions = Object.fromEntries(nodes.map(n => [n.id, n.position]));
        const svg = canvasToSvg(model, positions);
        const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
        const a = document.createElement('a');
        a.href = url; a.download = 'fpga-canvas.svg';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Editing a placed node: double-click opens the inspector; a patch merges
    // into node.data (the bridge reads width/name/dataWidth/addrWidth from there).
    const patchNode = (id, patch) => { takeSnapshot(); setNodes(ns => ns.map(n => (n.id === id ? {...n, data: {...n.data, ...patch}} : n))); };
    const deleteNode = id => {
        takeSnapshot();
        setNodes(ns => ns.filter(n => n.id !== id));
        setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    };
    const duplicateNode = id => { takeSnapshot(); return setNodes(ns => {
        const src = ns.find(n => n.id === id);
        if (!src) return ns;
        const copy = {...src, id: nid('c'), position: {x: src.position.x + 30, y: src.position.y + 30},
            data: {...src.data}, selected: false};
        return [...ns, copy];
    }); };
    const onNodeDoubleClick = (e, node) => setInspect({id: node.id, x: e.clientX, y: e.clientY});
    const onNodeContextMenu = (e, node) => { e.preventDefault(); setInspect(null); setMenu({target: 'node', id: node.id, x: e.clientX, y: e.clientY}); };
    const onEdgeContextMenu = (e, edge) => { e.preventDefault(); setInspect(null); setMenu({target: 'edge', id: edge.id, x: e.clientX, y: e.clientY}); };
    const inspectNode = inspect && nodes.find(n => n.id === inspect.id);

    // Live simulation: evaluate the current design and paint values onto the
    // canvas. Primitive gates + flip-flops evaluate; buses/memory/instances stay
    // unknown (the tested graceful-degradation boundary) and read pale.
    const live = React.useMemo(() => {
        if (!running) return null;
        try { return evalModel(reactFlowToModel(nodes, edges), inputs, clockState); } catch (e) { return null; }
    }, [running, nodes, edges, inputs, clockState]);
    // A wire is "live" when it carries a nonzero value — a 1-bit high OR a bus
    // with a nonzero number — so a bus mid-computation reads as active, not idle.
    const isLive = v => v !== undefined && v !== 'x' && v !== 0 && v !== '0';
    const wire = v => (isLive(v) ? '#16a34a' : v === 0 || v === '0' ? '#94a3b8' : '#cbd5e1');
    // In Run mode each wire carries its live value: coloured, the live ones animate
    // (dashes flow) and thicken, and a small label shows the value (a bit or a bus).
    const shownEdges = live
        ? edges.map(e => {
            const v = live.values[e.source];
            return {...e, animated: isLive(v),
                style: {stroke: wire(v), strokeWidth: isLive(v) ? 2.6 : 1.8},
                label: v === undefined ? 'x' : String(v),
                labelStyle: {fill: wire(v), fontWeight: 700, fontSize: 11},
                labelBgStyle: {fill: '#ffffff', fillOpacity: 0.85},
                labelBgPadding: [2, 2], labelBgBorderRadius: 3};
        })
        : edges;
    const shownNodes = live
        ? nodes.map(n => {
            const k = n.data.kind;
            if (k === 'out') return {...n, data: {...n.data, live: live.outputs[n.data.name]}};
            if (k === 'in') {
                const w = n.data.width || 1;
                const raw = Number(inputs[n.data.name]) || 0;
                const val = w === 1 ? (raw ? 1 : 0) : (w < 31 ? (raw & ((1 << w) - 1)) >>> 0 : raw);
                return {...n, data: {...n.data, live: val,
                    setValue: v => setInputs(prev => ({...prev, [n.data.name]: v}))}};
            }
            if (k === 'led') return {...n, data: {...n.data, live: ledValue(n.id, edges, live.values)}};
            if (k === 'seg7') return {...n, data: {...n.data, value: seg7Value(n.id, edges, live.values)}};
            if (k === 'ledbank') return {...n, data: {...n.data, live: ledBankValues(n.id, edges, live.values, n.data.bits || 4)}};
            if (k === 'memory') return {...n, data: {...n.data, live: live.values[n.id]}};
            return n;
        })
        : nodes;
    const onNodeClick = (e, node) => {
        // A 1-bit input toggles on click; a bus input is set through its number field.
        if (running && node.data.kind === 'in' && (node.data.width || 1) === 1) {
            setInputs(prev => ({...prev, [node.data.name]: prev[node.data.name] ? 0 : 1}));
        }
    };
    const stepClk = () => setClockState(prev => stepClock(reactFlowToModel(nodes, edges), inputs, prev));

    // Learning path: selecting a challenge scaffolds a clean canvas with just its
    // named inputs and outputs; Check grades the built design and, on a pass,
    // records progress (unlocking the next step).
    const selectChallenge = id => {
        const c = challengeById(id);
        if (!c) return;
        setActive(id);
        setCheckResult(null);
        setRunning(false);
        idRef.current += 1;
        const ins = c.inputs.map((p, i) => ({id: nid('i'), type: 'io',
            position: {x: 0, y: 20 + i * 60}, data: {kind: 'in', name: p.name, width: 1}}));
        const outs = c.outputs.map((p, i) => ({id: nid('o'), type: 'io',
            position: {x: 360, y: 20 + i * 60}, data: {kind: 'out', name: p.name, width: 1}}));
        setNodes([...ins, ...outs]);
        setEdges([]);
    };
    const runCheck = () => {
        const c = challengeById(active);
        if (!c) return;
        const result = grade(reactFlowToModel(nodes, edges), c);
        setCheckResult(result);
        if (result.pass && !passed.has(active)) {
            const next = new Set(passed); next.add(active);
            setPassed(next); saveProgress(next);
        }
    };
    // Jump to the next still-unsolved, unlocked challenge after the current one.
    const goNext = () => {
        const after = new Set(passed); if (active) after.add(active);
        const start = active ? CHALLENGES.findIndex(c => c.id === active) + 1 : 0;
        const order = [...CHALLENGES.slice(start), ...CHALLENGES.slice(0, start)];
        const nextC = order.find(c => !after.has(c.id) && isUnlocked(c.id, after));
        if (nextC) selectChallenge(nextC.id);
    };

    const generate = () => {
        const model = reactFlowToModel(nodes, edges, library);
        const {verilog, problems: probs} = modelToVerilog(model);
        const {cst} = modelToCst(model);
        setProblems(probs);
        if (onUseVerilog) onUseVerilog(verilog, cst);
    };

    return (
        <div>
            <style>{GLYPH_CSS}</style>
            {ttOpen ? <TruthTableModal onGenerate={loadModel} onClose={() => setTtOpen(false)} /> : null}
            {codeOpen ? (
                <div data-testid="bw-fpga-code-modal" style={{position: 'fixed', inset: 0, zIndex: 300,
                    background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                    onMouseDown={() => setCodeOpen(false)}>
                    <div onMouseDown={e => e.stopPropagation()} style={{background: '#fff', borderRadius: 8, padding: 16,
                        width: 'min(560px, 92vw)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
                        <div style={{fontWeight: 'bold', marginBottom: 6}}>{'Verilog code block'}</div>
                        <div style={{fontSize: 12, color: '#64748b', marginBottom: 8}}>
                            {'Write a Verilog module; its ports are read from the header. It becomes a reusable block.'}
                        </div>
                        <textarea value={codeText} onChange={e => setCodeText(e.target.value)} spellCheck={false}
                            data-testid="bw-fpga-code-text" rows={9}
                            style={{width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12,
                                border: '1px solid #94a3b8', borderRadius: 4, padding: 8}} />
                        {codeErr ? <div style={{color: '#b91c1c', fontSize: 12, marginTop: 4}}>{codeErr}</div> : null}
                        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10}}>
                            <button type="button" onClick={() => setCodeOpen(false)} style={{cursor: 'pointer'}}>{'Cancel'}</button>
                            <button type="button" onClick={addCodeBlock} data-testid="bw-fpga-code-add"
                                style={{cursor: 'pointer', fontWeight: 'bold', border: '1px solid #7c3aed',
                                    borderRadius: 6, background: '#faf5ff', color: '#6d28d9', padding: '4px 12px'}}
                            >{'Add block'}</button>
                        </div>
                    </div>
                </div>
            ) : null}
            <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.4rem', alignItems: 'center'}}>
                <span style={{fontSize: '0.8rem', opacity: 0.75}}>{'drag a part from the palette →'}</span>
                <label style={{fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 3}} title={L10N[pickLocale(locale)].widthTitle}>
                    {L10N[pickLocale(locale)].width}
                    <select value={newWidth} onChange={e => setNewWidth(Number(e.target.value))} data-testid="bw-fpga-rf-width">
                        {[1, 2, 4, 8, 16].map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                </label>
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" onClick={saveSubcircuit} title={L10N[pickLocale(locale)].saveTitle}
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-save">{L10N[pickLocale(locale)].saveAsSubcircuit}</button>
                <button type="button" onClick={() => { setCodeErr(''); setCodeOpen(true); }}
                    title="Add a block written in raw Verilog (icestudio-style)"
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-code">{'</> Code'}</button>
                <button type="button" onClick={() => setTtOpen(true)}
                    title="Generate a circuit from a truth table (combinational analysis)"
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-tt">{'⊞ Truth table'}</button>
                <button type="button" data-testid="bw-fpga-rf-undo"
                    onClick={undo} disabled={!pastRef.current.length}
                    title="Undo (Ctrl-Z)" style={{cursor: pastRef.current.length ? 'pointer' : 'default'}}>{'↶ Undo'}</button>
                <button type="button" data-testid="bw-fpga-rf-redo"
                    onClick={redo} disabled={!futureRef.current.length}
                    title="Redo (Ctrl-Shift-Z)" style={{cursor: futureRef.current.length ? 'pointer' : 'default'}}>{'↷ Redo'}</button>
                <button type="button" data-testid="bw-fpga-rf-clear"
                    onClick={() => { takeSnapshot(); setNodes([]); setEdges([]); setCheckResult(null); }}
                    title="Clear the canvas" style={{cursor: 'pointer'}}>{'🗑 Clear'}</button>
                <button type="button" data-testid="bw-fpga-rf-svg" onClick={exportSvg}
                    title="Export the canvas as an SVG" style={{cursor: 'pointer'}}>{'⤓ SVG'}</button>
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" data-testid="bw-fpga-rf-learn"
                    onClick={() => setShowLearn(s => !s)}
                    title="A guided path of build-it-yourself challenges, auto-graded"
                    style={{cursor: 'pointer', fontWeight: 'bold', color: showLearn ? '#1d4ed8' : undefined}}
                >{showLearn ? '📘 Learning ✓' : '📘 Learn'}</button>
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" data-testid="bw-fpga-rf-run"
                    onClick={() => { setRunning(r => !r); setInspect(null); setMenu(null); }}
                    title="Simulate live — click inputs to toggle, wires colour by value"
                    style={{cursor: 'pointer', fontWeight: 'bold', color: running ? '#16a34a' : undefined}}
                >{running ? '■ Stop' : '▶ Run'}</button>
                {running ? (
                    <button type="button" onClick={stepClk} data-testid="bw-fpga-rf-clock"
                        title="Advance one clock edge (flip-flops)" style={{cursor: 'pointer'}}>{'⟳ Clock'}</button>
                ) : null}
                {running ? (
                    <span style={{fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 8}}>
                        <span style={{opacity: 0.7}}>{'click an input to toggle'}</span>
                        <span style={{color: '#16a34a', fontWeight: 700}}>{'1'}</span>
                        <span style={{color: '#94a3b8', fontWeight: 700}}>{'0'}</span>
                        <span style={{color: '#cbd5e1', fontWeight: 700}}>{'x'}</span>
                    </span>
                ) : null}
            </div>
            {library.length ? (
                <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.4rem', alignItems: 'center'}}>
                    <span style={{fontSize: '0.8rem', opacity: 0.75}}>{L10N[pickLocale(locale)].yourBlocks}</span>
                    {library.map(mod => (
                        <button key={mod.name} type="button" onClick={() => addInstance(mod)}
                            title={`${L10N[pickLocale(locale)].portsTitle} ${mod.ports.map(p => p.name).join(', ')}`}
                            data-testid={`bw-fpga-rf-lib-${mod.name}`}
                            style={{cursor: 'pointer', border: '1px solid #7c3aed', borderRadius: 10, padding: '0.1rem 0.5rem', background: '#faf5ff'}}
                        >{`+ ${mod.name}`}</button>
                    ))}
                </div>
            ) : null}
            <div style={{display: 'flex', alignItems: 'stretch'}}>
                {showLearn ? (
                    <FpgaChallengePanel active={active} passed={passed} result={checkResult}
                        onSelect={selectChallenge} onCheck={runCheck} onNext={goNext} />
                ) : null}
                <FpgaGatePalette catalog={catalog} />
                <div ref={canvasRef} style={{flex: '1 1 auto', height: '48vh', minHeight: 300, border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6}}
                    data-testid="bw-fpga-rf-canvas" onDrop={onDrop} onDragOver={onDragOver} onKeyDownCapture={onCanvasKeyDown}>
                    <ReactFlow
                        nodes={shownNodes} edges={shownEdges}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                        onNodeDragStart={() => takeSnapshot()}
                        onInit={inst => { try { inst.fitView({padding: 0.2}); } catch (e) { /* no-op */ } }}
                        onNodeClick={onNodeClick}
                        onNodeDoubleClick={onNodeDoubleClick} onNodeContextMenu={onNodeContextMenu}
                        onEdgeContextMenu={onEdgeContextMenu} onPaneClick={() => { setMenu(null); setInspect(null); }}
                        nodeTypes={nodeTypes} fitView
                        snapToGrid snapGrid={[16, 16]} deleteKeyCode={['Backspace', 'Delete']}
                        proOptions={{hideAttribution: true}}
                    >
                        <Background />
                        <Controls />
                        <MiniMap pannable zoomable />
                    </ReactFlow>
                </div>
                {inspectNode ? (
                    <NodeInspector node={inspectNode} x={inspect.x} y={inspect.y}
                        onChange={patchNode} onClose={() => setInspect(null)} />
                ) : null}
                {menu ? (
                    <NodeContextMenu target={menu.target} x={menu.x} y={menu.y}
                        onClose={() => setMenu(null)}
                        onDelete={() => (menu.target === 'edge'
                            ? setEdges(es => es.filter(e => e.id !== menu.id))
                            : deleteNode(menu.id))}
                        onDuplicate={() => duplicateNode(menu.id)} />
                ) : null}
            </div>
            <div style={{margin: '0.5rem 0'}}>
                <button type="button" onClick={generate} style={{padding: '0.35rem 0.8rem', cursor: 'pointer', fontWeight: 'bold'}}
                >{L10N[pickLocale(locale)].useAsVerilog}</button>
                <span style={{marginLeft: '0.5rem', fontSize: '0.8rem', opacity: 0.75}}>
                    {L10N[pickLocale(locale)].hint}
                </span>
            </div>
            {problems.length ? (
                <ul style={{listStyle: 'none', padding: 0, margin: '0.25rem 0'}}>
                    {problems.map((p, i) => <li key={i} style={{color: '#b34747', fontSize: '0.8rem'}}>{p.reason || p.code}</li>)}
                </ul>
            ) : null}
        </div>
    );
};

const FpgaGateBuilderRf = props => (
    <ReactFlowProvider>
        <InnerBuilder {...props} />
    </ReactFlowProvider>
);

export default connect(state => ({locale: state.locales && state.locales.locale}))(FpgaGateBuilderRf);
