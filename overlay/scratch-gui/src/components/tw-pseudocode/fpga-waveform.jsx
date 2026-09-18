import React from 'react';
import {traceToLanes, laneWavePoints} from '../../lib/bw-fpga/waveform.js';
import {readPorts, detectClockPort} from '../../lib/bw-fpga/yosys.js';

/**
 * A clocked design's outputs, over time — Rung 2 of the FPGA visual analog. It
 * runs the same gate-level sim the board uses, one cycle at a time from reset,
 * and draws each output bit as a square wave: a 4-bit counter reads as four
 * waves, LSB fast, MSB slow, the way a logic analyser shows it.
 *
 * Self-contained: it derives the ports and the clock from the netlist and runs
 * its OWN sim, so it never disturbs the board-driving sim in the tab. The heavy
 * sim + engine load into their own chunk, shared with the schematic view.
 */
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

// How many cycles the waveform shows from reset. Enough to see a 4-bit counter
// wrap; the board's own step count is separate.
const CYCLES = 16;
const CYCLE_W = 26;
const LANE_H = 26;
const LABEL_W = 78;

const FpgaWaveform = ({netlistText, inputs}) => {
    const [state, setState] = React.useState({status: 'idle'});

    React.useEffect(() => {
        const trimmed = (netlistText || '').trim();
        if (!trimmed) { setState({status: 'empty'}); return undefined; }
        let parsed;
        try { parsed = JSON.parse(trimmed); } catch (e) { setState({status: 'error', message: 'The netlist is not valid JSON.'}); return undefined; }
        const {ports} = readPorts(parsed);
        const clockPort = detectClockPort(ports);
        if (!clockPort) { setState({status: 'no-clock'}); return undefined; }
        const hasOutput = Object.values(ports).some(p => p.direction === 'output');
        if (!hasOutput) { setState({status: 'no-clock'}); return undefined; }

        let live = true;
        setState({status: 'tracing'});
        loadSim().then(({GateLevelSim, fromYosys, engine}) => {
            if (!live) return;
            const {circuit, problems} = fromYosys(parsed);
            if (!circuit) { setState({status: 'error', message: (problems && problems[0] && problems[0].reason) || 'Could not read the netlist.'}); return; }
            const sim = new GateLevelSim(circuit, engine);
            for (const [name, p] of Object.entries(ports)) {
                if (p.direction !== 'input' || name === clockPort) continue;
                sim.setInput(name, (inputs && inputs[name]) ? 1 : 0, p.width || 1);
            }
            const {trace, settled, reason} = sim.traceClock(clockPort, CYCLES, ports);
            if (!settled) { setState({status: 'error', message: reason}); return; }
            const {lanes, cycles} = traceToLanes(trace, ports);
            setState({status: 'ready', lanes, cycles, clockPort});
        }).catch(e => { if (live) setState({status: 'error', message: `The waveform could not be simulated: ${e.message}`}); });
        return () => { live = false; };
    }, [netlistText, inputs]);

    if (state.status === 'empty') return null;
    if (state.status === 'no-clock') {
        return <p style={{opacity: 0.7, margin: 0}}>{'Waveforms show a clocked design over time — this one has no clock to step.'}</p>;
    }
    if (state.status === 'error') return <p style={{color: '#b34747', margin: 0}}>{state.message}</p>;
    if (state.status !== 'ready') return <p style={{opacity: 0.7, margin: 0}}>{'Tracing the design…'}</p>;

    const {lanes, cycles} = state;
    if (!lanes.length) return <p style={{opacity: 0.7, margin: 0}}>{'This design drives no outputs to trace.'}</p>;
    const n = cycles.length;
    const width = LABEL_W + (n - 1) * CYCLE_W + 8;
    const height = lanes.length * LANE_H + 22;

    return (
        <div style={{overflow: 'auto', border: '1px solid rgba(71,85,105,0.25)', borderRadius: 6, background: '#0f172a', maxHeight: '50vh'}}>
            <svg width={width} height={height} style={{display: 'block'}} role="img" aria-label="Output waveforms over clock cycles">
                {/* cycle grid + numbers */}
                {cycles.map((c, i) => (
                    <g key={`c${c}`}>
                        <line x1={LABEL_W + i * CYCLE_W} y1={18} x2={LABEL_W + i * CYCLE_W} y2={height}
                            stroke="#1e293b" strokeWidth={1} />
                        <text x={LABEL_W + i * CYCLE_W + 2} y={12} fontSize={9} fill="#64748b" fontFamily="monospace">{c}</text>
                    </g>
                ))}
                {lanes.map((lane, li) => {
                    const top = 18 + li * LANE_H;
                    const {points, unknown} = laneWavePoints(lane.samples, {cycleW: CYCLE_W, laneH: LANE_H, pad: 5});
                    return (
                        <g key={lane.name} transform={`translate(0,${top})`}
                            data-testid={`bw-fpga-wave-${lane.name}`}
                            data-samples={lane.samples.join('')}>
                            <text x={6} y={LANE_H / 2} dominantBaseline="central" fontSize={11}
                                fontFamily="monospace" fill="#e2e8f0">{lane.name}</text>
                            {unknown.map(([x0, x1], k) => (
                                <rect key={k} x={LABEL_W + x0} y={4} width={x1 - x0} height={LANE_H - 8}
                                    fill="rgba(148,163,184,0.18)" />
                            ))}
                            <polyline
                                points={points.split(' ').filter(Boolean)
                                    .map(pt => { const [x, y] = pt.split(','); return `${LABEL_W + Number(x)},${y}`; })
                                    .join(' ')}
                                fill="none" stroke="#22c55e" strokeWidth={1.8} />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default FpgaWaveform;
