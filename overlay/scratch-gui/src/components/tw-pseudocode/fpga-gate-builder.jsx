import React from 'react';
import {connect} from 'react-redux';
import {GATE_DEFS, inputPorts, hasOutput, modelToVerilog, modelToCst} from '../../lib/bw-fpga/gate-builder.js';
import {evalModel, stepClock as stepClockEval} from '../../lib/bw-fpga/gate-eval.js';

const L10N = {
    en: {
        addInput: '+ Input',
        addOutput: '+ Output',
        clear: 'Clear',
        stepClock: '▸ Step clock',
        resetState: 'Reset state',
        wiringStatusPrefix: 'Wiring from ',
        wiringStatusSuffix: ' — click an input port to connect (or click another output to change the source).',
        idleStatus: 'It runs live: click an input box to toggle 0/1 and watch the wires light. Wire by clicking an output port (right) then an input port (left).',
        clickToggle: 'click to toggle 0/1',
        inLabel: 'in',
        outLabel: 'out',
        remove: 'remove',
        useVerilog: '⤵ Use as Verilog',
        useVerilogDesc: 'generates the HDL above and synthesises it'
    },
    de: {
        addInput: '+ Eingang',
        addOutput: '+ Ausgang',
        clear: 'Löschen',
        stepClock: '▸ Takt weiter',
        resetState: 'Zustand zurücksetzen',
        wiringStatusPrefix: 'Verkabelung von ',
        wiringStatusSuffix: ' — klicke auf einen Eingangs-Port zum Verbinden (oder einen anderen Ausgang, um die Quelle zu ändern).',
        idleStatus: 'Es läuft live: Klicke auf ein Eingabefeld, um 0/1 umzuschalten, und sieh, wie die Kabel aufleuchten. Verkable, indem du auf einen Ausgangs-Port (rechts) und dann auf einen Eingangs-Port (links) klickst.',
        clickToggle: 'Klicken, um 0/1 umzuschalten',
        inLabel: 'Ein',
        outLabel: 'Aus',
        remove: 'entfernen',
        useVerilog: '⤵ Als Verilog verwenden',
        useVerilogDesc: 'generiert das obige HDL und synthetisiert es'
    }
};
const pickLocale = loc => (loc && L10N[String(loc).slice(0, 2)] ? String(loc).slice(0, 2) : 'en');

/**
 * Build logic by placing gates and wiring them — Rung 3 of the FPGA visual
 * analog. Add inputs, gates and outputs; click an output port then an input
 * port to wire them; press "Use as Verilog" and the design drops into the
 * Verilog box, where it synthesises, draws as a schematic, and runs — no text
 * typed. The Verilog itself comes from the pure, tested generator in
 * gate-builder.js; this is only the canvas.
 *
 * Layout is elkjs (shared chunk with the schematic); wires are drawn straight
 * between ports, so adding one needs no re-route.
 */
let elkPromise = null;
const loadElk = () => {
    if (!elkPromise) {
        elkPromise = import(/* webpackChunkName: "bw-fpga-schematic" */ 'elkjs/lib/elk.bundled.js')
            .then(m => m.default || m);
    }
    return elkPromise;
};

const nodePorts = node => {
    const ins = inputPorts(node).map(name => ({name, side: 'in'}));
    return hasOutput(node) ? [...ins, {name: 'out', side: 'out'}] : ins;
};
const NODE_W = 58;
const nodeH = node => Math.max(38, nodePorts(node).length * 13 + 10);

// A starter so the canvas is never a blank wall: a D flip-flop with a clock and
// a data input driving an output — the smallest sequential design.
const STARTER = () => ({
    nodes: [
        {id: 'clk', kind: 'in', name: 'clk'},
        {id: 'd', kind: 'in', name: 'd'},
        {id: 'ff', kind: 'gate', type: 'dff'},
        {id: 'q', kind: 'out', name: 'q'}
    ],
    edges: [
        {from: {node: 'd', port: 'out'}, to: {node: 'ff', port: 'd'}},
        {from: {node: 'clk', port: 'out'}, to: {node: 'ff', port: 'clk'}},
        {from: {node: 'ff', port: 'out'}, to: {node: 'q', port: 'in'}}
    ]
});

const FpgaGateBuilder = (props) => {
    const {onUseVerilog, seed} = props;
    const [model, setModel] = React.useState(seed || STARTER);
    React.useEffect(() => {
        if (seed) setModel(seed);
    }, [seed]);
    const [pending, setPending] = React.useState(null); // {node, port} awaiting a sink
    const [graph, setGraph] = React.useState(null);
    const [problems, setProblems] = React.useState([]);
    const idRef = React.useRef(1);
    const nid = prefix => `${prefix}${idRef.current++}`;
    // LIVE evaluation: toggle an input, and every wire settles to its value —
    // offline, no synthesis. Stepping the clock advances the flip-flops.
    const [inputVals, setInputVals] = React.useState({});
    const [dffState, setDffState] = React.useState({});
    const evalResult = React.useMemo(() => evalModel(model, inputVals, dffState), [model, inputVals, dffState]);
    const hasDff = model.nodes.some(n => n.kind === 'gate' && n.type === 'dff');
    const toggleInput = name => setInputVals(v => ({...v, [name]: v[name] ? 0 : 1}));
    const stepClock = () => setDffState(s => stepClockEval(model, inputVals, s));
    const resetState = () => setDffState({});
    const valFill = v => (v === 1 ? '#bbf7d0' : v === 0 ? '#e2e8f0' : '#ffffff');
    const wireStroke = v => (v === 1 ? '#16a34a' : v === 0 ? '#64748b' : '#cbd5e1');

    // Lay the model out whenever it changes.
    React.useEffect(() => {
        let live = true;
        loadElk().then(ELK => new ELK().layout({
            id: 'root',
            layoutOptions: {
                'org.eclipse.elk.algorithm': 'layered',
                'org.eclipse.elk.direction': 'RIGHT',
                'org.eclipse.elk.spacing.nodeNode': '20',
                'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '52'
            },
            children: model.nodes.map(n => ({
                id: n.id, width: NODE_W, height: nodeH(n),
                properties: {'org.eclipse.elk.portConstraints': 'FIXED_SIDE'},
                ports: nodePorts(n).map(p => ({
                    id: `${n.id}.${p.name}`,
                    properties: {'org.eclipse.elk.port.side': p.side === 'out' ? 'EAST' : 'WEST'}
                }))
            })),
            edges: model.edges.map((e, i) => ({id: `e${i}`, sources: [`${e.from.node}.${e.from.port}`], targets: [`${e.to.node}.${e.to.port}`]}))
        })).then(g => { if (live) setGraph(g); }).catch(() => {});
        return () => { live = false; };
    }, [model]);

    const addNode = node => setModel(m => ({...m, nodes: [...m.nodes, node]}));
    const addInput = () => addNode({id: nid('i'), kind: 'in', name: `in${model.nodes.filter(n => n.kind === 'in').length + 1}`});
    const addOutput = () => addNode({id: nid('o'), kind: 'out', name: `out${model.nodes.filter(n => n.kind === 'out').length + 1}`});
    const addGate = type => addNode({id: nid('g'), kind: 'gate', type});
    const clearAll = () => { setModel({nodes: [], edges: []}); setPending(null); setProblems([]); };
    const removeNode = id => setModel(m => ({
        nodes: m.nodes.filter(n => n.id !== id),
        edges: m.edges.filter(e => e.from.node !== id && e.to.node !== id)
    }));
    const rename = (id, name) => setModel(m => ({...m, nodes: m.nodes.map(n => n.id === id ? {...n, name} : n)}));

    const clickPort = (node, port, side) => {
        if (side === 'out') { setPending({node: node.id, port}); return; }
        // an input port: connect from the pending source, replacing any feed
        if (!pending) return;
        setModel(m => ({
            ...m,
            edges: [...m.edges.filter(e => !(e.to.node === node.id && e.to.port === port)),
                {from: {node: pending.node, port: pending.port}, to: {node: node.id, port}}]
        }));
        setPending(null);
    };

    const generate = () => {
        const {verilog, problems: probs} = modelToVerilog(model);
        const {cst} = modelToCst(model);
        setProblems(probs);
        // Hand back BOTH the HDL and matching constraints: without a .cst for
        // THIS design's ports, the tab's default constraints reach nextpnr and
        // place-and-route fails.
        if (onUseVerilog) onUseVerilog(verilog, cst);
    };

    const byId = Object.fromEntries((graph ? graph.children : []).map(c => [c.id, c]));
    const portPos = (nodeId, port) => {
        const c = byId[nodeId];
        if (!c) return null;
        const p = (c.ports || []).find(x => x.id === `${nodeId}.${port}`);
        return p ? {x: c.x + p.x, y: c.y + p.y} : null;
    };
    const W = Math.max((graph && graph.width) || 0, 60) + 16;
    const H = Math.max((graph && graph.height) || 0, 60) + 16;

    const gateBtns = ['and', 'or', 'not', 'xor', 'nand', 'nor', 'dff'];

    return (
        <div>
            <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0 0 0.5rem', alignItems: 'center'}}>
                <button type="button" onClick={addInput} style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{L10N[pickLocale(props.locale)].addInput}</button>
                <button type="button" onClick={addOutput} style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{L10N[pickLocale(props.locale)].addOutput}</button>
                <span style={{opacity: 0.4}}>{'|'}</span>
                {gateBtns.map(t => (
                    <button key={t} type="button" onClick={() => addGate(t)} title={`${GATE_DEFS[t].label} gate`}
                        style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{`+ ${GATE_DEFS[t].label}`}</button>
                ))}
                <span style={{opacity: 0.4}}>{'|'}</span>
                <button type="button" onClick={clearAll} style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{L10N[pickLocale(props.locale)].clear}</button>
                {hasDff ? (
                    <>
                        <span style={{opacity: 0.4}}>{'|'}</span>
                        <button type="button" onClick={stepClock} data-testid="bw-fpga-live-step"
                            style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{L10N[pickLocale(props.locale)].stepClock}</button>
                        <button type="button" onClick={resetState}
                            style={{padding: '0.2rem 0.5rem', cursor: 'pointer'}}>{L10N[pickLocale(props.locale)].resetState}</button>
                    </>
                ) : null}
            </div>
            <p style={{margin: '0 0 0.5rem', fontSize: '0.8rem', opacity: 0.8}}>
                {pending
                    ? <strong>{`${L10N[pickLocale(props.locale)].wiringStatusPrefix}${pending.node}.${pending.port}${L10N[pickLocale(props.locale)].wiringStatusSuffix}`}</strong>
                    : L10N[pickLocale(props.locale)].idleStatus}
            </p>
            <div style={{overflow: 'auto', border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6, background: '#f8fafc', maxHeight: '55vh'}}>
                <svg width={W} height={H} style={{display: 'block'}} role="img" aria-label="Gate builder canvas" data-testid="bw-fpga-builder-svg">
                    <g transform="translate(8,8)">
                        {model.edges.map((e, i) => {
                            const a = portPos(e.from.node, e.from.port);
                            const b = portPos(e.to.node, e.to.port);
                            if (!a || !b) return null;
                            const v = evalResult.values[e.from.node];
                            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                                stroke={wireStroke(v)} strokeWidth={v === 1 ? 2.4 : 1.6}
                                data-testid={`bw-fpga-wire-${e.from.node}-${e.to.node}-${e.to.port}`}
                                data-value={v === undefined ? 'x' : String(v)} />;
                        })}
                        {model.nodes.map(node => {
                            const c = byId[node.id];
                            if (!c) return null;
                            const isIo = node.kind !== 'gate';
                            const def = node.kind === 'gate' ? GATE_DEFS[node.type] : null;
                            const dispVal = node.kind === 'out' ? evalResult.outputs[node.name] : evalResult.values[node.id];
                            return (
                                <g key={node.id} transform={`translate(${c.x},${c.y})`} data-testid={`bw-fpga-node-${node.id}`}
                                    data-value={dispVal === undefined ? 'x' : String(dispVal)}>
                                    <rect width={c.width} height={c.height} rx={isIo ? 10 : 4}
                                        fill={valFill(dispVal)}
                                        stroke={node.kind === 'in' ? '#0284c7' : node.kind === 'out' ? '#ca8a04' : '#475569'}
                                        strokeWidth={1.3}
                                        style={node.kind === 'in' ? {cursor: 'pointer'} : undefined}
                                        onClick={node.kind === 'in' ? () => toggleInput(node.name) : undefined}>
                                        {node.kind === 'in' ? <title>{L10N[pickLocale(props.locale)].clickToggle}</title> : null}
                                    </rect>
                                    <text x={c.width / 2} y={c.height / 2} textAnchor="middle" dominantBaseline="central"
                                        fontSize={isIo ? 10 : 12} fontWeight={isIo ? 'normal' : 'bold'} fill="#1e293b"
                                        fontFamily={isIo ? 'monospace' : 'sans-serif'}>
                                        {isIo ? node.name : def.glyph}
                                    </text>
                                    {(c.ports || []).map(p => {
                                        const port = p.id.split('.').slice(1).join('.');
                                        const side = p.id.endsWith('.out') ? 'out' : 'in';
                                        const isPending = pending && pending.node === node.id && pending.port === port;
                                        return (
                                            <circle key={p.id} cx={p.x} cy={p.y} r={4.5}
                                                fill={isPending ? '#f59e0b' : side === 'out' ? '#22c55e' : '#0284c7'}
                                                stroke="#ffffff" strokeWidth={1} style={{cursor: 'pointer'}}
                                                data-testid={`bw-fpga-port-${node.id}-${port}`}
                                                onClick={() => clickPort(node, port, side)} />
                                        );
                                    })}
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
            {/* name + delete the I/O nodes (SVG text is awkward to edit inline) */}
            {model.nodes.some(n => n.kind !== 'gate') ? (
                <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.5rem 0'}}>
                    {model.nodes.filter(n => n.kind !== 'gate').map(n => (
                        <label key={n.id} style={{fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4}}>
                            <span style={{opacity: 0.7}}>{n.kind === 'in' ? L10N[pickLocale(props.locale)].inLabel : L10N[pickLocale(props.locale)].outLabel}</span>
                            <input value={n.name} onChange={e => rename(n.id, e.target.value)}
                                data-testid={`bw-fpga-name-${n.id}`}
                                style={{width: '5rem', fontFamily: 'monospace', fontSize: '0.8rem'}} />
                            <button type="button" onClick={() => removeNode(n.id)} title={L10N[pickLocale(props.locale)].remove}
                                style={{cursor: 'pointer', padding: '0 0.3rem'}}>{'×'}</button>
                        </label>
                    ))}
                </div>
            ) : null}
            <div style={{display: 'flex', gap: '0.6rem', alignItems: 'center', margin: '0.5rem 0'}}>
                <button type="button" onClick={generate}
                    disabled={!model.nodes.length}
                    style={{padding: '0.35rem 0.8rem', cursor: model.nodes.length ? 'pointer' : 'default', fontWeight: 'bold'}}
                >{L10N[pickLocale(props.locale)].useVerilog}</button>
                <span style={{fontSize: '0.8rem', opacity: 0.75}}>{L10N[pickLocale(props.locale)].useVerilogDesc}</span>
            </div>
            {problems.length ? (
                <ul style={{listStyle: 'none', padding: 0, margin: '0.25rem 0'}}>
                    {problems.map((p, i) => (
                        <li key={i} style={{color: '#b34747', fontSize: '0.8rem'}}>{p.reason || p.code}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};

export { FpgaGateBuilder };
export default connect(state => ({locale: state.locales && state.locales.locale}))(FpgaGateBuilder);
