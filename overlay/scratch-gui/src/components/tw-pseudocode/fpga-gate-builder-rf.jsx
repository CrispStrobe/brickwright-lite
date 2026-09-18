import React from 'react';
import {ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge,
    useNodesState, useEdgesState, Handle, Position} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {GATE_DEFS, inputPorts, modelToVerilog, modelToCst} from '../../lib/bw-fpga/gate-builder.js';
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

const nodeTypes = {gate: GateNode, io: IoNode};

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
    const idRef = React.useRef(100);
    const nid = p => `${p}${idRef.current++}`;

    const addGate = type => setNodes(ns => [...ns, {
        id: nid('g'), type: 'gate', position: {x: 180, y: 40 + (ns.length % 6) * 40},
        data: {kind: 'gate', gtype: type}
    }]);
    const addIo = kind => setNodes(ns => {
        const n = ns.filter(x => x.data.kind === kind).length + 1;
        return [...ns, {
            id: nid(kind === 'in' ? 'i' : 'o'), type: 'io',
            position: {x: kind === 'in' ? 0 : 360, y: 40 + (ns.length % 6) * 40},
            data: {kind, name: `${kind === 'in' ? 'in' : 'out'}${n}`, width: 1}
        }];
    });
    const onConnect = React.useCallback(params => setEdges(es => addEdge(params, es)), [setEdges]);

    const generate = () => {
        const model = reactFlowToModel(nodes, edges);
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
                {['and', 'or', 'not', 'xor', 'nand', 'nor', 'dff'].map(t => (
                    <button key={t} type="button" onClick={() => addGate(t)} style={{cursor: 'pointer'}}>{`+ ${GATE_DEFS[t].label}`}</button>
                ))}
            </div>
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
