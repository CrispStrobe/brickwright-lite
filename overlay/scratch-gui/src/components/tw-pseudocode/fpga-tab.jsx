import React from 'react';
import TANG_NANO_20K from 'bw-circuit-ui/parts-data/tang_nano_20k.json';
import {parseCst, emitCst} from '../../lib/bw-fpga/cst.js';
import {bridge, constraintsFromBindings} from '../../lib/bw-fpga/port-bridge.js';
import {applyPortValues} from '../../lib/bw-fpga/drive.js';
import {EXAMPLES} from '../../lib/bw-fpga/examples.js';
import {buildDemoBoard} from '../../lib/bw-fpga/demo-board.js';
import {readPorts, checkWidths, detectClockPort} from '../../lib/bw-fpga/yosys.js';
// Small and dependency-free, so these stay static: the licence screen is useful
// on its own, and the synthesis client's only job today is to refuse honestly.
import {screenForHostedSynthesis} from '../../lib/bw-fpga/licence.js';
import {synthesise} from '../../lib/bw-fpga/synthesis.js';
import {createLocalClient} from '../../lib/bw-fpga/local-client.js';
import {probeFlash, flashBitstream} from '../../lib/bw-fpga/fpga-tauri-transport.js';
import {webUsbSupported} from '../../lib/bw-fpga/webusb-flash.js';
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

// The schematic view (Rung 1 of the FPGA visual analog): the synthesised design
// drawn as gates. Its own chunk, because it pulls elkjs (layout) and the netlist
// converter — loaded only when a design has been synthesised and the view shows.
const FpgaSchematic = React.lazy(() =>
    import(/* webpackChunkName: "bw-fpga-schematic" */ './fpga-schematic.jsx'));
// Rung 2 of the visual analog: the design's outputs as waveforms over time.
const FpgaWaveform = React.lazy(() =>
    import(/* webpackChunkName: "bw-fpga-waveform" */ './fpga-waveform.jsx'));

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
    // How many clock edges the sequential design has been stepped by. A clocked
    // design is combinational-until-clocked: at 0 the flops hold reset, and each
    // "Step" advances one whole cycle so the board can be read between clicks.
    const [clockCycles, setClockCycles] = React.useState(0);
    // A free-running clock: tick on an interval so the design advances on its
    // own. The Controller/Widgets view is a right-pane dock on OTHER tabs, so a
    // user cannot step the clock here and watch the mirrored LEDs there at the
    // same time — a self-running clock decouples the two. This tab is
    // force-rendered (gui.jsx keeps every TabPanel mounted), so the interval
    // keeps advancing while the user watches the Controller view.
    const [autoRun, setAutoRun] = React.useState(false);
    // Whether the design's outputs have been mirrored into the Controller/Widgets
    // view yet — the last step of the first-run guide.
    const [mirrored, setMirrored] = React.useState(false);
    // One-click demo board: wiring a Tang Nano + 4 LEDs so a synthesised counter
    // has something to light. Feedback only — the wiring happens on the live board.
    const [demoMsg, setDemoMsg] = React.useState(null);
    // The first-run guide tracks the three steps through the tab's real state and
    // stays until the user hides it (or opts out for good in this browser).
    const [guideDismissed, setGuideDismissed] = React.useState(() => {
        try { return localStorage.getItem('bw-fpga-guide-done') === '1'; } catch { return false; }
    });
    const [sim, setSim] = React.useState({values: {}, note: null, problems: []});
    const [hdl, setHdl] = React.useState('');
    const [synth, setSynth] = React.useState(null);
    const [backend, setBackend] = React.useState('auto');
    const [probe, setProbe] = React.useState({available: [], probes: []});
    // TN4. Flashing needs the native app; a browser can only download the .fs.
    // Probed fail-closed, so a Flash button appears only where it actually works.
    const [flash, setFlash] = React.useState({available: false});
    const [flashMsg, setFlashMsg] = React.useState(null);
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

    React.useEffect(() => {
        let live = true;
        probeFlash().then(r => live && setFlash(r));
        return () => { live = false; };
    }, []);

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

    // A successful synthesis was, until now, invisible: `synth` was rendered only
    // when NOT ok, so a working build stranded its bitstream (hosted) or netlist
    // (local) in state with no way to reach it. Browsers CAN save a Blob (unlike
    // the artifact sandbox), so a successful result becomes a download here. The
    // object URLs are revoked when the result changes, so they do not leak.
    const artefacts = React.useMemo(() => {
        if (!synth || !synth.ok) return null;
        const out = {};
        if (synth.bitstream) {
            const bin = atob(synth.bitstream);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            out.bitstream = {url: URL.createObjectURL(new Blob([bytes],
                {type: 'application/octet-stream'})), bytes: bytes.length};
        }
        if (synth.netlist) {
            out.netlist = {url: URL.createObjectURL(new Blob(
                [JSON.stringify(synth.netlist)], {type: 'application/json'})),
            modules: Object.keys(synth.netlist.modules || {}).length};
        }
        return out;
    }, [synth]);
    React.useEffect(() => () => {
        if (artefacts && artefacts.bitstream) URL.revokeObjectURL(artefacts.bitstream.url);
        if (artefacts && artefacts.netlist) URL.revokeObjectURL(artefacts.netlist.url);
    }, [artefacts]);

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
                const clockPort = detectClockPort(ports);
                for (const [name, p] of Object.entries(ports)) {
                    if (p.direction !== 'input') continue;
                    // The clock is driven by tickClock below, not held at a level here.
                    if (name === clockPort) continue;
                    s.setInput(name, inputs[name] ? 1 : 0, p.width || 1);
                }
                // Settle the reset state first; then, if the design has a clock and
                // the user has stepped it, advance that many whole cycles. Both are
                // bounded, so a combinational loop reports rather than hangs.
                const settled = (clockPort && clockCycles > 0)
                    ? s.tickClock(clockPort, clockCycles)
                    : s.settle();
                if (!settled.settled) {
                    return setSim({values: {}, note: null,
                        problems: [{code: 'did-not-settle', reason: settled.reason}]});
                }
                const read = s.outputValues(ports);
                const note = clockPort
                    ? `${clockCycles} clock(s) — settled in ${settled.steps} step(s)`
                    : `settled in ${settled.steps} step(s)`;
                setSim({values: read.values, note, problems: read.problems});
            } catch (e) {
                setSim({values: {}, note: null, problems: [{code: 'simulation-failed',
                    reason: `The design could not be simulated: ${e.message}`}]});
            }
        }).catch(e => live && setSim({values: {}, note: null,
            problems: [{code: 'simulator-unavailable',
                reason: `The gate-level simulator could not be loaded: ${e.message}`}]}));
        return () => { live = false; };
    }, [netlistText, inputs, clockCycles]);
    // A new netlist is a new design: its flops start at reset, so the step count
    // from the previous design must not fast-forward it. Resetting here keeps the
    // clock control honest when an example is loaded or the design is re-synthesised.
    React.useEffect(() => { setClockCycles(0); }, [netlistText]);
    const {bindings, refusals, warnings, plan, top, canonical, clockPort, inputPorts, simNote} =
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
            top, canonical, clockPort: netlistPorts ? detectClockPort(netlistPorts) : null,
            inputPorts: netlistPorts
                ? Object.entries(netlistPorts)
                    .filter(([n, p]) => p.direction === 'input' && n !== detectClockPort(netlistPorts))
                    .map(([n]) => n)
                : [], simNote};
    }, [text, netlistText, sim]);

    // The header pins the design DRIVES (outputs), for mirroring into the
    // Controller/Widgets view. Inputs are excluded — a mirrored indicator shows
    // what the design puts out, not what the breadboard feeds in.
    const outputPins = React.useMemo(() => {
        const pins = (bindings || [])
            .filter(b => b.direction !== 'input' && typeof b.pin === 'number')
            .map(b => b.pin);
        return [...new Set(pins)].sort((a, b) => a - b);
    }, [bindings]);
    // The demo-board builder runs from async callbacks (it may wait for the
    // Circuit tab to mount), so it reads the latest output pins through a ref
    // rather than a stale closure — the board then matches whatever design is
    // loaded when the button is pressed. Only trust the pins once a netlist
    // exists: without one, port DIRECTIONS are unknown, so an input (a clock)
    // would be miscounted as an output and get an LED. No netlist → the
    // builder's own default (15–18) applies.
    const outputPinsRef = React.useRef([]);
    outputPinsRef.current = netlistText.trim() ? outputPins : [];
    // What the schematic lights: the values we actually know — the design's
    // inputs (set below) and its outputs (from the sim). Internal nets stay
    // neutral until Rung 1's follow-up reads them from the live circuit.
    const netValues = React.useMemo(() => {
        const nv = {};
        for (const [k, v] of Object.entries(inputs || {})) nv[k] = v;
        for (const [k, v] of Object.entries(sim.values || {})) nv[k] = v;
        return nv;
    }, [inputs, sim.values]);

    // Drive the on-screen board with the design's outputs, through the live
    // Circuit model.
    //
    // The handle is `window.__circuit`: circuit-tab.jsx's onCircuitReady publishes
    // the live Circuit there (and mirrors it to vm.runtime.circuitModel), and it
    // PERSISTS — the model outlives the designer. That is the whole point here.
    // window.__bwCircuit (CircuitDesigner's mount effect) is a fallback only: it is
    // DELETED when the designer unmounts, which it does whenever a non-Circuit tab
    // — this one — is active under the default debugger dock. So driving through it
    // meant the handle was gone exactly when the FPGA tab needed it: a real-browser
    // drive found the seam dead though every source gate passed (the §7.4 lesson,
    // again). window.__circuit survives the tab switch, so the design actually
    // lights the placed board.
    //
    // Guarded: with no circuit ever loaded, or no bound ports, this no-ops.
    React.useEffect(() => {
        const c = (typeof window !== 'undefined') && (window.__circuit || window.__bwCircuit);
        if (!c || typeof c.setPin !== 'function' || !bindings.length) return undefined;
        try {
            const {applied} = applyPortValues(c, bindings, sim.values);
            // Broadcast the driven output pins so the Controller/Widgets view can
            // mirror them (gui.jsx owns the panel; it only needs pin -> level).
            const leds = applied
                .filter(a => a.mode === 'pushpull')
                .map(a => ({pin: a.pin, high: Boolean(a.driveHigh)}));
            if (leds.length && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bw-fpga-output', {detail: {leds}}));
            }
        } catch (e) { /* the board may not have the Tang Nano placed or pins wired */ }
        return undefined;
    }, [sim.values, bindings]);

    // The free-running clock (see autoRun). Ticking clockCycles re-runs the sim
    // effect, which drives the board and broadcasts the outputs above.
    React.useEffect(() => {
        if (!autoRun) return undefined;
        const id = setInterval(() => setClockCycles(c => c + 1), 600);
        return () => clearInterval(id);
    }, [autoRun]);

    // Wire the demo board — out of the box, from this tab, with no detour.
    //
    // The board only exists once the Circuit tab's designer has mounted and
    // published `window.__circuit` (see the drive effect above). A user who lands
    // straight on this tab has never opened Circuit, so that handle is absent and a
    // naive click had nothing to build on. Rather than reach across tabs to force a
    // hidden designer to mount (fragile: the designer's render() omits itself under
    // the default debugger dock when this tab is the visible one), we ASK the app to
    // make the Circuit tab visible — the one reliable path that mounts the designer,
    // runs onCircuitReady, and shows the wired board. gui.jsx owns the tab list and
    // listens for `bw-activate-tab`; we only know the index. Then we wait for the
    // handle to appear and build. The board persists, so the user can switch right
    // back here and drive it.
    const CIRCUIT_TAB_INDEX = 4;
    const liveCircuit = () => (typeof window !== 'undefined'
        ? (window.__circuit && typeof window.__circuit.addPart === 'function' ? window.__circuit : null)
        : null);
    const buildOnCircuit = React.useCallback(c => {
        try {
            // Wire LEDs on the pins the LOADED design drives, so the board matches
            // whatever example is open — not always 15–18. With no design yet, the
            // builder's own default (pins 15–18) applies, which is where the
            // “Counting sequence” and chaser examples put their LEDs.
            const pins = outputPinsRef.current;
            const result = buildDemoBoard(c, pins.length ? {pins} : {});
            const litPins = result.leds.map(l => l.pin);
            setDemoMsg({ok: true, text: `Wired a Tang Nano 20K with ${litPins.length} `
                + `LED${litPins.length === 1 ? '' : 's'} on pin${litPins.length === 1 ? '' : 's'} `
                + `${litPins.join(', ')}. `
                + (pins.length
                    ? 'Synthesise and Step the clock — they follow the design on the board.'
                    : 'Load “Counting sequence”, Synthesise, then Step the clock — '
                        + 'they count up in binary on the board.')});
        } catch (e) {
            setDemoMsg({ok: false, text: `Could not wire the demo board: ${e.message}`});
        }
    }, []);
    const wireDemoBoard = React.useCallback(() => {
        const now = liveCircuit();
        if (now) { buildOnCircuit(now); return; }
        if (typeof window === 'undefined') return;
        // Ask gui.jsx to show the Circuit tab so its designer mounts and publishes
        // window.__circuit, then poll briefly for the handle.
        setDemoMsg({pending: true, text: 'Setting up the board…'});
        window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: CIRCUIT_TAB_INDEX}}));
        const deadline = Date.now() + 8000;
        const tick = () => {
            const c = liveCircuit();
            if (c) { buildOnCircuit(c); return; }
            if (Date.now() > deadline) {
                setDemoMsg({ok: false, text: 'Open the 🔌 Circuit tab once so the board '
                    + 'exists, then try again.'});
                return;
            }
            setTimeout(tick, 150);
        };
        setTimeout(tick, 150);
    }, [buildOnCircuit]);

    return (
        // Scrolling here needs the pattern circuit-tab.jsx uses, not a flex one. The tab
    // panel is `position:relative` but its ancestors (gui_tabs, the panel) all carry
    // min-height:auto and overflow:visible, so a flow child just grows the chain until
    // gui_flex-wrapper clips it with overflow:hidden — no user scroll anywhere (reported
    // unusable 2026-09-17; a flex minHeight:0 fix was NOT enough, the chain still grew).
    // Absolute inset:0 makes this contribute ZERO flow height, so the panel stays at its
    // bounded height and this fills it and scrolls its own content. maxWidth lives on an
    // inner wrapper so the scroll area is full width.
    <div style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        overflowY: 'auto', padding: '1.25rem', lineHeight: 1.5, boxSizing: 'border-box'}}>
        <div style={{maxWidth: '52rem'}}>
            {guideDismissed ? null : (() => {
                // Progress is READ from the tab's real state, so a step ticks when
                // the user actually does it — not a scripted tour that lies.
                const steps = [
                    {done: Boolean(demoMsg && demoMsg.ok),
                        label: 'Wire up a demo board',
                        hint: 'the ⬢ button below wires a Tang Nano + 4 LEDs on pins 15–18'},
                    {done: Boolean((synth && synth.ok) || netlistText.trim()),
                        label: 'Load a design and synthesise it',
                        hint: 'try “Counting sequence”, then Synthesise'},
                    {done: clockCycles > 0,
                        label: 'Step the clock',
                        hint: 'the four LEDs count up in binary on the board'},
                    {done: mirrored,
                        label: 'See it in the Controller view',
                        hint: 'the ⎈ button under Clock mirrors the LEDs as widgets and runs the design'}
                ];
                const allDone = steps.every(s => s.done);
                const hide = () => {
                    try { localStorage.setItem('bw-fpga-guide-done', '1'); } catch (e) { /* private mode */ }
                    setGuideDismissed(true);
                };
                return (
                    <div style={{border: '1px solid rgba(74,111,165,0.4)', borderRadius: 6,
                        padding: '0.75rem 1rem', margin: '0 0 1rem', background: 'rgba(74,111,165,0.07)'}}>
                        <strong>{allDone
                            ? '🎉 You designed a chip, synthesised it, and watched it light LEDs on the board and in the Widgets view.'
                            : 'New to the FPGA lab? Four steps to see your logic light LEDs:'}</strong>
                        <ol style={{margin: '0.5rem 0 0.25rem', paddingLeft: '1.4rem'}}>
                            {steps.map((s, i) => (
                                <li key={i} style={{opacity: s.done ? 0.55 : 1, margin: '0.15rem 0'}}>
                                    {s.done ? '✓ ' : ''}{s.label}
                                    <span style={{opacity: 0.7}}>{` — ${s.hint}`}</span>
                                </li>
                            ))}
                        </ol>
                        <button type="button" onClick={hide}
                            style={{marginTop: '0.35rem', padding: '0.15rem 0.6rem', cursor: 'pointer'}}
                        >{allDone ? 'Done' : 'Hide this'}</button>
                    </div>
                );
            })()}
            <h2 style={{marginTop: 0}}>{'FPGA — Tang Nano 20K'}</h2>
            <p style={{marginTop: 0}}>
                {'Write Verilog, synthesise it to a bitstream on the hosted service or to a '}
                {'netlist here in the browser, and check that your pin constraints reach the '}
                {'board. Copyleft sources are refused on the shared server and must be built '}
                {'locally — the licence check below decides.'}
            </p>

            {/* PRIMARY FLOW: the design, and building it. This used to be gated on
                `canonical` (a generated .cst), so nothing here appeared until the user
                typed pin constraints first — the tab looked like two empty textareas.
                The pin checker is now a collapsible panel at the bottom. */}
            <h3>{'Verilog'}</h3>
            <p style={{margin: '0 0 0.5rem', opacity: 0.85}}>
                {'New here? Load a starter design, then Synthesise:'}
                {EXAMPLES.map(ex => (
                    <button
                        key={ex.id}
                        type="button"
                        title={ex.blurb}
                        onClick={() => { setHdl(ex.verilog); setText(ex.cst); setSynth(null); }}
                        style={{marginLeft: '0.4rem', padding: '0.15rem 0.5rem', cursor: 'pointer'}}
                    >{ex.label}</button>
                ))}
            </p>
            <p style={{margin: '0 0 0.75rem'}}>
                <button
                    type="button"
                    onClick={() => wireDemoBoard()}
                    style={{padding: '0.2rem 0.6rem', cursor: 'pointer'}}
                >{'⬢ Wire up a demo board'}</button>
                {demoMsg ? (
                    <span style={{marginLeft: '0.5rem', opacity: 0.9,
                        color: demoMsg.ok ? '#2e7d32' : (demoMsg.pending ? '#555' : '#b34747')}}>{demoMsg.text}</span>
                ) : null}
            </p>
            <textarea
                value={hdl}
                onChange={e => setHdl(e.target.value)}
                spellCheck={false}
                placeholder={'// SPDX-License-Identifier: MIT\nmodule blink(output led);\n  assign led = 1\'b1;\nendmodule'}
                style={{width: '100%', minHeight: '9rem', fontFamily: 'monospace',
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
                            {'Declares a permissive licence — it may be built on the shared server.'}
                        </Row>
                    )}
                </ul>
            ) : null}

            <h3>{'Where it would be built'}</h3>
            <ul style={{listStyle: 'none', padding: 0, margin: '0 0 0.5rem'}}>
                {catalog.map(entry => {
                    const pr = probe.probes.find(x => x.id === entry.id);
                    const isAvailable = probe.available.includes(entry.id);
                    return (
                        <Row key={entry.id} tone={isAvailable ? '#3a8a3a' : '#7a7a7a'}>
                            <strong>{entry.label}</strong>
                            {isAvailable ? ' — available' : ` — unavailable: ${pr ? pr.reason : 'not probed'}`}
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
                        endpoint: selection.accepted ? selection.selected.endpoint : null
                    }).then(r => {
                        setSynth(r);
                        // Drive the board from the design: feed the GENERIC sim
                        // netlist (not the Gowin-mapped `netlist`, which the sim
                        // cannot read) into the simulator's input.
                        if (r && r.ok && r.simNetlist) {
                            setNetlistText(JSON.stringify(r.simNetlist, null, 2));
                        }
                    })}
                    disabled={!hdl.trim() || !selection.accepted}
                >{'Synthesise'}</button>
                {synth && !synth.ok ? (
                    <span style={{marginLeft: '0.6rem', opacity: 0.85}}>
                        <strong>{synth.code}</strong>{`: ${synth.reason}`}
                    </span>
                ) : null}
                {synth && synth.ok && artefacts ? (
                    <span style={{marginLeft: '0.6rem'}}>
                        {artefacts.bitstream ? (
                            <>
                                {`✓ Built a ${artefacts.bitstream.bytes.toLocaleString()}-byte bitstream. `}
                                <a href={artefacts.bitstream.url} download="design.fs">{'Download .fs'}</a>
                                {flash.available ? (
                                    <button
                                        type="button"
                                        style={{marginLeft: '0.5rem', padding: '0.15rem 0.5rem', cursor: 'pointer'}}
                                        onClick={() => {
                                            setFlashMsg('Flashing…');
                                            flashBitstream(synth.bitstream)
                                                .then(r => setFlashMsg(`✓ ${r}`))
                                                .catch(e => setFlashMsg(`Flash failed: ${e.message}`));
                                        }}
                                    >{'Flash to board'}</button>
                                ) : null}
                                {flashMsg ? <span style={{marginLeft: '0.5rem', opacity: 0.85}}>{flashMsg}</span> : null}
                                <div style={{opacity: 0.7, fontSize: '0.85em', marginTop: '0.25rem'}}>
                                    {flash.available ? (
                                        'Flashing runs openFPGALoader in the native app.'
                                    ) : (
                                        <>
                                            {'A browser cannot flash yet. With the board on USB, use the CLI '}
                                            <code>{'bw-fpga flash ./design.fs'}</code>{' or '}
                                            <code>{'openFPGALoader -b tangnano20k design.fs'}</code>{'.'}
                                            {webUsbSupported() ? (
                                                <div style={{marginTop: '0.15rem'}}>
                                                    {'Your browser has WebUSB; direct in-browser flashing is '
                                                        + 'planned (TANG-NANO §TN4) but not built yet.'}
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            </>
                        ) : artefacts.netlist ? (
                            <>
                                {`✓ Synthesised a netlist (${artefacts.netlist.modules} modules). `}
                                <a href={artefacts.netlist.url} download="design.json">{'Download netlist'}</a>
                            </>
                        ) : '✓ Done.'}
                    </span>
                ) : null}
            </p>

            <h3>{'Synthesise in this browser (TN6a)'}</h3>
            <p style={{opacity: 0.85}}>
                {'Yosys runs here, producing a netlist you can download or check in the pin '}
                {'panel below. It does not produce a bitstream — that needs place and route, '}
                {'another 183 MB, which is not offered yet.'}
            </p>
            <p>
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
                    disabled={localBusy || !local || local.code !== 'not-downloaded'}
                >{localBusy ? 'Downloading…' : 'Download the toolchain (77 MB, once)'}</button>
            </p>
            <p>
                <button
                    type="button"
                    onClick={() => {
                        setLocalBusy(true);
                        localClient.synthesise({files: [{name: 'design.v', source: hdl}]})
                            .then(r => {
                                setSynth(r.result);
                                // Feed the GENERIC sim netlist into the pin panel's
                                // simulator, which is what the blurb above promises
                                // ("a netlist you can ... check in the pin panel
                                // below"). It must be simNetlist, not netlist: the
                                // synth_gowin `netlist` is Gowin-mapped and the sim
                                // cannot read it. The textarea drives the sim, so
                                // setting it is all it takes.
                                if (r.result && r.result.ok && r.result.simNetlist) {
                                    setNetlistText(JSON.stringify(r.result.simNetlist, null, 2));
                                }
                            })
                            .finally(() => setLocalBusy(false));
                    }}
                    disabled={localBusy || !hdl.trim() || !local || !local.available}
                >{'Synthesise here'}</button>
            </p>

            {/* SECONDARY: pin-reachability checker, collapsed by default. It reads the
                Gowin constraints below against the real board part; those same
                constraints are sent with a hosted build. */}
            <details style={{marginTop: '1.5rem'}}>
                <summary style={{cursor: 'pointer', fontWeight: 'bold'}}>
                    {`Check which pins reach the board (${bindings.length} placed`}
                    {refusals.length ? `, ${refusals.length} cannot` : ''}
                    {')'}
                </summary>
                <p style={{opacity: 0.85}}>
                    {'Which of a design’s pins can actually reach the breadboard. This reads '}
                    {'Gowin constraints against the real board part, and the same constraints '}
                    {'are sent with a hosted build.'}
                </p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    spellCheck={false}
                    style={{width: '100%', minHeight: '9rem', fontFamily: 'monospace',
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

                {netlistText.trim() ? (
                    <>
                        <h3>{'Schematic — your design as gates'}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {'This is the Verilog above, synthesised to logic gates. Inputs sit on '}
                            {'the left, outputs on the right; a wire lights with the value it carries '}
                            {'as you step the clock.'}
                        </p>
                        <React.Suspense fallback={<p style={{opacity: 0.7}}>{'Loading the schematic view…'}</p>}>
                            <FpgaSchematic netlistText={netlistText} netValues={netValues} />
                        </React.Suspense>
                    </>
                ) : null}

                {netlistText.trim() ? (
                    <>
                        <h3>{'Waveforms — the outputs over time'}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {'The design run from reset for a few clock cycles: each output bit as a '}
                            {'square wave. A counter reads bottom-up — the lowest bit toggles every '}
                            {'cycle, the highest slowest.'}
                        </p>
                        <React.Suspense fallback={<p style={{opacity: 0.7}}>{'Loading the waveform view…'}</p>}>
                            <FpgaWaveform netlistText={netlistText} inputs={inputs} />
                        </React.Suspense>
                    </>
                ) : null}

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

                {clockPort ? (
                    <>
                        <h3>{'Clock'}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {'This design is clocked on '}<code>{clockPort}</code>
                            {'. Step it to advance the design one cycle at a time and watch '
                                + 'the outputs — and the board — follow.'}
                        </p>
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap'}}>
                            <button
                                type="button"
                                onClick={() => setClockCycles(c => c + 1)}
                                style={{padding: '0.35rem 0.8rem', cursor: 'pointer'}}
                            >{'Step clock ▸'}</button>
                            <button
                                type="button"
                                onClick={() => setClockCycles(c => c + 8)}
                                style={{padding: '0.35rem 0.8rem', cursor: 'pointer'}}
                            >{'+8'}</button>
                            <button
                                type="button"
                                disabled={clockCycles === 0}
                                onClick={() => setClockCycles(0)}
                                style={{padding: '0.35rem 0.8rem', cursor: clockCycles === 0 ? 'default' : 'pointer'}}
                            >{'Reset'}</button>
                            <button
                                type="button"
                                onClick={() => setAutoRun(v => !v)}
                                style={{padding: '0.35rem 0.8rem', cursor: 'pointer',
                                    fontWeight: autoRun ? 'bold' : 'normal'}}
                            >{autoRun ? '⏸ Stop auto-run' : '▶ Auto-run'}</button>
                            <span style={{opacity: 0.8}}>
                                {clockCycles}{clockCycles === 1 ? ' cycle' : ' cycles'}
                            </span>
                        </div>
                        {/* Mirror the output pins into the Controller/Widgets view, so the
                            synthesised design's LEDs are visible there too — not only on
                            the placed board. gui.jsx owns the panel; we hand it the pins. */}
                        {outputPins.length ? (
                            <p style={{margin: '0.75rem 0 0'}}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('bw-fpga-leds',
                                            {detail: {pins: outputPins}}));
                                        setAutoRun(true);
                                        setMirrored(true);
                                    }}
                                    style={{padding: '0.35rem 0.8rem', cursor: 'pointer'}}
                                >{'⎈ Show the LEDs in the Controller view'}</button>
                                <span style={{marginLeft: '0.5rem', opacity: 0.75}}>
                                    {`mirrors pins ${outputPins.join(', ')} as indicators and starts the clock`}
                                </span>
                            </p>
                        ) : null}
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
                        <h3>{'Constraints for the Gowin toolchain'}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {'Canonical .cst covering only the ports that reach a header pin. '}
                            {'This is what leaves for real silicon.'}
                        </p>
                        <pre style={{background: 'rgba(127,127,127,0.1)', padding: '0.7rem',
                            borderRadius: 4, overflowX: 'auto', fontSize: '0.82rem'}}>{canonical}</pre>
                    </>
                ) : null}
            </details>

            <p style={{opacity: 0.7, marginTop: '1.5rem'}}>
                {'Planned next: flashing a produced bitstream from the native app.'}
            </p>
        </div>
        </div>
    );
};

export default FpgaTab;
