import React from 'react';
import {connect} from 'react-redux';
import {buildSchematicModel, toElkGraph, NODE_SIZE} from '../../lib/bw-fpga/schematic.js';
import {fromYosys} from '../../lib/bw-fpga/sim.js';
import {readPorts, detectClockPort} from '../../lib/bw-fpga/yosys.js';

const L10N = {
    en: {
        'schematicLabel': 'Synthesised gate schematic',
        empty_text: 'Synthesise a design and its gates appear here — the Verilog you wrote, as a circuit.',
        drawing_text: 'Drawing the schematic…',
        cells: 'cells',
        nets: 'nets',
        unknown: 'unknown',
        invalid_json: 'The netlist is not valid JSON.',
        read_error: 'Could not read the netlist.',
        no_cells: 'The netlist has no cells to draw.',
        layout_failed: 'Layout failed'
    },
    de: {
        'schematicLabel': 'Synthetisierter Gatter-Schaltplan',
        empty_text: 'Synthetisieren Sie ein Design und seine Gatter erscheinen hier — das von Ihnen geschriebene Verilog als Schaltung.',
        drawing_text: 'Zeichne den Schaltplan…',
        cells: 'Zellen',
        nets: 'Netze',
        unknown: 'unbekannt',
        invalid_json: 'Die Netzliste ist kein gültiges JSON.',
        read_error: 'Die Netzliste konnte nicht gelesen werden.',
        no_cells: 'Die Netzliste hat keine Zellen zum Zeichnen.',
        layout_failed: 'Layout fehlgeschlagen'
    }
};
const pickLocale = loc => (loc && L10N[String(loc).slice(0, 2)] ? String(loc).slice(0, 2) : 'en');

// The sim engine (shared chunk with the tab) is loaded only to READ internal
// wire values — the schematic runs its own settle so it never disturbs the
// board-driving sim.
let simPromise = null;
const loadSim = () => {
    if (!simPromise) {
        simPromise = Promise.all([
            import(/* webpackChunkName: "bw-fpga-sim" */ '../../lib/bw-fpga/sim.js'),
            import(/* webpackChunkName: "bw-fpga-sim" */ 'digitaljs')
        ]).then(([sim, engine]) => ({...sim, engine}));
    }
    return simPromise;
};

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

// Colour a wire by its known value. Never guesses — an unknown wire looks unknown.
const isHigh = v => v === 1 || v === '1' || v === true;
const isLow = v => v === 0 || v === '0' || v === false;
// green driven-high, slate driven-low, neutral grey when unknown (an internal
// net we do not read yet, or a multi-bit bus). Never guesses.
const wireColor = v => (isHigh(v) ? '#22c55e' : (isLow(v) ? '#64748b' : '#cbd5e1'));

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

const FpgaSchematic = ({netlistText, netValues, inputs, clockCycles = 0, locale}) => {
    // INTERNAL-wire liveness: run our own settle and read every named net, so
    // signals light as they flow THROUGH the gates — not just at the I/O. Reads
    // are defensive (see GateLevelSim.netValues); nets that cannot be read fall
    // back to the I/O values the tab passes, so this only ever adds colour.
    const [liveNet, setLiveNet] = React.useState({});
    React.useEffect(() => {
        const t = (netlistText || '').trim();
        if (!t) { setLiveNet({}); return undefined; }
        let json; try { json = JSON.parse(t); } catch (e) { return undefined; }
        let live = true;
        loadSim().then(({GateLevelSim, fromYosys: fy, engine}) => {
            if (!live) return;
            const {circuit} = fy(json);
            if (!circuit) return;
            try {
                const sim = new GateLevelSim(circuit, engine);
                const {ports} = readPorts(json);
                const clockPort = detectClockPort(ports);
                for (const [name, p] of Object.entries(ports)) {
                    if (p.direction !== 'input' || name === clockPort) continue;
                    sim.setInput(name, (inputs && inputs[name]) ? 1 : 0, p.width || 1);
                }
                if (clockPort && clockCycles > 0) sim.tickClock(clockPort, clockCycles);
                else sim.settle();
                const nets = [...new Set((circuit.connectors || []).map(c => c.name).filter(Boolean))];
                if (live) setLiveNet(sim.netValues(nets));
            } catch (e) { /* leave internal nets to the I/O fallback */ }
        }).catch(() => {});
        return () => { live = false; };
    }, [netlistText, inputs, clockCycles]);
    // Parse + convert + model once per netlist. Pure and cheap; the layout is
    // the async part.
    const parsed = React.useMemo(() => {
        const t = (netlistText || '').trim();
        if (!t) return {status: 'empty'};
        let json;
        try { json = JSON.parse(t); } catch (e) { return {status: 'error', message: L10N[pickLocale(locale)].invalid_json}; }
        const {circuit, problems} = fromYosys(json);
        if (!circuit) return {status: 'error', message: (problems && problems[0] && problems[0].reason) || L10N[pickLocale(locale)].read_error};
        const model = buildSchematicModel(circuit);
        if (!model.nodes.length) return {status: 'error', message: L10N[pickLocale(locale)].no_cells};
        return {status: 'ok', model};
    }, [netlistText, locale]);

    const [layout, setLayout] = React.useState({status: 'idle'});
    React.useEffect(() => {
        if (parsed.status !== 'ok') { setLayout({status: parsed.status, message: parsed.message}); return undefined; }
        let live = true;
        setLayout({status: 'laying-out'});
        loadElk()
            .then(ELK => new ELK().layout(toElkGraph(parsed.model)))
            .then(graph => { if (live) setLayout({status: 'ready', graph}); })
            .catch(e => { if (live) setLayout({status: 'error', message: `${L10N[pickLocale(locale)].layout_failed}: ${e.message}`}); });
        return () => { live = false; };
    }, [parsed]);

    if (parsed.status === 'empty') {
        return (
            <p style={{opacity: 0.7, margin: 0}}>
                {L10N[pickLocale(locale)].empty_text}
            </p>
        );
    }
    if (layout.status === 'error' || parsed.status === 'error') {
        return <p style={{color: '#b34747', margin: 0}}>{layout.message || parsed.message}</p>;
    }
    if (layout.status !== 'ready') {
        return <p style={{opacity: 0.7, margin: 0}}>{L10N[pickLocale(locale)].drawing_text}</p>;
    }

    const {graph} = layout;
    const model = parsed.model;
    const nodesById = Object.fromEntries(model.nodes.map(n => [n.id, n]));
    const edgesById = Object.fromEntries(model.edges.map(e => [e.id, e]));
    const W = Math.max(graph.width || 0, 40) + 16;
    const H = Math.max(graph.height || 0, 40) + 16;

    return (
        <div>
            <div style={{display: 'flex', gap: '1rem', alignItems: 'center', margin: '0 0 0.5rem', fontSize: '0.8rem', opacity: 0.85, flexWrap: 'wrap'}}>
                <span>{`${model.nodes.length} ${L10N[pickLocale(locale)].cells} · ${model.edges.length} ${L10N[pickLocale(locale)].nets}`}</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#22c55e" strokeWidth={2.5} /></svg>1
                </span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#64748b" strokeWidth={2.5} /></svg>0
                </span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                    <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#cbd5e1" strokeWidth={2.5} /></svg>{L10N[pickLocale(locale)].unknown}
                </span>
            </div>
            <div style={{overflow: 'auto', border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6, background: '#f8fafc', maxHeight: '60vh'}}>
                <svg width={W} height={H} style={{display: 'block'}} role="img" aria-label={L10N[pickLocale(locale)].schematicLabel}>
                    <g transform="translate(8,8)">
                        {/* wires first, so gates draw on top */}
                        {(graph.edges || []).map(e => {
                            const edge = edgesById[e.id];
                            const net = edge && edge.net;
                            const v = net != null && liveNet[net] !== undefined ? liveNet[net]
                                : (net != null && netValues ? netValues[net] : undefined);
                            const sec = (e.sections || [])[0];
                            if (!sec) return null;
                            const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint]
                                .map(p => `${p.x},${p.y}`).join(' ');
                            return (
                                <polyline key={e.id} points={pts} fill="none"
                                    stroke={wireColor(v)} strokeWidth={isHigh(v) ? 2.4 : 1.6}
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

export default connect(state => ({locale: state.locales && state.locales.locale}))(FpgaSchematic);
export {NODE_SIZE};
