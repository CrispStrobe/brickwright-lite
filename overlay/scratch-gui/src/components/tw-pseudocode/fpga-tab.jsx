import React from 'react';
import TANG_NANO_20K from 'bw-circuit-ui/parts-data/tang_nano_20k.json';
import {parseCst, emitCst} from '../../lib/bw-fpga/cst.js';
import {bridge, constraintsFromBindings} from '../../lib/bw-fpga/port-bridge.js';
import {applyPortValues} from '../../lib/bw-fpga/drive.js';
import {readPorts, checkWidths} from '../../lib/bw-fpga/yosys.js';
// Small and dependency-free, so these stay static: the licence screen is useful
// on its own, and the synthesis client's only job today is to refuse honestly.
import {screenForHostedSynthesis} from '../../lib/bw-fpga/licence.js';
import {synthesise} from '../../lib/bw-fpga/synthesis.js';
import {createLocalClient} from '../../lib/bw-fpga/local-client.js';
import {defaultCatalog, probeBackends, selectBackend, offerable}
    from '../../lib/bw-fpga/backends.js';

/**
 * The FPGA / HDL surface — TN2 and TN2b of docs/TANG-NANO.md.
 *
 * SHIPPED HIDDEN. Reached only when a build sets BW_ENABLE_FPGA=1; gui.jsx gates
 * both the <Tab> and this <TabPanel> on a webpack-substituted literal, so an off
 * build does not carry this file, the bridge, or the board JSON. Turning it on
 * by default is a separate, later decision that MAY NEVER BE TAKEN.
 *
 * WHY ITS OWN SURFACE. The Code tab's premise is blocks <-> pseudocode <->
 * Python/JS as representations of ONE program. Verilog is not a representation
 * of a Scratch script, and putting it there would imply a conversion that will
 * never exist.
 *
 * WHAT THIS DOES: answers "can these ports reach the board, and where" by
 * reading Gowin constraints against the real Tang Nano 20K part. That question
 * is answerable today, needs no toolchain, and is the piece that makes an FPGA
 * design meet the breadboard at all.
 *
 * WHAT IT DOES NOT DO, and must not imply: synthesis (TN3), gate-level
 * simulation (digitaljs), flashing (TN4), or any SoC (TN5a/TN5b).
 *
 * The plan, the phases and the decisions behind them: docs/TANG-NANO.md.
 */

const EXAMPLE = `// Gowin constraints. Pin numbers are the ones silkscreened
// on the board and used by a real .cst.
IO_LOC  "led" 73;
IO_PORT "led" IO_TYPE=LVCMOS33 DRIVE=8;

IO_LOC  "btn" 74;

// Pin 15 is also onboard LED0 — usable, but it moves the board's own LED too.
IO_LOC  "shared" 15;

// Pin 33 is an HDMI pair. Real silicon, not on a header.
IO_LOC  "video" 33;
`;

// The simulator is LAZY, and the flag alone was not enough.
//
// Everything else in this surface is pure ESM the flag-off build drops entirely
// — verified by grepping the shipped artifact. digitaljs is different: the alias
// points at its CommonJS build (the package exports no subpath, so there is no
// ESM one to point at), and webpack cannot tree-shake CommonJS. A static import
// therefore put ~25 KiB gz of it into the EAGER bundle even with the flag off,
// and the first-load guard caught it: 1325 KiB against a 1300 KiB budget.
//
// So it is a dynamic import, which is also how the debugger panel and the render
// fonts stay out of the boot chunk. One chunk, fetched only when a netlist is
// actually pasted.
let simModulePromise = null;
const loadSimulator = () => {
    if (!simModulePromise) {
        simModulePromise = Promise.all([
            import(/* webpackChunkName: "bw-fpga-sim" */ '../../lib/bw-fpga/sim.js'),
            import(/* webpackChunkName: "bw-fpga-sim" */ 'digitaljs')
        ]).then(([sim, engine]) => ({...sim, engine}));
    }
    return simModulePromise;
};

// A copyleft source needs the local tier, and asking the selector for that
// capability is how the refusal comes back NAMED rather than as a mystery.
const needsLocalTier = hdl => hdl.trim()
    ? screenForHostedSynthesis([{name: 'design.v', source: hdl}]).refusals.length > 0
    : false;

const Row = ({tone, children}) => (
    <li style={{
        margin: '0.25rem 0', padding: '0.4rem 0.6rem', borderRadius: 4,
        borderLeft: `3px solid ${tone}`, background: 'rgba(127,127,127,0.08)'
    }}>{children}</li>
);

const FpgaTab = () => {
    const [text, setText] = React.useState(EXAMPLE);
    const [netlistText, setNetlistText] = React.useState('');
    const [inputs, setInputs] = React.useState({});
    const [sim, setSim] = React.useState({values: {}, note: null, problems: []});
    const [hdl, setHdl] = React.useState('');
    const [synth, setSynth] = React.useState(null);
    const [backend, setBackend] = React.useState('auto');
    const [probe, setProbe] = React.useState({available: [], probes: []});
    // TN6a. `localAvailable: false` was hard-coded below, which made the local
    // backend permanently unofferable however capable the browser was. The
    // worker answers it now — and answers `not-downloaded` until someone
    // consents to 78 MB, which is an honest state and not a failure.
    const [local, setLocal] = React.useState(null);
    const [localBusy, setLocalBusy] = React.useState(false);

    // Probe once. Nothing is offered that was not actually found, and an absent
    // backend is shown WITH ITS REASON rather than omitted — "no synthesis
    // service is configured" is more useful to a reader than an empty list.
    const catalog = React.useMemo(() => defaultCatalog({
        hostedEndpoint: process.env.BW_SYNTHESIS_ENDPOINT || null
    }), []);
    // One client for the life of the tab: it owns the worker, and the worker
    // owns whether 78 MB is already here. A new one per render would forget.
    const localClient = React.useMemo(() => createLocalClient({
        spawn: () => new Worker(new URL('../../lib/bw-fpga/yosys-worker.js', import.meta.url),
            {type: 'module'}),
        onState: m => setLocal(m.state)
    }), []);
    React.useEffect(() => {
        let live = true;
        localClient.init().then(r => live && setLocal(r.state));
        return () => { live = false; localClient.terminate(); };
    }, [localClient]);

    React.useEffect(() => {
        let live = true;
        probeBackends({catalog, localAvailable: Boolean(local && local.available)})
            .then(r => live && setProbe(r));
        return () => { live = false; };
    }, [catalog, local]);

    // The licence screen is worth running as you type: it is the one part of
    // TN3 that works without a service, and it answers a question the user
    // cannot answer by looking.
    const selection = React.useMemo(() => selectBackend({
        backend,
        requiredCapabilities: needsLocalTier(hdl) ? ['copyleft-sources'] : [],
        available: probe.available,
        catalog
    }), [backend, hdl, probe, catalog]);

    const hdlScreen = React.useMemo(
        () => screenForHostedSynthesis(hdl.trim() ? [{name: 'design.v', source: hdl}] : []),
        [hdl]);

    // Load and run the simulator when there is something to simulate. Nothing is
    // fetched until a netlist is actually pasted.
    React.useEffect(() => {
        let live = true;
        const trimmed = netlistText.trim();
        if (!trimmed) {
            setSim({values: {}, note: null, problems: []});
            return () => { live = false; };
        }
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            return () => { live = false; };   // the memo already reports bad JSON
        }
        loadSimulator().then(({GateLevelSim, fromYosys, engine}) => {
            if (!live) return;
            const {circuit, problems} = fromYosys(parsed);
            if (!circuit) return setSim({values: {}, note: null, problems});
            try {
                const s = new GateLevelSim(circuit, engine);
                const {ports} = readPorts(parsed);
                for (const [name, p] of Object.entries(ports)) {
                    if (p.direction !== 'input') continue;
                    s.setInput(name, inputs[name] ? 1 : 0, p.width || 1);
                }
                const settled = s.settle();
                if (!settled.settled) {
                    return setSim({values: {}, note: null,
                        problems: [{code: 'did-not-settle', reason: settled.reason}]});
                }
                const read = s.outputValues(ports);
                setSim({values: read.values, note: `settled in ${settled.steps} step(s)`,
                    problems: read.problems});
            } catch (e) {
                setSim({values: {}, note: null, problems: [{code: 'simulation-failed',
                    reason: `The design could not be simulated: ${e.message}`}]});
            }
        }).catch(e => live && setSim({values: {}, note: null,
            problems: [{code: 'simulator-unavailable',
                reason: `The gate-level simulator could not be loaded: ${e.message}`}]}));
        return () => { live = false; };
    }, [netlistText, inputs]);
    const {bindings, refusals, warnings, plan, top, canonical, inputPorts, simNote} =
            React.useMemo(() => {
        const {constraints, problems} = parseCst(text);

        // The netlist is OPTIONAL. Without it the bridge can still say where a
        // port lands; with it, it can also say whether the port exists -- which
        // is how a rename that silently unplugs a signal gets caught.
        let netlistPorts = null;
        let parsedNetlist = null;
        let top = null;
        const netlistProblems = [];
        const trimmed = netlistText.trim();
        if (trimmed) {
            try {
                parsedNetlist = JSON.parse(trimmed);
                const read = readPorts(parsedNetlist);
                netlistPorts = Object.keys(read.ports).length ? read.ports : null;
                top = read.top;
                netlistProblems.push(...read.problems);
            } catch (e) {
                netlistProblems.push({code: 'netlist-not-json',
                    reason: `The netlist is not valid JSON: ${e.message}`});
            }
        }

        const out = bridge({constraints, part: TANG_NANO_20K, netlistPorts});
        if (netlistPorts) netlistProblems.push(...checkWidths(netlistPorts, out.bindings));
        problems.push(...netlistProblems);

        // The design's own values arrive asynchronously, from the lazy chunk.
        const values = sim.values;
        const simNote = sim.note;
        problems.push(...sim.problems);
        // Dry run: the same call the circuit engine would take, against a
        // recorder instead of a board. With no values -- because nothing models
        // the fabric yet -- every output comes back as "undriven", which is the
        // honest picture rather than a row of zeroes.
        const ops = [];
        const {unset} = applyPortValues({setPin: (...a) => ops.push(a)}, out.bindings, values);
        // Canonical .cst for the real Gowin toolchain. Only the placements that
        // actually reach the board: handing openFPGALoader a constraint naming a
        // pin this board does not bring out would be wrong in a new way rather
        // than incomplete.
        const reachable = constraintsFromBindings(out.bindings, constraints);
        const canonical = emitCst(reachable,
            {header: 'Generated by Brickwright from the constraints above.\nOnly ports that reach a header pin are included.'});
        return {...out, refusals: [...problems, ...out.refusals], plan: {ops, unset},
            top, canonical, inputPorts: netlistPorts
                ? Object.entries(netlistPorts).filter(([, p]) => p.direction === 'input').map(([n]) => n)
                : [], simNote};
    }, [text, netlistText, sim]);

    return (
        <div style={{padding: '1.25rem', maxWidth: '52rem', lineHeight: 1.5, overflowY: 'auto'}}>
            <h2 style={{marginTop: 0}}>{'FPGA — Tang Nano 20K'}</h2>
            <p style={{marginTop: 0}}>
                {'Which of a design’s pins can actually reach the breadboard. This reads '}
                {'Gowin constraints against the real board part. It does not synthesise, '}
                {'simulate or flash anything — none of that is built yet.'}
            </p>

            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                spellCheck={false}
                style={{width: '100%', minHeight: '11rem', fontFamily: 'monospace',
                    fontSize: '0.85rem', padding: '0.6rem'}}
            />

            <details style={{margin: '0.75rem 0'}}>
                <summary style={{cursor: 'pointer'}}>
                    {'Optional: paste a Yosys JSON netlist to also check the ports exist'}
                    {top ? <strong>{` — top module: ${top}`}</strong> : null}
                </summary>
                <textarea
                    value={netlistText}
                    onChange={e => setNetlistText(e.target.value)}
                    spellCheck={false}
                    placeholder={'yosys -p \'synth_gowin -json out.json\' design.v'}
                    style={{width: '100%', minHeight: '7rem', fontFamily: 'monospace',
                        fontSize: '0.8rem', padding: '0.6rem', marginTop: '0.4rem'}}
                />
            </details>

            <h3>{`Reaches the board (${bindings.length})`}</h3>
            <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                {bindings.map(b => (
                    <Row key={`${b.port}-${b.pin}`} tone="#3a8a3a">
                        <code>{b.port}</code>{' → pin '}<code>{b.pin}</code>
                        {' → terminal '}<code>{b.terminal}</code>
                        {b.sharedWith ? <em style={{opacity: 0.8}}>{' (shares onboard hardware)'}</em> : null}
                    </Row>
                ))}
                {bindings.length ? null : <li style={{opacity: 0.7}}>{'Nothing placed yet.'}</li>}
            </ul>

            {warnings.length ? (
                <>
                    <h3>{`Usable, with a caveat (${warnings.length})`}</h3>
                    <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                        {warnings.map((w, i) => (
                            <Row key={i} tone="#b8860b"><strong>{w.port}</strong>{`: ${w.reason}`}</Row>
                        ))}
                    </ul>
                </>
            ) : null}

            {refusals.length ? (
                <>
                    <h3>{`Cannot reach the board (${refusals.length})`}</h3>
                    <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                        {refusals.map((r, i) => (
                            <Row key={i} tone="#b34747">
                                <strong>{r.port || `line ${r.lineNumber}`}</strong>{`: ${r.reason}`}
                            </Row>
                        ))}
                    </ul>
                </>
            ) : null}

            {inputPorts.length ? (
                <>
                    <h3>{'Design inputs'}</h3>
                    <p style={{marginTop: 0, opacity: 0.8}}>
                        {'Nothing drives these yet, so set them here and watch the outputs follow.'}
                    </p>
                    <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
                        {inputPorts.map(name => (
                            <label key={name} style={{display: 'flex', alignItems: 'center', gap: '0.35rem'}}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(inputs[name])}
                                    onChange={e => setInputs({...inputs, [name]: e.target.checked})}
                                />
                                <code>{name}</code>
                            </label>
                        ))}
                    </div>
                </>
            ) : null}

            <h3>
                {'What the circuit engine would be told'}
                {simNote ? <span style={{opacity: 0.7, fontWeight: 'normal'}}>{` — ${simNote}`}</span> : null}
            </h3>
            <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                {plan.ops.map(([terminal, mode, driveHigh], i) => (
                    <Row key={i} tone="#4a6fa5">
                        <code>{terminal}</code>{` → ${mode}`}
                        {mode === 'pushpull' ? <strong>{driveHigh ? ' HIGH' : ' LOW'}</strong> : null}
                        {mode === 'input' ? <em style={{opacity: 0.8}}>{' (high-Z: the design reads it)'}</em> : null}
                    </Row>
                ))}
                {plan.unset.map((u, i) => (
                    <Row key={`u${i}`} tone="#7a7a7a">
                        <code>{u.terminal}</code>
                        {' — undriven: nothing models the design yet, so there is no value to put on it.'}
                    </Row>
                ))}
                {plan.ops.length || plan.unset.length ? null : <li style={{opacity: 0.7}}>{'Nothing to drive.'}</li>}
            </ul>

            {canonical ? (
                <>
                    <h3>{'Verilog (for synthesis)'}</h3>
            <p style={{marginTop: 0, opacity: 0.8}}>
                {'No synthesis service is configured, so nothing here is built yet. '}
                {'What does work is the licence check — it decides whether a design '}
                {'may be built on a shared server at all.'}
            </p>
            <textarea
                value={hdl}
                onChange={e => setHdl(e.target.value)}
                spellCheck={false}
                placeholder={'// SPDX-License-Identifier: MIT\nmodule blink(output led);\n  assign led = 1\'b1;\nendmodule'}
                style={{width: '100%', minHeight: '8rem', fontFamily: 'monospace',
                    fontSize: '0.85rem', padding: '0.6rem'}}
            />
            {hdl.trim() ? (
                <ul style={{listStyle: 'none', padding: 0, margin: '0.5rem 0 0'}}>
                    {hdlScreen.refusals.map((r, i) => (
                        <Row key={`sr${i}`} tone="#b34747">
                            <strong>{r.spdx || 'copyleft'}</strong>{`: ${r.reason}`}
                        </Row>
                    ))}
                    {hdlScreen.warnings.map((w, i) => (
                        <Row key={`sw${i}`} tone="#b8860b">{w.reason}</Row>
                    ))}
                    {hdlScreen.refusals.length || hdlScreen.warnings.length ? null : (
                        <Row tone="#3a8a3a">
                            {'Declares a permissive licence — it could be built on a shared '}
                            {'server once one exists.'}
                        </Row>
                    )}
                </ul>
            ) : null}
            <h3>{'Where it would be built'}</h3>
            <ul style={{listStyle: 'none', padding: 0, margin: '0 0 0.5rem'}}>
                {catalog.map(entry => {
                    const p = probe.probes.find(x => x.id === entry.id);
                    const isAvailable = probe.available.includes(entry.id);
                    return (
                        <Row key={entry.id} tone={isAvailable ? '#3a8a3a' : '#7a7a7a'}>
                            <strong>{entry.label}</strong>
                            {isAvailable ? ' — available' : ` — unavailable: ${p ? p.reason : 'not probed'}`}
                            <div style={{opacity: 0.75, fontSize: '0.9em'}}>{entry.description}</div>
                        </Row>
                    );
                })}
            </ul>
            {offerable(catalog, probe.available).length > 1 ? (
                <p>
                    <label>
                        {'Backend: '}
                        <select value={backend} onChange={ev => setBackend(ev.target.value)}>
                            <option value="auto">{'Auto'}</option>
                            {offerable(catalog, probe.available).map(en => (
                                <option key={en.id} value={en.id}>{en.label}</option>
                            ))}
                        </select>
                    </label>
                </p>
            ) : null}
            <p style={{opacity: 0.85}}>
                {selection.accepted
                    ? <>{'Builds on '}<strong>{selection.selected.label}</strong>{` — ${selection.reason}`}</>
                    : <><strong>{selection.code}</strong>{`: ${selection.reason}`}</>}
            </p>

            <p>
                <button
                    type="button"
                    onClick={() => synthesise({
                        files: [{name: 'design.v', source: hdl}],
                        constraints: text,
                        // The SELECTED backend's endpoint, not the configured one.
                        // Passing nothing here made the button refuse
                        // `no-synthesis-service` even when a service was
                        // configured and the selector had just said it would
                        // build there — a selection displayed but never aimed at.
                        endpoint: selection.accepted ? selection.selected.endpoint : null
                    }).then(setSynth)}
                    disabled={!hdl.trim() || !selection.accepted}
                >{'Synthesise'}</button>
                {synth && !synth.ok ? (
                    <span style={{marginLeft: '0.6rem', opacity: 0.85}}>
                        <strong>{synth.code}</strong>{`: ${synth.reason}`}
                    </span>
                ) : null}
            </p>

            <h3>{'Synthesise in this browser (TN6a)'}</h3>
            <p style={{opacity: 0.85}}>
                {'Yosys runs here, producing a NETLIST the simulator above can run. '}
                {'It does not produce a bitstream — that needs place and route, another '}
                {'183 MB, which is not offered yet.'}
            </p>
            <p>
                {/* The state is always shown WITH its reason, including the
                    refusals: "this browser has no WasmGC" tells a reader what to
                    do and "unavailable" does not. */}
                <strong>{local ? local.code || local.state : 'starting'}</strong>
                {local ? `: ${local.reason}` : ''}
            </p>
            <p>
                <button
                    type="button"
                    onClick={() => {
                        setLocalBusy(true);
                        localClient.download({consent: true})
                            .then(r => setLocal(r.result && r.result.ok
                                ? {state: 'ready', available: true, ok: true,
                                    reason: 'The toolchain is downloaded.'}
                                : r.result))
                            .finally(() => setLocalBusy(false));
                    }}
                    /* Offered only where it can work and is not already here:
                       a button that can only refuse teaches the user the tool is
                       broken rather than that something is missing. The reason is
                       already on screen above. */
                    disabled={localBusy || !local || local.code !== 'not-downloaded'}
                >{localBusy ? 'Downloading…' : 'Download the toolchain (77 MB, once)'}</button>
            </p>
            <p>
                <button
                    type="button"
                    onClick={() => {
                        setLocalBusy(true);
                        localClient.synthesise({files: [{name: 'design.v', source: hdl}]})
                            .then(r => setSynth(r.result))
                            .finally(() => setLocalBusy(false));
                    }}
                    disabled={localBusy || !hdl.trim() || !local || !local.available}
                >{'Synthesise here'}</button>
            </p>

            <h3>{'Constraints for the Gowin toolchain'}</h3>
                    <p style={{marginTop: 0, opacity: 0.8}}>
                        {'Canonical .cst covering only the ports that reach a header pin. '}
                        {'This is what leaves for real silicon.'}
                    </p>
                    <pre style={{background: 'rgba(127,127,127,0.1)', padding: '0.7rem',
                        borderRadius: 4, overflowX: 'auto', fontSize: '0.82rem'}}>{canonical}</pre>
                </>
            ) : null}

            <p style={{opacity: 0.7, marginTop: '1.5rem'}}>
                {'Planned next: a model of the design to supply those values, then hosted '}
                {'synthesis, then flashing from the native app.'}
            </p>
        </div>
    );
};

export default FpgaTab;
