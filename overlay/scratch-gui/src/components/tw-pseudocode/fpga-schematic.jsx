import React from 'react';
import {buildSchematicModel, toElkGraph, NODE_SIZE} from '../../lib/bw-fpga/schematic.js';
import {fromYosys} from '../../lib/bw-fpga/sim.js';

/**
 * The synthesised design, drawn as gates — the visual analog the FPGA tab was
 * missing. It reads the same Yosys netlist the simulator does, turns it into a
 * gate graph (schematic.js), lays it out with elkjs, and draws it as SVG. Nets
 * whose value is known (the design's inputs and outputs) light up, so a learner
 * sees the picture of their Verilog and watches its signals move.
 *
 * elkjs is ~0.5 MB, so it loads only when a schematic is actually shown — this
 * whole surface is already behind the FPGA build flag and a lazy tab chunk.
 */
let elkPromise = null;
const loadElk = () => {
    if (!elkPromise) {
        elkPromise = import(/* webpackChunkName: "bw-fpga-schematic" */ 'elkjs/lib/elk.bundled.js')
            .then(m => m.default || m);
    }
    return elkPromise;
};

// Colour a wire by its known value: driven-high green, driven-low slate, and a
// neutral grey when the value is unknown (an internal net we do not read yet, or
// a multi-bit bus). Never guesses — an unknown wire looks unknown.
const wireColor = v => (v === 1 || v === '1' ? '#22c55e' : (v === 0 || v === '0' ? '#64748b' : '#cbd5e1'));

const NodeBox = ({node, laid}) => {
    const {x, y, width, height} = laid;
    const isIo = node.kind === 'input' || node.kind === 'output';
    const fill = node.kind === 'input' ? '#e0f2fe'
        : node.kind === 'output' ? '#fef9c3'
            : node.kind === 'constant' ? '#f1f5f9' : '#ffffff';
    const stroke = isIo ? '#0284c7' : '#475569';
    return (
        <g transform={`translate(${x},${y})`}>
            <rect width={width} height={height} rx={isIo ? 12 : 4}
                fill={fill} stroke={stroke} strokeWidth={1.3} />
            {/* an inverting gate carries a bubble on its output edge */}
            {node.inverting ? (
                <circle cx={width} cy={height / 2} r={3.2} fill="#ffffff" stroke={stroke} strokeWidth={1.2} />
            ) : null}
            <text x={width / 2} y={height / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize={isIo ? 11 : 13}
                fontFamily={isIo ? 'monospace' : 'sans-serif'}
                fontWeight={isIo ? 'normal' : 'bold'}
                fill="#1e293b">
                {isIo ? node.label : (node.glyph || node.type)}
            </text>
            {/* a gate's instance label, small, above the box */}
            {!isIo && node.label ? (
                <text x={width / 2} y={-3} textAnchor="middle" fontSize={8} fill="#94a3b8">{node.label}</text>
            ) : null}
        </g>
    );
};

const FpgaSchematic = ({netlistText, netValues}) => {
    // Parse + convert + model once per netlist. Pure and cheap; the layout is
    // the async part.
    const parsed = React.useMemo(() => {
        const t = (netlistText || '').trim();
        if (!t) return {status: 'empty'};
        let json;
        try { json = JSON.parse(t); } catch (e) { return {status: 'error', message: 'The netlist is not valid JSON.'}; }
        const {circuit, problems} = fromYosys(json);
        if (!circuit) return {status: 'error', message: (problems && problems[0] && problems[0].reason) || 'Could not read the netlist.'};
        const model = buildSchematicModel(circuit);
        if (!model.nodes.length) return {status: 'error', message: 'The netlist has no cells to draw.'};
        return {status: 'ok', model};
    }, [netlistText]);

    const [layout, setLayout] = React.useState({status: 'idle'});
    React.useEffect(() => {
        if (parsed.status !== 'ok') { setLayout({status: parsed.status, message: parsed.message}); return undefined; }
        let live = true;
        setLayout({status: 'laying-out'});
        loadElk()
            .then(ELK => new ELK().layout(toElkGraph(parsed.model)))
            .then(graph => { if (live) setLayout({status: 'ready', graph}); })
            .catch(e => { if (live) setLayout({status: 'error', message: `Layout failed: ${e.message}`}); });
        return () => { live = false; };
    }, [parsed]);

    if (parsed.status === 'empty') {
        return (
            <p style={{opacity: 0.7, margin: 0}}>
                {'Synthesise a design and its gates appear here — the Verilog you wrote, as a circuit.'}
            </p>
        );
    }
    if (layout.status === 'error' || parsed.status === 'error') {
        return <p style={{color: '#b34747', margin: 0}}>{layout.message || parsed.message}</p>;
    }
    if (layout.status !== 'ready') {
        return <p style={{opacity: 0.7, margin: 0}}>{'Drawing the schematic…'}</p>;
    }

    const {graph} = layout;
    const model = parsed.model;
    const nodesById = Object.fromEntries(model.nodes.map(n => [n.id, n]));
    const edgesById = Object.fromEntries(model.edges.map(e => [e.id, e]));
    const laidById = Object.fromEntries((graph.children || []).map(c => [c.id, c]));
    const W = Math.max(graph.width || 0, 40) + 16;
    const H = Math.max(graph.height || 0, 40) + 16;

    return (
        <div>
            <div style={{display: 'flex', gap: '1rem', alignItems: 'center', margin: '0 0 0.5rem', fontSize: '0.8rem', opacity: 0.85, flexWrap: 'wrap'}}>
                <span>{`${model.nodes.length} cells · ${model.edges.length} nets`}</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#22c55e" strokeWidth={2.5} /></svg>1
                </span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#64748b" strokeWidth={2.5} /></svg>0
                </span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#cbd5e1" strokeWidth={2.5} /></svg>{'unknown'}
                </span>
            </div>
            <div style={{overflow: 'auto', border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6, background: '#f8fafc', maxHeight: '60vh'}}>
                <svg width={W} height={H} style={{display: 'block'}} role="img" aria-label="Synthesised gate schematic">
                    <g transform="translate(8,8)">
                        {/* wires first, so gates draw on top */}
                        {(graph.edges || []).map(e => {
                            const edge = edgesById[e.id];
                            const v = edge && netValues ? netValues[edge.net] : undefined;
                            const sec = (e.sections || [])[0];
                            if (!sec) return null;
                            const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint]
                                .map(p => `${p.x},${p.y}`).join(' ');
                            return (
                                <polyline key={e.id} points={pts} fill="none"
                                    stroke={wireColor(v)} strokeWidth={v === 1 || v === '1' ? 2.4 : 1.6}
                                    data-testid={`bw-fpga-wire-${edge ? edge.net : e.id}`}
                                    data-value={v === undefined ? 'x' : String(v)} />
                            );
                        })}
                        {(graph.children || []).map(c => {
                            const node = nodesById[c.id];
                            if (!node) return null;
                            return <NodeBox key={c.id} node={node} laid={c} />;
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
};

export default FpgaSchematic;
export {NODE_SIZE};
