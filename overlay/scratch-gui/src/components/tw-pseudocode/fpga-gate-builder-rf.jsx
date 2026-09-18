import React from 'react';
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
const GateNode = ({data}) => {
    const def = GATE_DEFS[data.gtype] || {glyph: data.gtype, ins: ['a', 'b']};
    const ins = def.ins || [];
    return (
        <div style={{position: 'relative', width: 52, minHeight: 40, padding: '4px 2px',
            border: '1.3px solid #475569', borderRadius: 4, background: '#ffffff',
            textAlign: 'center', fontWeight: 'bold', fontSize: 13}}>
            {ins.map((p, i) => (
                <Handle key={p} type="target" position={Position.Left} id={p}
                    style={{top: `${((i + 1) / (ins.length + 1)) * 100}%`, background: '#0284c7'}} />
            ))}
            <span>{def.glyph || data.gtype}</span>
            {def.inverting ? <span style={{color: '#94a3b8'}}>{'○'}</span> : null}
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

const nodeTypes = {gate: GateNode, io: IoNode, instance: InstanceNode};

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

const InnerBuilder = ({onUseVerilog}) => {
    const start = React.useMemo(STARTER, []);
    const [nodes, setNodes, onNodesChange] = useNodesState(start.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(start.edges);
    const [problems, setProblems] = React.useState([]);
    const [library, setLibrary] = React.useState([]); // saved subcircuits
    const [newWidth, setNewWidth] = React.useState(1); // bit width for the next node
    const idRef = React.useRef(100);
    const nid = p => `${p}${idRef.current++}`;

    // Save the whole canvas as a reusable subcircuit — the composition primitive.
    const saveSubcircuit = () => {
        const model = reactFlowToModel(nodes, edges);
        const ports = derivePorts(model);
        if (!ports.length) { setProblems([{reason: 'Add inputs and outputs before saving a subcircuit — they become its ports.'}]); return; }
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
            <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.4rem'}}>
                <button type="button" onClick={() => addIo('in')} style={{cursor: 'pointer'}}>{'+ Input'}</button>
                <button type="button" onClick={() => addIo('out')} style={{cursor: 'pointer'}}>{'+ Output'}</button>
                <label style={{fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 3}} title="Bit width of the next node — >1 makes a bus">
                    {'width'}
                    <select value={newWidth} onChange={e => setNewWidth(Number(e.target.value))} data-testid="bw-fpga-rf-width">
                        {[1, 2, 4, 8, 16].map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                </label>
                {['and', 'or', 'not', 'xor', 'nand', 'nor', 'dff'].map(t => (
                    <button key={t} type="button" onClick={() => addGate(t)} style={{cursor: 'pointer'}}>{`+ ${GATE_DEFS[t].label}`}</button>
                ))}
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" onClick={saveSubcircuit} title="Save this whole design as a reusable subcircuit"
                    style={{cursor: 'pointer'}} data-testid="bw-fpga-rf-save">{'⤓ Save as subcircuit'}</button>
            </div>
            {library.length ? (
                <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.4rem', alignItems: 'center'}}>
                    <span style={{fontSize: '0.8rem', opacity: 0.75}}>{'Your blocks:'}</span>
                    {library.map(mod => (
                        <button key={mod.name} type="button" onClick={() => addInstance(mod)}
                            title={`ports: ${mod.ports.map(p => p.name).join(', ')}`}
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
                >{'⤵ Use as Verilog'}</button>
                <span style={{marginLeft: '0.5rem', fontSize: '0.8rem', opacity: 0.75}}>
                    {'drag to place, connect a green output to a blue input, then synthesise'}
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

export default FpgaGateBuilderRf;
