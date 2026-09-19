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
import {GATE_DEFS, modelToVerilog, modelToCst, derivePorts} from '../../lib/bw-fpga/gate-builder.js';
import {reactFlowToModel, modelToReactFlow} from '../../lib/bw-fpga/gate-builder-rf.js';
import {gateShape} from '../../lib/bw-fpga/glyphs.js';
import {canvasToSvg} from '../../lib/bw-fpga/canvas-svg.js';
import {buildPaletteCatalog} from '../../lib/bw-fpga/palette-catalog.js';
import FpgaGatePalette, {DRAG_MIME} from './fpga-gate-palette.jsx';
import {NodeInspector, NodeContextMenu} from './fpga-node-inspector.jsx';
import {evalModel, stepClock} from '../../lib/bw-fpga/gate-eval.js';
import {EXAMPLES} from '../../lib/bw-fpga/examples.js';
import {CHALLENGES, challengeById, isUnlocked} from '../../lib/bw-fpga/challenges.js';
import {grade} from '../../lib/bw-fpga/grader.js';
import FpgaChallengePanel from './fpga-challenges.jsx';

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
// shows its live value (and an input is clickable to toggle).
const IoNode = ({data}) => {
    const isIn = data.kind === 'in';
    const live = data.live;
    const running = live !== undefined;
    return (
        <div style={{position: 'relative', padding: '6px 10px', borderRadius: 12,
            border: `1.3px solid ${running ? valueColor(live) : (isIn ? '#0284c7' : '#ca8a04')}`,
            background: isIn ? '#e0f2fe' : '#fef9c3', fontFamily: 'monospace', fontSize: 11,
            cursor: running && isIn ? 'pointer' : 'default'}}>
            {isIn ? null : <Handle type="target" position={Position.Left} id="in" style={{background: '#0284c7'}} />}
            {data.name}{data.width > 1 ? `[${data.width - 1}:0]` : ''}
            {running ? <b style={{marginLeft: 6, color: valueColor(live)}}>{String(live)}</b> : null}
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

const nodeTypes = {gate: GateNode, io: IoNode, instance: InstanceNode, memory: MemoryNode, const: ConstNode};

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
    React.useEffect(() => {
        if (seed) {
            const rf = modelToReactFlow(seed);
            setNodes(rf.nodes);
            setEdges(rf.edges);
        }
    }, [seed, setNodes, setEdges]);
    const [problems, setProblems] = React.useState([]);
    const [library, setLibrary] = React.useState([]); // saved subcircuits
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
    const addInstance = mod => setNodes(ns => [...ns, {
        id: nid('u'), type: 'instance', position: {x: 200, y: 40 + (ns.length % 6) * 45},
        data: {kind: 'instance', module: mod.name, ports: mod.ports}
    }]);

    // Only examples that carry a gate model can seed the model canvas; the
    // Verilog-only starters live in the examples browser, not the palette.
    const catalog = React.useMemo(() => buildPaletteCatalog(EXAMPLES.filter(e => e.model && e.model.nodes)), []);
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
        } else if (item.kind === 'template' && item.model) {
            // Drop a starter near the cursor, id-remapped so it MERGES onto the
            // canvas instead of clobbering whatever is already there.
            const seeded = modelToReactFlow(item.model);
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
    const onConnect = React.useCallback(params => setEdges(es => addEdge(params, es)), [setEdges]);

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
    const patchNode = (id, patch) => setNodes(ns => ns.map(n => (n.id === id ? {...n, data: {...n.data, ...patch}} : n)));
    const deleteNode = id => {
        setNodes(ns => ns.filter(n => n.id !== id));
        setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    };
    const duplicateNode = id => setNodes(ns => {
        const src = ns.find(n => n.id === id);
        if (!src) return ns;
        const copy = {...src, id: nid('c'), position: {x: src.position.x + 30, y: src.position.y + 30},
            data: {...src.data}, selected: false};
        return [...ns, copy];
    });
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
    const wire = valueColor;
    // In Run mode each wire carries its live value: coloured, the '1's animate
    // (dashes flow) and thicken, and a small label shows the bit itself.
    const shownEdges = live
        ? edges.map(e => {
            const v = live.values[e.source];
            return {...e, animated: v === 1,
                style: {stroke: wire(v), strokeWidth: v === 1 ? 2.6 : 1.8},
                label: v === undefined ? 'x' : String(v),
                labelStyle: {fill: wire(v), fontWeight: 700, fontSize: 11},
                labelBgStyle: {fill: '#ffffff', fillOpacity: 0.85},
                labelBgPadding: [2, 2], labelBgBorderRadius: 3};
        })
        : edges;
    const shownNodes = live
        ? nodes.map(n => (n.data.kind === 'in' || n.data.kind === 'out'
            ? {...n, data: {...n.data, live: n.data.kind === 'out' ? live.outputs[n.data.name] : (inputs[n.data.name] ? 1 : 0)}}
            : n))
        : nodes;
    const onNodeClick = (e, node) => {
        if (running && node.data.kind === 'in') {
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
                <button type="button" data-testid="bw-fpga-rf-clear"
                    onClick={() => { setNodes([]); setEdges([]); setCheckResult(null); }}
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
                    data-testid="bw-fpga-rf-canvas" onDrop={onDrop} onDragOver={onDragOver}>
                    <ReactFlow
                        nodes={shownNodes} edges={shownEdges}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
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
