import React from 'react';
import {connect} from 'react-redux';
import TANG_NANO_20K from 'bw-circuit-ui/parts-data/tang_nano_20k.json';
import {parseCst, emitCst} from '../../lib/bw-fpga/cst.js';
import {bridge, constraintsFromBindings} from '../../lib/bw-fpga/port-bridge.js';
import {applyPortValues, readBoardInputs} from '../../lib/bw-fpga/drive.js';
import {verilogToModel} from '../../lib/bw-fpga/verilog-to-model.js';
import {yosysToModel} from '../../lib/bw-fpga/yosys-to-model.js';
import {EXAMPLES} from '../../lib/bw-fpga/examples.js';
import {buildDemoBoard} from '../../lib/bw-fpga/demo-board.js';
import {buildCmosGate} from '../../lib/bw-fpga/cmos-board.js';
import {buildLogicIcGate} from '../../lib/bw-fpga/logic-ic-board.js';
import {LOGIC_IC_GATES, gateToLogicIc} from '../../lib/bw-fpga/logic-ic.js';
import {buildLogicIcCircuit, IC_CIRCUITS} from '../../lib/bw-fpga/logic-ic-circuit.js';
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

const L10N = {
    en: {
        wireDemoBoard: 'Wire up a demo board',
        wireDemoBoardHint: 'the ⬢ button below wires a Tang Nano + 4 LEDs on pins 15–18',
        loadDesign: 'Load a design and synthesise it',
        loadDesignHint: 'try “Counting sequence”, then Synthesise',
        stepClock: 'Step the clock',
        stepClockHint: 'the four LEDs count up in binary on the board',
        seeInController: 'See it in the Controller view',
        seeInControllerHint: 'the ⎈ button under Clock mirrors the LEDs as widgets and runs the design',
        allDone: '🎉 You designed a chip, synthesised it, and watched it light LEDs on the board and in the Widgets view.',
        newToFpga: 'New to the FPGA lab? Four steps to see your logic light LEDs:',
        threeWaysToSee: 'Three ways to SEE it: ',
        designDrawnAs: 'your design is drawn as a ',
        gateSchematic: 'gate schematic',
        andAs: ' and as ',
        waveforms: 'waveforms',
        belowAndYouCan: ' below — and you can ',
        buildYourOwnLogic: 'build your own logic',
        byPlacingGates: ' by placing gates (under “Verilog”), ',
        noHdlTyped: 'no HDL typed.',
        preferNoTyping: 'Prefer no typing? Open ',
        buildItVisuallyQuote: '“build it visually”',
        underVerilog: ' under Verilog and place gates — it runs live and generates the HDL for you.',
        done: 'Done',
        hideThis: 'Hide this',
        fpgaTitle: 'FPGA — Tang Nano 20K',
        fpgaDesc1: 'Write Verilog, synthesise it to a bitstream on the hosted service or to a ',
        fpgaDesc2: 'netlist here in the browser, and check that your pin constraints reach the ',
        fpgaDesc3: 'board. Copyleft sources are refused on the shared server and must be built ',
        fpgaDesc4: 'locally — the licence check below decides.',
        verilogTitle: 'Verilog',
        parseToCanvas: '⤵ Use as Canvas',
        newHere: 'New here? Load a starter design, then Synthesise:',
        orBuildItVisually: 'Or build it visually — place gates and wire them, no Verilog typed',
        loadingGateBuilder: 'Loading the gate builder…',
        orOnFullCanvas: 'Build it visually — drag gates onto the canvas and wire them (no Verilog typed)',
        loadingCanvas: 'Loading the canvas…',
        wireDemoBoardBtn: '⬢ Wire up a demo board',
        buildTransistorsBtn: '⚛ Build the gate from transistors',
        buildIcBtn: '⚙ Build the gate from a 74xx chip',
        buildCircuitBtn: '⚙ Build this circuit',
        permissiveLicence: 'Declares a permissive licence — it may be built on the shared server.',
        whereBuiltTitle: 'Where it would be built',
        backendLabel: 'Backend: ',
        autoOption: 'Auto',
        buildsOn: 'Builds on ',
        synthesiseBtn: 'Synthesise',
        downloadFs: 'Download .fs',
        flashToBoard: 'Flash to board',
        flashingRuns: 'Flashing runs openFPGALoader in the native app.',
        browserCannotFlash1: 'A browser cannot flash yet. With the board on USB, use the CLI ',
        browserCannotFlash2: ' or ',
        browserCannotFlash3: '.',
        browserHasWebUsb: 'Your browser has WebUSB; direct in-browser flashing is planned (TANG-NANO §TN4) but not built yet.',
        downloadNetlist: 'Download netlist',
        doneFeedback: '✓ Done.',
        synthesiseHereTitle: 'Synthesise in this browser (TN6a)',
        yosysRunsHere1: 'Yosys runs here, producing a netlist you can download or check in the pin ',
        yosysRunsHere2: 'panel below. It does not produce a bitstream — that needs place and route, ',
        yosysRunsHere3: 'another 183 MB, which is not offered yet.',
        starting: 'starting',
        downloading: 'Downloading…',
        downloadToolchain: 'Download the toolchain (77 MB, once)',
        synthesiseHereBtn: 'Synthesise here',
        checkPinsTitle: 'Check which pins reach the board (',
        placed: ' placed',
        cannot: ' cannot',
        checkPinsDesc1: 'Which of a design’s pins can actually reach the breadboard. This reads ',
        checkPinsDesc2: 'Gowin constraints against the real board part, and the same constraints ',
        checkPinsDesc3: 'are sent with a hosted build.',
        optionalPasteNetlist: 'Optional: paste a Yosys JSON netlist to also check the ports exist',
        importYosysToCanvas: '⤵ Import prep netlist to Canvas',
        topModule: ' — top module: ',
        schematicTitle: 'Schematic — your design as gates',
        schematicDesc1: 'This is the Verilog above, synthesised to logic gates. Inputs sit on ',
        schematicDesc2: 'the left, outputs on the right; a wire lights with the value it carries ',
        schematicDesc3: 'as you step the clock.',
        loadingSchematic: 'Loading the schematic view…',
        waveformsTitle: 'Waveforms — the outputs over time',
        waveformsDesc1: 'The design run from reset for a few clock cycles: each output bit as a ',
        waveformsDesc2: 'square wave. A counter reads bottom-up — the lowest bit toggles every ',
        waveformsDesc3: 'cycle, the highest slowest.',
        loadingWaveform: 'Loading the waveform view…',
        reachesBoard: 'Reaches the board (',
        pinArrow: ' → pin ',
        terminalArrow: ' → terminal ',
        sharesHardware: ' (shares onboard hardware)',
        nothingPlacedYet: 'Nothing placed yet.',
        usableWithCaveat: 'Usable, with a caveat (',
        cannotReachBoard: 'Cannot reach the board (',
        clockTitle: 'Clock',
        clockDesc1: 'This design is clocked on ',
        clockDesc2: '. Step it to advance the design one cycle at a time and watch the outputs — and the board — follow.',
        stepClockBtn: 'Step clock ▸',
        resetBtn: 'Reset',
        stopAutoRun: '⏸ Stop auto-run',
        autoRun: '▶ Auto-run',
        cycle: ' cycle',
        cycles: ' cycles',
        showLeds: '⎈ Show the LEDs in the Controller view',
        showSeg7: '⧉ Show as a 7-seg number',
        mirrorsPins: 'mirrors pins ',
        asIndicators: ' as indicators and starts the clock',
        designInputsTitle: 'Design inputs',
        nothingDrivesThese: 'Nothing drives these yet, so set them here and watch the outputs follow.',
        whatCircuitEngine: 'What the circuit engine would be told',
        high: ' HIGH',
        low: ' LOW',
        highZ: ' (high-Z: the design reads it)',
        undriven: ' — undriven: nothing models the design yet, so there is no value to put on it.',
        nothingToDrive: 'Nothing to drive.',
        constraintsTitle: 'Constraints for the Gowin toolchain',
        constraintsDesc1: 'Canonical .cst covering only the ports that reach a header pin. ',
        constraintsDesc2: 'This is what leaves for real silicon.',
        plannedNext: 'Planned next: flashing a produced bitstream from the native app.'
    },
    de: {
        wireDemoBoard: 'Demoboard verkabeln',
        wireDemoBoardHint: 'der ⬢ Button unten verkabelt einen Tang Nano + 4 LEDs an Pins 15–18',
        loadDesign: 'Design laden und synthetisieren',
        loadDesignHint: 'versuchen Sie "Counting sequence", dann Synthesise',
        stepClock: 'Uhr takten',
        stepClockHint: 'die vier LEDs zählen binär auf dem Board hoch',
        seeInController: 'In der Controller-Ansicht ansehen',
        seeInControllerHint: 'der ⎈ Button unter Clock spiegelt die LEDs als Widgets und führt das Design aus',
        allDone: '🎉 Sie haben einen Chip entworfen, synthetisiert und gesehen, wie er LEDs auf dem Board und in der Widgets-Ansicht zum Leuchten bringt.',
        newToFpga: 'Neu im FPGA-Labor? Vier Schritte, um Ihre Logik LEDs leuchten zu sehen:',
        threeWaysToSee: 'Drei Möglichkeiten, es zu SEHEN: ',
        designDrawnAs: 'Ihr Design wird gezeichnet als ',
        gateSchematic: 'Gatterschaltplan',
        andAs: ' und als ',
        waveforms: 'Wellenformen',
        belowAndYouCan: ' unten — und Sie können ',
        buildYourOwnLogic: 'Ihre eigene Logik bauen',
        byPlacingGates: ' indem Sie Gatter platzieren (unter "Verilog"), ',
        noHdlTyped: 'ohne HDL zu tippen.',
        preferNoTyping: 'Lieber nicht tippen? Öffnen Sie ',
        buildItVisuallyQuote: '"visuell bauen"',
        underVerilog: ' unter Verilog und platzieren Sie Gatter — es läuft live und generiert das HDL für Sie.',
        done: 'Fertig',
        hideThis: 'Dies ausblenden',
        fpgaTitle: 'FPGA — Tang Nano 20K',
        fpgaDesc1: 'Schreiben Sie Verilog, synthetisieren Sie es zu einem Bitstream im gehosteten Service oder zu einer ',
        fpgaDesc2: 'Netzliste hier im Browser, und prüfen Sie, ob Ihre Pin-Constraints das ',
        fpgaDesc3: 'Board erreichen. Copyleft-Quellen werden auf dem geteilten Server abgelehnt und müssen ',
        fpgaDesc4: 'lokal gebaut werden — die Lizenzprüfung unten entscheidet.',
        verilogTitle: 'Verilog',
        parseToCanvas: '⤵ Use as Canvas',
        newHere: 'Neu hier? Laden Sie ein Starter-Design, dann Synthetisieren:',
        orBuildItVisually: 'Oder visuell bauen — Gatter platzieren und verdrahten, ohne Verilog zu tippen',
        loadingGateBuilder: 'Lade den Gatter-Builder…',
        orOnFullCanvas: 'Visuell bauen — Gatter auf die Leinwand ziehen und verdrahten (kein Verilog)',
        loadingCanvas: 'Lade die Leinwand…',
        wireDemoBoardBtn: '⬢ Demoboard verkabeln',
        buildTransistorsBtn: '⚛ Gatter aus Transistoren bauen',
        buildIcBtn: '⚙ Gatter aus einem 74xx-Chip bauen',
        buildCircuitBtn: '⚙ Diese Schaltung bauen',
        permissiveLicence: 'Erklärt eine freizügige Lizenz — es kann auf dem geteilten Server gebaut werden.',
        whereBuiltTitle: 'Wo es gebaut werden würde',
        backendLabel: 'Backend: ',
        autoOption: 'Auto',
        buildsOn: 'Baut auf ',
        synthesiseBtn: 'Synthetisieren',
        downloadFs: '.fs herunterladen',
        flashToBoard: 'Auf Board flashen',
        flashingRuns: 'Flashen führt openFPGALoader in der nativen App aus.',
        browserCannotFlash1: 'Ein Browser kann noch nicht flashen. Mit dem Board am USB, nutzen Sie die CLI ',
        browserCannotFlash2: ' oder ',
        browserCannotFlash3: '.',
        browserHasWebUsb: 'Ihr Browser hat WebUSB; direktes Flashen im Browser ist geplant (TANG-NANO §TN4) aber noch nicht eingebaut.',
        downloadNetlist: 'Netzliste herunterladen',
        doneFeedback: '✓ Fertig.',
        synthesiseHereTitle: 'In diesem Browser synthetisieren (TN6a)',
        yosysRunsHere1: 'Yosys läuft hier und produziert eine Netzliste, die Sie herunterladen oder im Pin-Panel ',
        yosysRunsHere2: 'unten überprüfen können. Es produziert keinen Bitstream — das erfordert Place and Route, ',
        yosysRunsHere3: 'weitere 183 MB, was noch nicht angeboten wird.',
        starting: 'starte',
        downloading: 'Lade herunter…',
        downloadToolchain: 'Toolchain herunterladen (77 MB, einmalig)',
        synthesiseHereBtn: 'Hier synthetisieren',
        checkPinsTitle: 'Prüfen, welche Pins das Board erreichen (',
        placed: ' platziert',
        cannot: ' können nicht',
        checkPinsDesc1: 'Welche Pins eines Designs tatsächlich das Breadboard erreichen können. Dies liest ',
        checkPinsDesc2: 'Gowin-Constraints gegen das echte Board-Teil, und die gleichen Constraints ',
        checkPinsDesc3: 'werden bei einem gehosteten Build gesendet.',
        optionalPasteNetlist: 'Optional: Fügen Sie eine Yosys JSON-Netzliste ein, um auch zu prüfen, ob die Ports existieren',
        importYosysToCanvas: '⤵ Import prep netlist to Canvas',
        topModule: ' — Top-Modul: ',
        schematicTitle: 'Schaltplan — Ihr Design als Gatter',
        schematicDesc1: 'Dies ist das obige Verilog, synthetisiert zu Logikgattern. Eingänge sitzen auf ',
        schematicDesc2: 'der linken Seite, Ausgänge auf der rechten; ein Kabel leuchtet mit dem Wert, den es trägt, ',
        schematicDesc3: 'während Sie die Uhr takten.',
        loadingSchematic: 'Lade die Schaltplan-Ansicht…',
        waveformsTitle: 'Wellenformen — die Ausgänge über die Zeit',
        waveformsDesc1: 'Das Design, ausgeführt vom Reset für einige Taktzyklen: jedes Ausgangs-Bit als ',
        waveformsDesc2: 'Rechteckwelle. Ein Zähler liest von unten nach oben — das niedrigste Bit wechselt jeden ',
        waveformsDesc3: 'Zyklus, das höchste am langsamsten.',
        loadingWaveform: 'Lade die Wellenform-Ansicht…',
        reachesBoard: 'Erreicht das Board (',
        pinArrow: ' → Pin ',
        terminalArrow: ' → Terminal ',
        sharesHardware: ' (teilt Onboard-Hardware)',
        nothingPlacedYet: 'Noch nichts platziert.',
        usableWithCaveat: 'Nutzbar, mit einem Vorbehalt (',
        cannotReachBoard: 'Kann das Board nicht erreichen (',
        clockTitle: 'Uhr',
        clockDesc1: 'Dieses Design wird getaktet auf ',
        clockDesc2: '. Takten Sie es, um das Design einen Zyklus nach dem anderen voranzutreiben und sehen Sie zu, wie die Ausgänge — und das Board — folgen.',
        stepClockBtn: 'Uhr takten ▸',
        resetBtn: 'Zurücksetzen',
        stopAutoRun: '⏸ Auto-Run stoppen',
        autoRun: '▶ Auto-Run',
        cycle: ' Zyklus',
        cycles: ' Zyklen',
        showLeds: '⎈ Zeige die LEDs in der Controller-Ansicht',
        showSeg7: '⧉ Als 7-Segment-Zahl zeigen',
        mirrorsPins: 'spiegelt Pins ',
        asIndicators: ' als Indikatoren und startet die Uhr',
        designInputsTitle: 'Design-Eingänge',
        nothingDrivesThese: 'Nichts treibt diese bisher an, also stellen Sie sie hier ein und sehen Sie zu, wie die Ausgänge folgen.',
        whatCircuitEngine: 'Was der Schaltungs-Engine mitgeteilt werden würde',
        high: ' HIGH',
        low: ' LOW',
        highZ: ' (High-Z: das Design liest es)',
        undriven: ' — ungetrieben: nichts modelliert bisher das Design, also gibt es keinen Wert, den man darauf legen könnte.',
        nothingToDrive: 'Nichts anzutreiben.',
        constraintsTitle: 'Constraints für die Gowin-Toolchain',
        constraintsDesc1: 'Kanonisches .cst, das nur die Ports abdeckt, die einen Header-Pin erreichen. ',
        constraintsDesc2: 'Das ist es, was für echtes Silizium abgeht.',
        plannedNext: 'Als nächstes geplant: Flashen eines produzierten Bitstreams aus der nativen App.'
    }
};
const pickLocale = loc => (loc && L10N[String(loc).slice(0, 2)] ? String(loc).slice(0, 2) : 'en');


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
// The React Flow canvas (MIT): drag/zoom node editor, its own chunk. The old
// hand-rolled SVG builder (fpga-gate-builder.jsx) was retired from the tab — this
// canvas superseded it; two stacked builders were redundant and confusing.
const FpgaGateBuilderRf = React.lazy(() =>
    import(/* webpackChunkName: "bw-fpga-rf" */ './fpga-gate-builder-rf.jsx'));

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

const FpgaTab = (props) => {
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
    const [cmosGate, setCmosGate] = React.useState('nand'); // which gate to realise as transistors
    const [icGate, setIcGate] = React.useState('and'); // which gate to realise as a 74HC chip
    const [icCircuit, setIcCircuit] = React.useState('half_adder'); // which multi-chip circuit to build
    // The first-run guide tracks the three steps through the tab's real state and
    // stays until the user hides it (or opts out for good in this browser).
    const [guideDismissed, setGuideDismissed] = React.useState(() => {
        try { return localStorage.getItem('bw-fpga-guide-done') === '1'; } catch { return false; }
    });
    const [sim, setSim] = React.useState({values: {}, note: null, problems: []});
    const [hdl, setHdl] = React.useState('');
    const [seed, setSeed] = React.useState(null);
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
    // The header pins the design READS (inputs), excluding the clock (the FPGA
    // ticks its own clock, not a breadboard switch). The demo board puts a switch
    // on each so the loop runs both ways.
    const inputPins = React.useMemo(() => {
        const pins = (bindings || [])
            .filter(b => b.direction === 'input' && b.base !== clockPort && b.port !== clockPort && typeof b.pin === 'number')
            .map(b => b.pin);
        return [...new Set(pins)].sort((a, b) => a - b);
    }, [bindings, clockPort]);
    const inputPinsRef = React.useRef([]);
    inputPinsRef.current = netlistText.trim() ? inputPins : [];
    // Once a board with input switches is wired, poll them into the design (below).
    const [boardDriven, setBoardDriven] = React.useState(false);
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

    // The READ half of the loop: once a demo board with input switches is wired,
    // poll the board's input pins and feed them into the design's inputs, so a
    // press on the breadboard drives the FPGA logic (which then drives the LEDs
    // through the effect above). Gated on boardDriven so it never clobbers the
    // manual input controls before a bidirectional board exists.
    React.useEffect(() => {
        if (!boardDriven || !bindings.length || typeof window === 'undefined') return undefined;
        const getBoard = () => {
            const c = window.__circuit || window.__bwCircuit;
            if (c && c.board && typeof c.board.readPin === 'function') return c.board;
            if (window.__board && typeof window.__board.readPin === 'function') return window.__board;
            return null;
        };
        const poll = () => {
            const board = getBoard();
            if (!board) return;
            const boardInputs = readBoardInputs(bindings, board);
            if (!Object.keys(boardInputs).length) return;
            setInputs(prev => {
                let changed = false;
                const next = {...prev};
                for (const [k, v] of Object.entries(boardInputs)) if (next[k] !== v) { next[k] = v; changed = true; }
                return changed ? next : prev;
            });
        };
        const id = setInterval(poll, 400);
        return () => clearInterval(id);
    }, [boardDriven, bindings]);

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
            const inPins = inputPinsRef.current;
            const result = buildDemoBoard(c, {
                ...(pins.length ? {pins} : {}),
                ...(inPins.length ? {inputPins: inPins} : {})
            });
            // With input switches on the board, poll them into the design so a
            // press drives the FPGA logic (the loop, both ways).
            if (inPins.length) setBoardDriven(true);
            // Make the designer RENDER what we built. Mutating the live circuit
            // model alone does NOT re-render it — the designer reacts only to its
            // own edits or a fresh circuitData prop — so hand it the built
            // circuit's JSON and load it the way a saved circuit loads.
            if (typeof c.toJSON === 'function' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bw-load-circuit-data', {detail: {data: c.toJSON()}}));
            }
            const litPins = result.leds.map(l => l.pin);
            const nSw = (result.switches || []).length;
            setDemoMsg({ok: true, text: `Wired a Tang Nano 20K with ${litPins.length} `
                + `LED${litPins.length === 1 ? '' : 's'} on pin${litPins.length === 1 ? '' : 's'} `
                + `${litPins.join(', ')}`
                + (nSw ? `, and ${nSw} input switch${nSw === 1 ? '' : 'es'} on pin${nSw === 1 ? '' : 's'} `
                    + `${inPins.join(', ')}. Toggle a switch on the board and the design responds — the loop runs both ways. `
                    : '. ')
                + (pins.length
                    ? 'Synthesise and Step the clock — they follow the design on the board.'
                    : 'Load “Counting sequence”, Synthesise, then Step the clock — '
                        + 'they count up in binary on the board.')});
        } catch (e) {
            setDemoMsg({ok: false, text: `Could not wire the demo board: ${e.message}`});
        }
    }, []);
    // Realise a single gate as its CMOS transistor circuit — the same "show it in
    // Circuits" path, but building nmos/pmos instead of a driven-LED demo board.
    const buildGateOnCircuit = React.useCallback((c, gateType) => {
        try {
            const r = buildCmosGate(c, gateType);
            if (typeof c.toJSON === 'function' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bw-load-circuit-data', {detail: {data: c.toJSON()}}));
            }
            const nT = r.transistors.length;
            setDemoMsg({ok: true, text: `Built a CMOS ${gateType.toUpperCase()} from ${nT} transistor`
                + `${nT === 1 ? '' : 's'} (nmos/pmos) with a switch per input and an output LED. `
                + 'Run the circuit and toggle the input switches — the LED follows the gate. '
                + '(This is the silicon underneath the logic; an FPGA itself uses LUTs.)'});
        } catch (e) {
            setDemoMsg({ok: false, text: `Could not build the gate: ${e.message}`});
        }
    }, []);
    // Shared "reach the live circuit (showing the Circuit tab if needed), then run
    // fn(circuit)" — used by both the demo board and the transistor realisation.
    const onLiveCircuit = React.useCallback(fn => {
        const now = liveCircuit();
        if (now) { fn(now); return; }
        if (typeof window === 'undefined') return;
        setDemoMsg({pending: true, text: 'Setting up the circuit…'});
        window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: CIRCUIT_TAB_INDEX}}));
        const deadline = Date.now() + 8000;
        const tick = () => {
            const c = liveCircuit();
            if (c) { fn(c); return; }
            if (Date.now() > deadline) {
                setDemoMsg({ok: false, text: 'Open the 🔌 Circuit tab once so the circuit exists, then try again.'});
                return;
            }
            setTimeout(tick, 150);
        };
        setTimeout(tick, 150);
    }, []);
    const wireDemoBoard = React.useCallback(() => onLiveCircuit(buildOnCircuit), [onLiveCircuit, buildOnCircuit]);
    const realizeGate = React.useCallback(gateType => onLiveCircuit(c => buildGateOnCircuit(c, gateType)),
        [onLiveCircuit, buildGateOnCircuit]);
    // The middle rung: realise the gate as a real 74HC logic chip — the part you
    // solder, between the abstract gate and its transistors.
    const buildIcGateOnCircuit = React.useCallback((c, gateType) => {
        try {
            buildLogicIcGate(c, gateType);
            if (typeof c.toJSON === 'function' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bw-load-circuit-data', {detail: {data: c.toJSON()}}));
            }
            const spec = gateToLogicIc(gateType);
            setDemoMsg({ok: true, text: `Built a ${gateType.toUpperCase()} from a ${spec.label} `
                + `(${spec.desc}) with a switch per input and an output LED. `
                + 'Run the circuit and toggle the input switches — the LED follows the gate. '
                + '(This is the gate as a real chip; ⚛ shows the transistors inside one of its gates.)'});
        } catch (e) {
            setDemoMsg({ok: false, text: `Could not build the gate: ${e.message}`});
        }
    }, []);
    const realizeIcGate = React.useCallback(gateType => onLiveCircuit(c => buildIcGateOnCircuit(c, gateType)),
        [onLiveCircuit, buildIcGateOnCircuit]);
    // A MULTI-gate circuit: several chips sharing the input switches, an LED per
    // named output. The half adder is the first one — the step from "a gate
    // works" to "these gates together compute something".
    const buildIcCircuitOnCircuit = React.useCallback((c, key) => {
        try {
            const built = buildLogicIcCircuit(c, IC_CIRCUITS[key]);
            if (typeof c.toJSON === 'function' && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bw-load-circuit-data', {detail: {data: c.toJSON()}}));
            }
            const spec = IC_CIRCUITS[key];
            // Report the PACKAGES, which is what you buy — not one line per
            // gate. Twenty gates of a 4-bit adder are five parts.
            const byKind = {};
            for (const pk of built.packages) byKind[pk.label] = (byKind[pk.label] || 0) + 1;
            const bill = Object.entries(byKind).map(([label, n]) => `${n}× ${label}`).join(', ');
            // "a and b and c and d and e" is not a list. Commas, then "and".
            const names = built.outputs.map(o => o.name);
            const outs = names.length > 1
                ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
                : names[0];
            const nSw = built.inputs.length;
            const nGates = built.chips.length;
            setDemoMsg({ok: true, text: `Built a ${spec.label.toLowerCase()}: ${nGates} gates in `
                + `${built.packages.length} chip${built.packages.length === 1 ? '' : 's'} — ${bill} — `
                + `sharing ${nSw} input switch${nSw === 1 ? '' : 'es'}, with an LED for ${outs}. `
                + `Run the circuit and toggle them: ${spec.hint} `
                + 'The Circuit tab\'s ☷ Parts list has the whole shopping list, CSV included.'});
        } catch (e) {
            setDemoMsg({ok: false, text: `Could not build the circuit: ${e.message}`});
        }
    }, []);
    const realizeIcCircuit = React.useCallback(key => onLiveCircuit(c => buildIcCircuitOnCircuit(c, key)),
        [onLiveCircuit, buildIcCircuitOnCircuit]);

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
                        label: L10N[pickLocale(props.locale)].wireDemoBoard,
                        hint: L10N[pickLocale(props.locale)].wireDemoBoardHint},
                    {done: Boolean((synth && synth.ok) || netlistText.trim()),
                        label: L10N[pickLocale(props.locale)].loadDesign,
                        hint: L10N[pickLocale(props.locale)].loadDesignHint},
                    {done: clockCycles > 0,
                        label: L10N[pickLocale(props.locale)].stepClock,
                        hint: L10N[pickLocale(props.locale)].stepClockHint},
                    {done: mirrored,
                        label: L10N[pickLocale(props.locale)].seeInController,
                        hint: L10N[pickLocale(props.locale)].seeInControllerHint}
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
                            ? L10N[pickLocale(props.locale)].allDone
                            : L10N[pickLocale(props.locale)].newToFpga}</strong>
                        <ol style={{margin: '0.5rem 0 0.25rem', paddingLeft: '1.4rem'}}>
                            {steps.map((s, i) => (
                                <li key={i} style={{opacity: s.done ? 0.55 : 1, margin: '0.15rem 0'}}>
                                    {s.done ? '✓ ' : ''}{s.label}
                                    <span style={{opacity: 0.7}}>{` — ${s.hint}`}</span>
                                </li>
                            ))}
                        </ol>
                        {netlistText.trim() ? (
                            <p style={{margin: '0.35rem 0 0.15rem', fontSize: '0.85rem'}}>
                                <strong>{L10N[pickLocale(props.locale)].threeWaysToSee}</strong>
                                {L10N[pickLocale(props.locale)].designDrawnAs}<em>{L10N[pickLocale(props.locale)].gateSchematic}</em>
                                {L10N[pickLocale(props.locale)].andAs}<em>{L10N[pickLocale(props.locale)].waveforms}</em>{L10N[pickLocale(props.locale)].belowAndYouCan}
                                <em>{L10N[pickLocale(props.locale)].buildYourOwnLogic}</em>{L10N[pickLocale(props.locale)].byPlacingGates}
                                {L10N[pickLocale(props.locale)].noHdlTyped}
                            </p>
                        ) : (
                            <p style={{margin: '0.35rem 0 0.15rem', fontSize: '0.85rem', opacity: 0.85}}>
                                {L10N[pickLocale(props.locale)].preferNoTyping}<em>{L10N[pickLocale(props.locale)].buildItVisuallyQuote}</em>
                                {L10N[pickLocale(props.locale)].underVerilog}
                            </p>
                        )}
                        <button type="button" onClick={hide}
                            style={{marginTop: '0.35rem', padding: '0.15rem 0.6rem', cursor: 'pointer'}}
                        >{allDone ? L10N[pickLocale(props.locale)].done : L10N[pickLocale(props.locale)].hideThis}</button>
                    </div>
                );
            })()}
            <h2 style={{marginTop: 0}}>{L10N[pickLocale(props.locale)].fpgaTitle}</h2>
            <p style={{marginTop: 0}}>
                {L10N[pickLocale(props.locale)].fpgaDesc1}
                {L10N[pickLocale(props.locale)].fpgaDesc2}
                {L10N[pickLocale(props.locale)].fpgaDesc3}
                {L10N[pickLocale(props.locale)].fpgaDesc4}
            </p>

            {/* PRIMARY FLOW: the design, and building it. This used to be gated on
                `canonical` (a generated .cst), so nothing here appeared until the user
                typed pin constraints first — the tab looked like two empty textareas.
                The pin checker is now a collapsible panel at the bottom. */}
            <h3>{L10N[pickLocale(props.locale)].verilogTitle}</h3>
            <p style={{margin: '0 0 0.5rem', opacity: 0.85}}>
                {L10N[pickLocale(props.locale)].newHere}
                {EXAMPLES.map(ex => (
                    <button
                        key={ex.id}
                        type="button"
                        title={ex.blurb}
                        onClick={() => { setHdl(ex.verilog); setText(ex.cst); setSynth(null); setSeed(ex.model); }}
                        style={{marginLeft: '0.4rem', padding: '0.15rem 0.5rem', cursor: 'pointer'}}
                    >{ex.label}</button>
                ))}
            </p>
            <details style={{margin: '0 0 0.75rem'}} open>
                <summary style={{cursor: 'pointer'}}>
                    {L10N[pickLocale(props.locale)].orOnFullCanvas}
                </summary>
                <div style={{marginTop: '0.6rem'}}>
                    <React.Suspense fallback={<p style={{opacity: 0.7}}>{L10N[pickLocale(props.locale)].loadingCanvas}</p>}>
                        <FpgaGateBuilderRf seed={seed} locale={props.locale} onUseVerilog={(v, cst) => { setHdl(v); if (cst) setText(cst); setSynth(null); }} />
                    </React.Suspense>
                </div>
            </details>
            <p style={{margin: '0 0 0.75rem'}}>
                <button
                    type="button"
                    onClick={() => wireDemoBoard()}
                    style={{padding: '0.2rem 0.6rem', cursor: 'pointer'}}
                >{L10N[pickLocale(props.locale)].wireDemoBoardBtn}</button>
                {/* …or realise a single gate as its CMOS transistors in Circuits. */}
                <span style={{marginLeft: '0.75rem'}}>
                    <select value={cmosGate} onChange={e => setCmosGate(e.target.value)}
                        data-testid="bw-fpga-cmos-gate" style={{marginRight: '0.35rem'}}>
                        {['not', 'buffer', 'nand', 'nor', 'and', 'or'].map(g =>
                            <option key={g} value={g}>{g.toUpperCase()}</option>)}
                    </select>
                    <button type="button" data-testid="bw-fpga-build-transistors"
                        onClick={() => realizeGate(cmosGate)}
                        title="Build this gate from nmos/pmos transistors on the breadboard (the silicon underneath the logic)"
                        style={{padding: '0.2rem 0.6rem', cursor: 'pointer'}}
                    >{L10N[pickLocale(props.locale)].buildTransistorsBtn}</button>
                </span>
                {/* …or realise the gate as a real 74HC logic chip — the rung between the gate and its transistors. */}
                <span style={{marginLeft: '0.75rem'}}>
                    <select value={icGate} onChange={e => setIcGate(e.target.value)}
                        data-testid="bw-fpga-ic-gate" style={{marginRight: '0.35rem'}}>
                        {LOGIC_IC_GATES.map(g =>
                            <option key={g} value={g}>{g.toUpperCase()}</option>)}
                    </select>
                    <button type="button" data-testid="bw-fpga-build-ic"
                        onClick={() => realizeIcGate(icGate)}
                        title="Build this gate as a real 74HC logic chip on the breadboard (the part you solder, above the transistors)"
                        style={{padding: '0.2rem 0.6rem', cursor: 'pointer'}}
                    >{L10N[pickLocale(props.locale)].buildIcBtn}</button>
                </span>
                {/* …or a whole multi-chip CIRCUIT: several chips sharing the input
                    switches, an LED per named output. Listed from the shared
                    registry so a new spec appears here without touching this file. */}
                <span style={{marginLeft: '0.75rem'}}>
                    <select value={icCircuit} onChange={e => setIcCircuit(e.target.value)}
                        data-testid="bw-fpga-ic-circuit" style={{marginRight: '0.35rem'}}>
                        {Object.entries(IC_CIRCUITS).map(([k, spec]) =>
                            <option key={k} value={k}>{spec.label}</option>)}
                    </select>
                    <button type="button" data-testid="bw-fpga-build-circuit"
                        onClick={() => realizeIcCircuit(icCircuit)}
                        title="Build this circuit from 74HC chips — several chips sharing the input switches, with an LED per output"
                        style={{padding: '0.2rem 0.6rem', cursor: 'pointer'}}
                    >{L10N[pickLocale(props.locale)].buildCircuitBtn}</button>
                </span>
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
            <div style={{textAlign: 'right', marginTop: '-1.5rem', marginRight: '0.5rem', pointerEvents: 'none'}}>
                <button
                    type="button"
                    style={{pointerEvents: 'auto', fontSize: '0.75rem', padding: '0.1rem 0.4rem', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.85)', border: '1px solid #ccc', borderRadius: '4px'}}
                    onClick={() => {
                        const {model} = verilogToModel(hdl);
                        if (model) setSeed(model);
                    }}
                >
                    {L10N[pickLocale(props.locale)].parseToCanvas}
                </button>
            </div>
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
                            {L10N[pickLocale(props.locale)].permissiveLicence}
                        </Row>
                    )}
                </ul>
            ) : null}

            <h3>{L10N[pickLocale(props.locale)].whereBuiltTitle}</h3>
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
                        {L10N[pickLocale(props.locale)].backendLabel}
                        <select value={backend} onChange={ev => setBackend(ev.target.value)}>
                            <option value="auto">{L10N[pickLocale(props.locale)].autoOption}</option>
                            {offerable(catalog, probe.available).map(en => (
                                <option key={en.id} value={en.id}>{en.label}</option>
                            ))}
                        </select>
                    </label>
                </p>
            ) : null}
            <p style={{opacity: 0.85}}>
                {selection.accepted
                    ? <>{L10N[pickLocale(props.locale)].buildsOn}<strong>{selection.selected.label}</strong>{` — ${selection.reason}`}</>
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
                >{L10N[pickLocale(props.locale)].synthesiseBtn}</button>
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
                                <a href={artefacts.bitstream.url} download="design.fs">{L10N[pickLocale(props.locale)].downloadFs}</a>
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
                                    >{L10N[pickLocale(props.locale)].flashToBoard}</button>
                                ) : null}
                                {flashMsg ? <span style={{marginLeft: '0.5rem', opacity: 0.85}}>{flashMsg}</span> : null}
                                <div style={{opacity: 0.7, fontSize: '0.85em', marginTop: '0.25rem'}}>
                                    {flash.available ? (
                                        L10N[pickLocale(props.locale)].flashingRuns
                                    ) : (
                                        <>
                                            {L10N[pickLocale(props.locale)].browserCannotFlash1}
                                            <code>{'bw-fpga flash ./design.fs'}</code>{L10N[pickLocale(props.locale)].browserCannotFlash2}
                                            <code>{'openFPGALoader -b tangnano20k design.fs'}</code>{L10N[pickLocale(props.locale)].browserCannotFlash3}
                                            {webUsbSupported() ? (
                                                <div style={{marginTop: '0.15rem'}}>
                                                    {L10N[pickLocale(props.locale)].browserHasWebUsb
                                                        }
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            </>
                        ) : artefacts.netlist ? (
                            <>
                                {`✓ Synthesised a netlist (${artefacts.netlist.modules} modules). `}
                                <a href={artefacts.netlist.url} download="design.json">{L10N[pickLocale(props.locale)].downloadNetlist}</a>
                            </>
                        ) : L10N[pickLocale(props.locale)].doneFeedback}
                    </span>
                ) : null}
            </p>

            <h3>{L10N[pickLocale(props.locale)].synthesiseHereTitle}</h3>
            <p style={{opacity: 0.85}}>
                {L10N[pickLocale(props.locale)].yosysRunsHere1}
                {L10N[pickLocale(props.locale)].yosysRunsHere2}
                {L10N[pickLocale(props.locale)].yosysRunsHere3}
            </p>
            <p>
                <strong>{local ? local.code || local.state : L10N[pickLocale(props.locale)].starting}</strong>
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
                >{localBusy ? L10N[pickLocale(props.locale)].downloading : L10N[pickLocale(props.locale)].downloadToolchain}</button>
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
                >{L10N[pickLocale(props.locale)].synthesiseHereBtn}</button>
            </p>

            {/* SECONDARY: pin-reachability checker, collapsed by default. It reads the
                Gowin constraints below against the real board part; those same
                constraints are sent with a hosted build. */}
            <details style={{marginTop: '1.5rem'}}>
                <summary style={{cursor: 'pointer', fontWeight: 'bold'}}>
                    {`${L10N[pickLocale(props.locale)].checkPinsTitle}${bindings.length}${L10N[pickLocale(props.locale)].placed}`}
                    {refusals.length ? `, ${refusals.length}${L10N[pickLocale(props.locale)].cannot}` : ''}
                    {')'}
                </summary>
                <p style={{opacity: 0.85}}>
                    {L10N[pickLocale(props.locale)].checkPinsDesc1}
                    {L10N[pickLocale(props.locale)].checkPinsDesc2}
                    {L10N[pickLocale(props.locale)].checkPinsDesc3}
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
                        {L10N[pickLocale(props.locale)].optionalPasteNetlist}
                        {top ? <strong>{`${L10N[pickLocale(props.locale)].topModule}${top}`}</strong> : null}
                    </summary>
                    <textarea
                        value={netlistText}
                        onChange={e => setNetlistText(e.target.value)}
                        spellCheck={false}
                        placeholder={'yosys -p \'synth_gowin -json out.json\' design.v'}
                        style={{width: '100%', minHeight: '7rem', fontFamily: 'monospace',
                            fontSize: '0.8rem', padding: '0.6rem', marginTop: '0.4rem'}}
                    />
                    <div style={{textAlign: 'right', marginTop: '0.2rem'}}>
                        <button
                            type="button"
                            style={{fontSize: '0.75rem', padding: '0.1rem 0.4rem', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.85)', border: '1px solid #ccc', borderRadius: '4px'}}
                            onClick={() => {
                                try {
                                    const {model} = yosysToModel(netlistText);
                                    if (model) setSeed(model);
                                } catch (e) {
                                    console.error('Failed to parse yosys JSON', e);
                                }
                            }}
                        >
                            {L10N[pickLocale(props.locale)].importYosysToCanvas}
                        </button>
                    </div>
                </details>

                {netlistText.trim() ? (
                    <>
                        <h3>{L10N[pickLocale(props.locale)].schematicTitle}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {L10N[pickLocale(props.locale)].schematicDesc1}
                            {L10N[pickLocale(props.locale)].schematicDesc2}
                            {L10N[pickLocale(props.locale)].schematicDesc3}
                        </p>
                        <React.Suspense fallback={<p style={{opacity: 0.7}}>{L10N[pickLocale(props.locale)].loadingSchematic}</p>}>
                            <FpgaSchematic netlistText={netlistText} netValues={netValues} inputs={inputs} clockCycles={clockCycles} />
                        </React.Suspense>
                    </>
                ) : null}

                {netlistText.trim() ? (
                    <>
                        <h3>{L10N[pickLocale(props.locale)].waveformsTitle}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {L10N[pickLocale(props.locale)].waveformsDesc1}
                            {L10N[pickLocale(props.locale)].waveformsDesc2}
                            {L10N[pickLocale(props.locale)].waveformsDesc3}
                        </p>
                        <React.Suspense fallback={<p style={{opacity: 0.7}}>{L10N[pickLocale(props.locale)].loadingWaveform}</p>}>
                            <FpgaWaveform netlistText={netlistText} inputs={inputs} />
                        </React.Suspense>
                    </>
                ) : null}

                <h3>{`${L10N[pickLocale(props.locale)].reachesBoard}${bindings.length})`}</h3>
                <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                    {bindings.map(b => (
                        <Row key={`${b.port}-${b.pin}`} tone="#3a8a3a">
                            <code>{b.port}</code>{L10N[pickLocale(props.locale)].pinArrow}<code>{b.pin}</code>
                            {L10N[pickLocale(props.locale)].terminalArrow}<code>{b.terminal}</code>
                            {b.sharedWith ? <em style={{opacity: 0.8}}>{L10N[pickLocale(props.locale)].sharesHardware}</em> : null}
                        </Row>
                    ))}
                    {bindings.length ? null : <li style={{opacity: 0.7}}>{L10N[pickLocale(props.locale)].nothingPlacedYet}</li>}
                </ul>

                {warnings.length ? (
                    <>
                        <h3>{`${L10N[pickLocale(props.locale)].usableWithCaveat}${warnings.length})`}</h3>
                        <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                            {warnings.map((w, i) => (
                                <Row key={i} tone="#b8860b"><strong>{w.port}</strong>{`: ${w.reason}`}</Row>
                            ))}
                        </ul>
                    </>
                ) : null}

                {refusals.length ? (
                    <>
                        <h3>{`${L10N[pickLocale(props.locale)].cannotReachBoard}${refusals.length})`}</h3>
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
                        <h3>{L10N[pickLocale(props.locale)].clockTitle}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {L10N[pickLocale(props.locale)].clockDesc1}<code>{clockPort}</code>
                            {L10N[pickLocale(props.locale)].clockDesc2
                                }
                        </p>
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap'}}>
                            <button
                                type="button"
                                onClick={() => setClockCycles(c => c + 1)}
                                style={{padding: '0.35rem 0.8rem', cursor: 'pointer'}}
                            >{L10N[pickLocale(props.locale)].stepClockBtn}</button>
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
                            >{L10N[pickLocale(props.locale)].resetBtn}</button>
                            <button
                                type="button"
                                onClick={() => setAutoRun(v => !v)}
                                style={{padding: '0.35rem 0.8rem', cursor: 'pointer',
                                    fontWeight: autoRun ? 'bold' : 'normal'}}
                            >{autoRun ? L10N[pickLocale(props.locale)].stopAutoRun : L10N[pickLocale(props.locale)].autoRun}</button>
                            <span style={{opacity: 0.8}}>
                                {clockCycles}{clockCycles === 1 ? L10N[pickLocale(props.locale)].cycle : L10N[pickLocale(props.locale)].cycles}
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
                                >{L10N[pickLocale(props.locale)].showLeds}</button>
                                <button
                                    type="button"
                                    data-testid="bw-fpga-show-seg7"
                                    onClick={() => {
                                        // Mirror the SAME outputs, folded into one number on a
                                        // seven-segment widget (a counter then reads 0,1,2,3…).
                                        window.dispatchEvent(new CustomEvent('bw-fpga-leds',
                                            {detail: {pins: outputPins}}));
                                        window.dispatchEvent(new CustomEvent('bw-fpga-seg7',
                                            {detail: {pins: outputPins}}));
                                        setAutoRun(true);
                                        setMirrored(true);
                                    }}
                                    style={{marginLeft: '0.4rem', padding: '0.35rem 0.8rem', cursor: 'pointer'}}
                                >{L10N[pickLocale(props.locale)].showSeg7}</button>
                                <span style={{marginLeft: '0.5rem', opacity: 0.75}}>
                                    {`${L10N[pickLocale(props.locale)].mirrorsPins}${outputPins.join(', ')}${L10N[pickLocale(props.locale)].asIndicators}`}
                                </span>
                            </p>
                        ) : null}
                    </>
                ) : null}

                {inputPorts.length ? (
                    <>
                        <h3>{L10N[pickLocale(props.locale)].designInputsTitle}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {L10N[pickLocale(props.locale)].nothingDrivesThese}
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
                    {L10N[pickLocale(props.locale)].whatCircuitEngine}
                    {simNote ? <span style={{opacity: 0.7, fontWeight: 'normal'}}>{` — ${simNote}`}</span> : null}
                </h3>
                <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                    {plan.ops.map(([terminal, mode, driveHigh], i) => (
                        <Row key={i} tone="#4a6fa5">
                            <code>{terminal}</code>{` → ${mode}`}
                            {mode === 'pushpull' ? <strong>{driveHigh ? L10N[pickLocale(props.locale)].high : L10N[pickLocale(props.locale)].low}</strong> : null}
                            {mode === 'input' ? <em style={{opacity: 0.8}}>{L10N[pickLocale(props.locale)].highZ}</em> : null}
                        </Row>
                    ))}
                    {plan.unset.map((u, i) => (
                        <Row key={`u${i}`} tone="#7a7a7a">
                            <code>{u.terminal}</code>
                            {L10N[pickLocale(props.locale)].undriven}
                        </Row>
                    ))}
                    {plan.ops.length || plan.unset.length ? null : <li style={{opacity: 0.7}}>{L10N[pickLocale(props.locale)].nothingToDrive}</li>}
                </ul>

                {canonical ? (
                    <>
                        <h3>{L10N[pickLocale(props.locale)].constraintsTitle}</h3>
                        <p style={{marginTop: 0, opacity: 0.8}}>
                            {L10N[pickLocale(props.locale)].constraintsDesc1}
                            {L10N[pickLocale(props.locale)].constraintsDesc2}
                        </p>
                        <pre style={{background: 'rgba(127,127,127,0.1)', padding: '0.7rem',
                            borderRadius: 4, overflowX: 'auto', fontSize: '0.82rem'}}>{canonical}</pre>
                    </>
                ) : null}
            </details>

            <p style={{opacity: 0.7, marginTop: '1.5rem'}}>
                {L10N[pickLocale(props.locale)].plannedNext}
            </p>
        </div>
        </div>
    );
};

export default connect(state => ({locale: state.locales && state.locales.locale}))(FpgaTab);
