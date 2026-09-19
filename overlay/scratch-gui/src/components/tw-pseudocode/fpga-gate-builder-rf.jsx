import React from 'react';
import {connect} from 'react-redux';
import {ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge,
    useNodesState, useEdgesState, Handle, Position} from '@xyflow/react';
// React Flow's stylesheet uses GLOBAL classes (.react-flow__*) that its own JS
// applies. scratch-webpack-configuration runs css-loader with `modules` on for
// ALL .css, which would HASH those classes and break the canvas. The `!!` prefix
// plus inline loaders bypass the configured rule and inject this one stylesheet
// globally (css-loader defaults `modules` off).
import '!!style-loader!css-loader!@xyflow/react/dist/style.css';
import {GATE_DEFS, modelToVerilog, modelToCst, derivePorts} from '../../lib/bw-fpga/gate-builder.js';
import {reactFlowToModel, modelToReactFlow} from '../../lib/bw-fpga/gate-builder-rf.js';
import {gateShape} from '../../lib/bw-fpga/glyphs.js';

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

// An input (drives, handle right) or output (sinks, handle left).
const IoNode = ({data}) => {
    const isIn = data.kind === 'in';
    return (
        <div style={{position: 'relative', padding: '6px 10px', borderRadius: 12,
            border: `1.3px solid ${isIn ? '#0284c7' : '#ca8a04'}`,
            background: isIn ? '#e0f2fe' : '#fef9c3', fontFamily: 'monospace', fontSize: 11}}>
            {isIn ? null : <Handle type="target" position={Position.Left} id="in" style={{background: '#0284c7'}} />}
            {data.name}{data.width > 1 ? `[${data.width - 1}:0]` : ''}
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

const nodeTypes = {gate: GateNode, io: IoNode, instance: InstanceNode, memory: MemoryNode};

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

    const addGate = type => setNodes(ns => [...ns, {
        id: nid('g'), type: 'gate', position: {x: 180, y: 40 + (ns.length % 6) * 40},
        data: {kind: 'gate', gtype: type, width: newWidth}
    }]);
    const addIo = kind => setNodes(ns => {
        const n = ns.filter(x => x.data.kind === kind).length + 1;
        return [...ns, {
            id: nid(kind === 'in' ? 'i' : 'o'), type: 'io',
            position: {x: kind === 'in' ? 0 : 360, y: 40 + (ns.length % 6) * 40},
            data: {kind, name: `${kind === 'in' ? 'in' : 'out'}${n}`, width: newWidth}
        }];
    });
    // A RAM defaults to a 4x4 (2-bit addr, 4-bit data) — the shape that fits the
    // header pins and is proven to place-and-route to a bitstream.
    const addMemory = () => setNodes(ns => [...ns, {
        id: nid('m'), type: 'memory', position: {x: 200, y: 40 + (ns.length % 6) * 50},
        data: {kind: 'memory', dataWidth: 4, addrWidth: 2}
    }]);
    const onConnect = React.useCallback(params => setEdges(es => addEdge(params, es)), [setEdges]);

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
            <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.4rem'}}>
                <button type="button" onClick={() => addIo('in')} style={{cursor: 'pointer'}}>{L10N[pickLocale(locale)].addInput}</button>
                <button type="button" onClick={() => addIo('out')} style={{cursor: 'pointer'}}>{L10N[pickLocale(locale)].addOutput}</button>
                <label style={{fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 3}} title={L10N[pickLocale(locale)].widthTitle}>
                    {L10N[pickLocale(locale)].width}
                    <select value={newWidth} onChange={e => setNewWidth(Number(e.target.value))} data-testid="bw-fpga-rf-width">
                        {[1, 2, 4, 8, 16].map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                </label>
                {['and', 'or', 'not', 'xor', 'nand', 'nor', 'dff'].map(t => (
                    <button key={t} type="button" onClick={() => addGate(t)} style={{cursor: 'pointer'}}>{`+ ${GATE_DEFS[t].label}`}</button>
                ))}
                <button type="button" onClick={addMemory} title={L10N[pickLocale(locale)].memoryTitle}
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-memory">{L10N[pickLocale(locale)].addMemory}</button>
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" onClick={saveSubcircuit} title={L10N[pickLocale(locale)].saveTitle}
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-save">{L10N[pickLocale(locale)].saveAsSubcircuit}</button>
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
            <div style={{height: '48vh', minHeight: 300, border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6}}
                data-testid="bw-fpga-rf-canvas">
                <ReactFlow
                    nodes={nodes} edges={edges}
                    onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                    nodeTypes={nodeTypes} fitView
                    proOptions={{hideAttribution: true}}
                >
                    <Background />
                    <Controls />
                    <MiniMap pannable zoomable />
                </ReactFlow>
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
