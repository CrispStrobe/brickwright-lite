import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

// Inject the retro-bench bus extractors into the DRC so contention and
// open-vector errors surface as warnings. This lives here (not in the
// vendored drc.js) so the vendored file stays identical to upstream.
import {setExtractors} from '../../lib/bw-circuit-ui/model/drc.js';
import {extract6502Machine} from '../../lib/bw-board/m6502-extract.js';
import {extractZ80Machine} from '../../lib/bw-board/z80-extract.js';
setExtractors({extract6502Machine, extractZ80Machine});

const DebugPanel = React.lazy(() =>
    import(/* webpackChunkName: "bw-debug-panel" */ './debug-panel.jsx')
);

/**
 * The circuit designer, as a first-class editor tab beside Code / Costumes / Sounds.
 *
 * It began life as a toggle inside the Code tab and that was the wrong home: a board
 * you wire by dragging parts needs the whole editor pane, not a strip under a textarea.
 *
 * Two things this has to get right:
 *
 * 1. `forceRenderTabPanel` is set on the GUI's <Tabs>, so this component is mounted from
 *    the moment the editor opens, whether or not anyone ever looks at the tab. The engine
 *    and the panel are therefore loaded on first *visibility*, not on mount — otherwise
 *    every user pays for a designer most of them never open.
 * 2. The board is inferred from the project's PIN declarations (boundary C), so it is
 *    re-read each time the tab is opened; the user may well have edited the declarations
 *    in the Code tab in between.
 */
// Locale strings for the debugger-solo empty state. The app's i18n is
// MODULAR (locale from the redux store, per-key dicts, en fallback) so a
// language is added by adding a key — never by sniffing
// navigator.language inline, which can neither be extended nor tested.
const SOLO_L10N = {
    en: {noCode: 'The debugger needs a program and a chip to drive. Declare pins in the Code tab, e.g. PIN led1 IS P1.0 OUTPUT ACTIVE LOW — or switch back to the circuit view in the header above.'},
    de: {noCode: 'Der Debugger braucht ein Programm und einen Chip. Deklariere Pins im Code-Tab, z. B. PIN led1 IS P1.0 OUTPUT ACTIVE LOW — oder wechsle oben zurück zur Schaltungsansicht.'}
};

class CircuitTab extends React.Component {
    constructor (props) {
        super(props);
        let hintDismissed = false;
        try {
            hintDismissed = localStorage.getItem('bw-circuit-hint') === '1';
        } catch { /* private mode */ }
        let debugHintDismissed = false;
        try {
            debugHintDismissed = localStorage.getItem('bw-debug-hint') === '1';
        } catch { /* private mode */ }
        let hideStage = false;
        let debugDock = 'top';
        let showInStage = true; // owner default: while coding, the circuit replaces the stage
        let rightPaneHidden = false;
        try {
            showInStage = localStorage.getItem('bw-stage-circuit') !== '0';
            rightPaneHidden = localStorage.getItem('bw-right-pane-hidden') === '1';
        } catch { /* private mode */ }
        this._stageHost = null;
        try {
            hideStage = localStorage.getItem('bw-hide-stage') === '1';
            const d = localStorage.getItem('bw-debug-dock');
            if (d === 'right' || d === 'off' || d === 'solo') debugDock = d;
        } catch { /* private mode: defaults */ }
        this.state = {Designer: null, ui: null, error: null, reloading: false, stc: null,
            board: null, debugState: null, panel: 'designer', circuit: null, hintDismissed,
            debugHintDismissed, hideStage, debugDock, showInStage, rightPaneHidden,
            examples: null, examplesError: null, circuitData: null, loadingExample: null};
        this.handleRunnerChange = this.handleRunnerChange.bind(this);
        this.handleCircuitReady = this.handleCircuitReady.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this.handleDeclarationChange = this.handleDeclarationChange.bind(this);
        this.handleProjectStart = this.handleProjectStart.bind(this);
        this.handleProjectStop = this.handleProjectStop.bind(this);
        this.handleProjectChanged = this.handleProjectChanged.bind(this);
    }

    componentDidMount () {
        if (this.props.isVisible) {
            this.load();
            this.loadExamples();
        }
        // The stage-hiding CSS lives here rather than in a stylesheet because
        // the wrapper's class is a hashed CSS-module name; the attribute-
        // contains selector survives rebuilds.
        if (!document.getElementById('bw-layout-style')) {
            const st = document.createElement('style');
            st.id = 'bw-layout-style';
            st.textContent = 'html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="stage-canvas-wrapper"],html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="target-wrapper"]{display:none !important} html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="stage-wrapper"]{position:relative;z-index:3;background:transparent !important}';
            document.head.appendChild(st);
        }
        this._syncStageAttr();
        this._ensureStageHost();
        this._settingsHandler = event => {
            const {key, value} = event.detail || {};
            if (key === 'about') return;
            if (key === 'debugDock' || key === 'bw-debug-dock') {
                this.setDock(value);
                // Stage-header view changes can arrive while this tab is still
                // mounted but not selected. Request the designer here too;
                // otherwise the portal host is visible before its content has
                // ever been loaded and the user sees a blank debugger pane.
                if ((value === 'top' || value === 'solo') && this.state.showInStage) this.load();
            }
            if (key === 'stageCircuit' || key === 'bw-stage-circuit') {
                this.setDisplayPreference('showInStage', value === '1');
                if (value === '1') this.load();
            }
            if (key === 'hideStage' || key === 'bw-hide-stage') {
                // The Code-mode circuit is rendered into the normal stage column.
                // Hide only Scratch-stage children; the portal is explicitly
                // exempted by data-bw-circuit-stage-host and remains visible.
                try { localStorage.setItem('bw-hide-stage', value === '1' ? '1' : '0'); } catch { /* private mode */ }
                this.setDisplayPreference('hideStage', value === '1');
            }
            if (key === 'bw-right-pane-hidden') {
                try { localStorage.setItem('bw-right-pane-hidden', value === '1' ? '1' : '0'); } catch { /* private mode */ }
                this.setState({rightPaneHidden: value === '1'});
            }
            if (key === 'bw-circuit-theme') {
                try { localStorage.setItem('bw-circuit-theme', value); } catch { /* private mode */ }
                // CircuitDesigner owns the visual theme; forward the same
                // setting event so an already-mounted designer updates now.
            }
        };
        window.addEventListener('bw-settings-change', this._settingsHandler);
        // The Scratch controls dispatch these user-level events even when the
        // VM has no executable MCU program. Keep the designer simulation in
        // lockstep with Green Flag/Red Flag in that case too.
        this._greenFlagHandler = this.handleProjectStart;
        this._stopAllHandler = this.handleProjectStop;
        window.addEventListener('bw-green-flag', this._greenFlagHandler);
        window.addEventListener('bw-stop-all', this._stopAllHandler);
        // Power off in the designer = MCU loses power = runner stops.
        this._powerOffHandler = this.handleProjectStop;
        window.addEventListener('bw-power-off', this._powerOffHandler);
        const runtime = this.props.vm && this.props.vm.runtime;
        if (runtime && runtime.on) {
            runtime.on('PROJECT_START', this.handleProjectStart);
            runtime.on('PROJECT_STOP_ALL', this.handleProjectStop);
            // "To blocks" in the Code tab lands fresh pin declarations on
            // runtime.stc and announces them with PROJECT_CHANGED — but until
            // this subscription existed, nothing here re-read them: the
            // portalled debugger (any dock, and 'solo' most visibly, since it
            // is nothing BUT the debugger) kept the previous project's pins
            // until some view toggle happened to call load().
            runtime.on('PROJECT_CHANGED', this.handleProjectChanged);
        }
    }

    componentDidUpdate (prevProps) {
        if (this.props.isVisible && !prevProps.isVisible) {
            this.load();
            this.loadExamples();
        }
        this._syncStageAttr();
        this._ensureStageHost();
        // The host is created outside React's tree. When the Code tab becomes
        // active, render once more after that host exists so the circuit is
        // actually portalled into the right pane instead of leaving a blank
        // stage after returning from the dedicated Circuit tab.
        const portalNow = this._stagePortalOn();
        if (portalNow !== !!this._portalOn && !this._portalRefreshQueued) {
            this._portalRefreshQueued = true;
            this.setState({});
            Promise.resolve().then(() => { this._portalRefreshQueued = false; });
        }
        if (this._stageHost) {
            this._stageHost.style.display = portalNow ? 'block' : 'none';
        }
    }

    componentWillUnmount () {
        window.removeEventListener('bw-settings-change', this._settingsHandler);
        window.removeEventListener('bw-green-flag', this._greenFlagHandler);
        window.removeEventListener('bw-stop-all', this._stopAllHandler);
        window.removeEventListener('bw-power-off', this._powerOffHandler);
        const runtime = this.props.vm && this.props.vm.runtime;
        if (runtime && runtime.removeListener) {
            runtime.removeListener('PROJECT_START', this.handleProjectStart);
            runtime.removeListener('PROJECT_STOP_ALL', this.handleProjectStop);
            runtime.removeListener('PROJECT_CHANGED', this.handleProjectChanged);
        }
        document.documentElement.removeAttribute('data-bw-hide-stage');
        const oldWrap = document.querySelector('div[class*="stage-and-target-wrapper"]');
        if (oldWrap) oldWrap.style.display = '';
        if (this._stageHost && this._stageHost.parentNode) {
            this._stageHost.parentNode.removeChild(this._stageHost);
        }
    }

    setDock (d) {
        if (d !== 'top' && d !== 'right' && d !== 'off' && d !== 'solo') return;
        this.setState({debugDock: d});
        try { localStorage.setItem('bw-debug-dock', d); } catch { /* private mode */ }
    }

    setDisplayPreference (key, value) {
        this.setState({[key]: value});
        const storageKey = key === 'showInStage' ? 'bw-stage-circuit' : 'bw-hide-stage';
        try { localStorage.setItem(storageKey, value ? '1' : '0'); } catch { /* private mode */ }
    }

    handleProjectStart () {
        this.setState(state => ({runToken: (state.runToken || 0) + 1}));
    }

    handleProjectStop () {
        this.setState(state => ({stopToken: (state.stopToken || 0) + 1}));
    }

    /** Re-read runtime.stc when the project changes (e.g. "To blocks" landed
     *  new pin declarations). Reference-compare first: PROJECT_CHANGED also
     *  fires for block edits that leave stc untouched. */
    handleProjectChanged () {
        const next = this.readStc();
        if (next !== this.state.stc) this.setState({stc: next});
    }

    /** The overlay div inside the stage column that hosts the portal. Created
     *  lazily OUTSIDE render (DOM mutation is a lifecycle affair); render only
     *  uses it if it already exists — the first eligible update supplies it. */
    _ensureStageHost () {
        if (this._stageHost && document.contains(this._stageHost)) return this._stageHost;
        const wrap = document.querySelector('div[class*="stage-and-target-wrapper"]');
        if (!wrap) return null;
        if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        const host = document.createElement('div');
        // Keep the stage header controls above the portal: the portal owns the
        // stage surface, but must never intercept the three view buttons.
        host.dataset.bwCircuitStageHost = 'true';
        host.style.cssText = 'position:absolute;inset:0;z-index:0;background:#fff;display:none;overflow:auto;';
        wrap.appendChild(host);
        this._stageHost = host;
        return host;
    }

    /** While coding (any other tab), the circuit takes the stage's column —
     *  the owner's default: you watch the LED you are programming, not an
     *  empty Scratch stage. Only when there is circuit content to show. */
    _stagePortalOn () {
        if (this.props.isVisible || !this.state.showInStage) return false;
        // This is a presentation choice, not a capability check. Debugger
        // mode must still show the designer for an empty project so the user
        // can build the circuit before adding MCU code.
        return !!this._stageHost && document.contains(this._stageHost);
    }

    /** Hide the stage+sprites column only while THIS tab is the visible one —
     *  the option reads "give the circuit the whole width", not "lose the
     *  stage everywhere". Other tabs get it back the moment they show. */
    _syncStageAttr () {
        const on = !!this.state.hideStage;
        if (on) document.documentElement.setAttribute('data-bw-hide-stage', '');
        else document.documentElement.removeAttribute('data-bw-hide-stage');
        const wrap = document.querySelector('div[class*="stage-and-target-wrapper"]');
        if (wrap) wrap.style.display = this.state.rightPaneHidden ? 'none' : '';
        const stage = wrap && wrap.querySelector('div[class*="stage-wrapper"]');
        const canvas = wrap && wrap.querySelector('div[class*="stage-canvas-wrapper"]');
        const target = wrap && wrap.querySelector('div[class*="target-wrapper"]');
        if (canvas) canvas.style.display = on ? 'none' : '';
        if (target) target.style.display = on ? 'none' : '';
        if (stage) {
            stage.style.position = 'relative';
            stage.style.zIndex = on ? '3' : '';
            stage.style.background = on ? 'transparent' : '';
            stage.style.flex = on ? '1 1 100%' : '';
            stage.style.width = on ? '100%' : '';
            // Keep the wrapper hit-testable: the stage canvas/target are
            // hidden individually below, while the header must still receive
            // the Scratch/circuit/debugger mode clicks.
            stage.style.pointerEvents = '';
            const header = stage.querySelector('div[class*="stage-menu-wrapper"]');
            if (header) {
                header.style.pointerEvents = on ? 'auto' : '';
                // The circuit portal fills the stage wrapper. Keep the three
                // mode buttons above that surface so switching between
                // Scratch, circuit-only, and debugger never loses the only
                // route back.
                header.style.position = 'relative';
                header.style.zIndex = '10';
            }
        }
    }

    async load () {
        this.setState({stc: this.readStc()});
        if (this.state.Designer || this.loading) return;
        this.loading = true;
        try {
            const engine = await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/index.js');
            // The device registry has no self-registration: seventeen register*
            // exports and, until 2026-08-10, zero callers outside the engine's
            // own tests — servo/555/h-bridge netlists failed as "unknown kind"
            // with their drivers sitting right there. Register at injection.
            if (typeof engine.registerAllDevices === 'function') engine.registerAllDevices();
            const ui = await import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/index.js');
            const setEngine = ui.setEngine || (ui.default && ui.default.setEngine);
            if (typeof setEngine !== 'function') throw new Error('bw-circuit-ui setEngine export is unavailable');
            setEngine({BoardImpl: engine.BoardImpl, inferNetlist: engine.inferNetlist, checkWiring: engine.checkWiring});
            // Part sidecars (pin maps, current ratings, footprints) into the
            // parts registry. require.context because this bundle is webpack,
            // not vite. 115 files, ~464 KiB, in this same chunk.
            //
            // NOT fatal, and not awaited into the same try as the designer.
            // The registry is an enhancement: `artCoverage()` already reports
            // which kinds fall back to the hand-drawn switch, so a designer
            // with no sidecars is degraded and usable. Loading it inside the
            // designer's try meant one bad JSON file took down the whole tab —
            // and worse, looked like a stale build, because that catch offers
            // the failure to the chunk-recovery path and would have reloaded
            // the page over a missing part drawing.
            import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/model/sidecar-loader.js')
                .catch((e) => console.warn(
                    '[brickwright] part sidecars unavailable — the palette will ' +
                    'fall back to built-in drawings:', e));
            // (The WASM compiler intercept used to be installed here. It now
            // lives at the compile call site in debug-runner.js: patching
            // globalThis.fetch only matters when something compiles, and hanging
            // it off this tab's visibility meant opting in did nothing unless you
            // happened to open the Circuit tab first.)
            // Keep the whole module, not just the designer. The warnings, parts
            // list and examples panels are separate exports, and a build may
            // legitimately not have them yet — which the panel strip reports
            // rather than hides.
            this.setState({Designer: ui.CircuitDesigner, ui});
        } catch (e) {
            // A chunk that 404s because the deploy moved on is not an error the
            // user can act on, and catching it here made it INVISIBLE to the
            // global recovery in index.ejs: that handler only sees failures
            // nobody handled, and this catch handles it. The result was a
            // permanently dead panel next to a recovery that never ran. So ask
            // the recovery explicitly; it reloads once per tab, and returns
            // false if this is not a stale build or the one shot is spent.
            const recovering = typeof window !== 'undefined' &&
                window.__bwRecoverFromStaleBuild &&
                window.__bwRecoverFromStaleBuild(e && e.message);
            this.setState(recovering ? {reloading: true} : {error: e.message});
        }
        this.loading = false;
    }

    /**
     * The designer handing over the circuit it owns.
     *
     * `runDrc` wants `circuit.parts`, `.wires`, `.breadboards` and `.board`, and
     * `generateBom` wants the parts — all of it inside CircuitDesigner, and
     * neither `onBoardReady` nor `onDeclarationChange` carries it.
     *
     * It arrives ONCE, on mount, and that is right rather than a bug: the
     * circuit is a `useRef` instance that mutates in place behind an internal
     * revision counter, so the host holds a live reference — the same handshake
     * as `onBoardReady`. What a once-only handover does NOT give us is a signal
     * that the contents changed, which is why `onDeclarationChange` doubles as
     * one below.
     *
     * (The prop is `onCircuitReady`. I asked for `onCircuitChange` and it
     * shipped under the other name — the sixth producer/consumer mismatch of
     * this campaign, and the one that cost the least, because nothing silently
     * half-worked: the panels kept saying they had no circuit.)
     */
    handleCircuitReady (circuit) {
        this.setState({circuit});
        // Detect CPU parts on the board and publish the core so the debug
        // panel creates the right target kind (z80, eater6502, avr8js).
        if (circuit && circuit.parts) {
            const rt = this.props.vm && this.props.vm.runtime;
            if (rt && !rt.bwDeviceCore) {
                if (circuit.parts.some(p => p.kind === 'z80')) {
                    rt.bwDeviceCore = 'z80';
                } else if (circuit.parts.some(p => p.kind === 'w65c02')) {
                    rt.bwDeviceCore = 'w65c02';
                }
            }
        }
    }

    /**
     * Keep the hardware contract live while the user wires the board.
     *
     * CircuitDesigner derives pins from physical wiring; the Scratch blocks
     * and debugger read them from runtime.stc. Leaving this as a one-way
     * preview made a perfectly wired Uno look disconnected to the code tab.
     * Merge only the circuit-owned tables so compiler/device settings and any
     * declarations not represented by the visual starter-kit parts survive.
     */
    handleDeclarationChange (decls) {
        this.setState(s => ({circuitRev: (s.circuitRev || 0) + 1}));
        if (!decls || !decls.device || !Array.isArray(decls.pins)) return;
        const vm = this.props.vm;
        if (!vm) return;
        const current = (vm.runtime && vm.runtime.stc) || {};
        const next = {
            ...current,
            device: decls.device,
            pins: decls.pins,
            ports: decls.ports || [],
            parts: decls.parts || []
        };
        if (vm.setStc) vm.setStc(next);
        else if (vm.runtime) vm.runtime.stc = next;
        this.setState({stc: next});
        if (vm.runtime && vm.runtime.emit) vm.runtime.emit('PROJECT_CHANGED');
    }

    /**
     * The example gallery index, fetched once when the tab is first opened.
     *
     * It is a fetch rather than an import because the gallery is 53 examples of
     * circuits, programs and expectations — data that has no business in the
     * first-paint bundle for the many users who never open this tab. The tab is
     * already lazy, so by the time this runs the user has asked for it.
     *
     * A missing index is reported, not swallowed into an empty list. An empty
     * gallery and an unshipped one look identical on screen and mean completely
     * different things — the first says "we have no examples", which would be a
     * lie about work bw-cfront has done.
     */
    async loadExamples () {
        if (this.state.examples || this.examplesLoading) return;
        this.examplesLoading = true;
        try {
            const res = await fetch('examples/index.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.examples || []);
            this.setState({examples: list});
        } catch (e) {
            this.setState({examplesError:
                'The example gallery is not part of this build yet ' +
                `(examples/index.json: ${e.message}). The examples exist — they ` +
                'are published by bw-cfront and need vendoring into the app.'});
        }
        this.examplesLoading = false;
    }

    /**
     * Open a gallery example onto the board.
     *
     * The card hands back the whole index entry, so the files it names are
     * fetched here rather than guessed: `files.circuit` is a path relative to
     * the gallery root, not an id to reconstruct.
     *
     * Loading is destructive — it replaces whatever is on the board. That is
     * acceptable without a confirm dialog *only* because bw-circuit-ui's
     * `handleLoad` calls `_saveHistory()` first, so undo brings the previous
     * circuit back. If that ever stops being true this needs a prompt, which is
     * why the reason is written down rather than assumed.
     *
     * @param {object} ex an entry from examples/index.json
     */
    /**
     * Load an example's program, so the project gains its PIN declarations.
     *
     * Without this, opening an example gives a wired board and no debugger:
     * the run controls are gated on `stc.pins`, and pins are declared in
     * `program.bw`, not in `circuit.json`. That is the shortest path a curious
     * user takes to find the debugger, and it ended nowhere.
     *
     * `vm.loadProject` REPLACES the project — unlike loading a circuit, which
     * the designer's undo can recover. So this asks first.
     *
     * This repeats part of pseudocode-importer.jsx's sequence (parse →
     * generateSB3 → loadProject → set stc) rather than sharing it, and that is
     * a deliberate, narrow choice I would rather flag than hide: extracting the
     * importer's version means refactoring working code that has no test
     * covering it. What is NOT duplicated is the stc-comment persistence — the
     * importer writes `stc` into a stage comment so it survives save/reload.
     * An opened example lives on `runtime.stc`, which `readStc()` reads, and is
     * lost on reload. If examples ever need to survive a save, this should call
     * the importer's path instead of growing a second copy of it.
     *
     * @returns {Promise<boolean>} whether pins were loaded
     */
    async loadExampleProgram (ex) {
        const path = ex && ex.files && ex.files.program;
        if (!path) return false;
        const vm = this.props.vm;
        if (!vm || !vm.loadProject) return false;
        const res = await fetch(`examples/${path}`);
        if (!res.ok) throw new Error(`program: HTTP ${res.status}`);
        let source = await res.text();
        const {default: SB3Creator} = await import(
            /* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator.js');

        // An example is a curated PAIRING of program and circuit: the
        // circuit.json has the example's own device seated and wired. This
        // used to retarget the program to the CURRENT project's device,
        // which silently broke the pairing — the ATtiny88 pendant retargeted
        // to an STC12 program (or, when retarget refused, loaded as-authored
        // but with the OLD device's engine still selected), and the matrix
        // never lit (owner report, 3791c09). The example's device wins;
        // retargeting stays available afterwards in the Code tab.
        const exDevice = (source.match(/^DEVICE\s+([\w-]+)/im) || [])[1];

        const creator = new SB3Creator();
        creator.parse(source);
        const blob = await creator.generateSB3();
        await vm.loadProject(await blob.arrayBuffer());
        // scratch-vm's serializer drops unknown top-level keys, so `stc` never
        // survives toJSON. Keep it on the runtime, which lives as long as the
        // project does — the same reason the importer does it.
        const stc = creator.project.stc || null;
        if (vm.setStc) vm.setStc(stc); else vm.runtime.stc = stc;
        // Store the pseudocode source so the Code tab can show it.
        // The importer reads this on mount/update and fills its buffer
        // when it sees the project changed.
        vm.runtime.bwPseudocodeSource = source;
        // Publish the example's device on the runtime, exactly like the
        // importer's device switch does — the debug panel reads these to
        // select the matching engine. Without this the pendant (ATTINY88)
        // ran on "Simulated (STC12 / 8051)" and every pin stayed off.
        if (exDevice) {
            const id = exDevice.toLowerCase();
            vm.runtime.bwDeviceId = id;
            const core =
                /^stc/.test(id) ? '8051' :
                /^(arduino-|atmega|attiny)/.test(id) ? 'arduino' :
                id === 'pico' ? 'rp2040' :
                /^(eater6502|6502|w65c02)$/.test(id) ? 'w65c02' :
                /^(z80|zx48|zx128)$/.test(id) ? 'z80' :
                id === 'microbit' ? 'micropython' : null;
            if (core) vm.runtime.bwDeviceCore = core;
        }
        // Emit a project change so the importer knows to re-read.
        vm.runtime.emit('PROJECT_CHANGED');
        // Not just a boolean: whether the "no pins" advisory is even true
        // depends on WHAT the program is. A PART binding (PART leds =
        // 74HC595 data P1.0 ...) drives pins without a single PIN line,
        // and a machine-class device (6502/Z80 bench) has no pin concept
        // at all — scolding either one misleads (owner report).
        return {
            pins: !!(stc && stc.pins && stc.pins.length),
            hasPart: /^PART\s+/im.test(source),
            device: (exDevice || '').toLowerCase(),
        };
    }

    async loadExample (ex) {
        const path = ex && ex.files && ex.files.circuit;
        if (!path) {
            this.setState({examplesError:
                `"${(ex && ex.id) || 'that example'}" lists no circuit file, so there is ` +
                'nothing to place on the board.'});
            return;
        }
        // An example with a program replaces the project, which undo cannot
        // recover — so ask, once, and say what is at stake. A circuit-only
        // example touches nothing but the board and needs no permission.
        // Whether the example ships a program file. The kind field is a
        // categorisation tag, not a file-presence gate: an example can be
        // kind:'circuit' (it is ABOUT a circuit) and still declare pins
        // that need loading. The gate must be the file, not the tag.
        const hasProgram = !!(ex.files && ex.files.program);
        if (hasProgram && typeof confirm === 'function') {
            const msg = /^de/i.test(navigator.language)
                ? `„${ex.id}" öffnen?\n\nDas ersetzt das aktuelle Projekt — seine Blöcke, Pins und sein Board. Nicht Gespeichertes geht verloren.`
                : `Open "${ex.id}"?\n\nThis replaces the current project — its blocks, its pins and its board. Anything unsaved is lost.`;
            const ok = confirm(msg);
            if (!ok) return;
        }
        this.setState({loadingExample: ex.id, examplesError: null});
        try {
            const res = await fetch(`examples/${path}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data || !Array.isArray(data.parts) || !Array.isArray(data.wires)) {
                throw new Error('not a circuit (no parts/wires)');
            }
            // The program first: it calls vm.loadProject, which would otherwise
            // discard a circuit loaded a moment earlier. Its failure is not
            // fatal — a board with no pins is still a board, and the panel now
            // says why the debugger is absent — so the circuit still loads and
            // the reason is reported.
            let prog = null;
            let programError = null;
            if (hasProgram) {
                try {
                    prog = await this.loadExampleProgram(ex);
                } catch (e) {
                    programError = e.message;
                }
            }
            const pins = !!(prog && prog.pins);
            // Switching to the Designer is the point of clicking an example —
            // leaving the user on the gallery with an invisible change would be
            // the same silence this panel strip exists to avoid.
            this.setState({
                // fileOnly tells the designer this circuit came with no
                // program: never rebuild it from whatever pins the previous
                // project left behind.
                circuitData: hasProgram ? data : {...data, fileOnly: true},
                panel: 'designer',
                loadingExample: null,
                stc: this.readStc(),
                examplesError: programError ?
                    `Opened the circuit for "${ex.id}", but its program did not load ` +
                    `(${programError}), so there are no pins and no debugger.` : null
            });
            // Machine-class devices (the 6502/Z80 benches) have no pin
            // concept — their debugger comes from the bus extract, not
            // from PIN lines. PART bindings drive pins without PIN lines.
            // Scolding either case was wrong (owner report, twice).
            const machineClass = prog && /^(eater6502|z80|zx48|zx128|6502|w65c02)$/.test(prog.device);
            if (hasProgram && !pins && !programError && prog && !prog.hasPart && !machineClass) {
                this.setState({examplesError:
                    `"${ex.id}" loaded, but its program declares no pins, so the ` +
                    'debugger stays hidden.'});
            }
        } catch (e) {
            this.setState({loadingExample: null, examplesError:
                `Could not open "${ex.id}": ${e.message}. The board is unchanged.`});
        }
    }

    /** DRC warnings, or null when we cannot compute them (and why). */
    drcWarnings () {
        const {ui, circuit, board} = this.state;
        if (!ui || typeof ui.runDrc !== 'function') {
            return {error: 'This build of the circuit designer does not export runDrc yet.'};
        }
        if (!circuit) {
            return {error: 'The designer has not handed over its circuit yet ' +
                           '(onCircuitReady has not fired), so the design-rule check ' +
                           'cannot run. Open the Designer once and come back.'};
        }
        try {
            return {warnings: ui.runDrc(circuit, board || circuit.board) || []};
        } catch (e) {
            // A checker that throws must not read as a clean circuit.
            return {error: `The design-rule check failed: ${e.message}`};
        }
    }

    /**
     * The debugger's board is THE board.
     *
     * Without this the tab builds its own and the runner builds another, and the
     * one on screen is not the one the emulator is driving — LEDs stay dark while
     * the program blinks them. Boundary A × D needs nothing more than handing the
     * same instance over: a halted MCU stops calling advanceTo, so the board
     * freezes coherently and no pause() is needed (DEBUG-CONTROL-MODEL §3.1).
     */
    handleRunnerChange (runner, ui) {
        const board = runner.board();
        // A stopped runner must not leave a ghost session on screen: after
        // Stop the phase is 'idle' (or 'error'), ui.session is stale or
        // null, and passing the last debugState through kept the designer's
        // status panel glowing green RUNNING forever. No session — no panel.
        const phase = ui && ui.phase;
        if (phase === 'idle' || phase === 'error') {
            if (this.state.debugState !== null) this.setState({debugState: null});
            return;
        }
        // GAP C fix: rebind the diagnostic hook to the ACTIVE board while a
        // debug session is attached. window.__board is set once by onBoardReady
        // (the designer's own board), but during a debug run the active board
        // is the runner's — one-board-one-truth says reads follow the active
        // board, and a diagnosis hook that lies costs a full probe cycle.
        if (board && typeof window !== 'undefined') window.__activeBoard = board;
        const halted = !!(ui && ui.session && ui.session.halted);
        const why = ui && ui.session && ui.session.why;
        // The designer reads debugState.tasks and .capabilities, and this passed
        // neither — so its Level 1 position panel and its active-part highlight
        // both received undefined and silently rendered nothing. Optional
        // chaining on their side meant nothing errored: the fifth time in two
        // days a value was written for a consumer, or read from a producer,
        // that did not exist. Enriched with the block id, which only the runner
        // can supply — it holds the (task, state) -> block map.
        const kinds = ui && ui.yieldKinds;
        const tasks = (why && why.tasks ? why.tasks : (runner.state().session || {}).tasks) || null;
        const enriched = tasks && tasks.map(t => {
            const blockId = ui && ui.blockOfTask ? ui.blockOfTask[`${t.task}/${t.state}`] : undefined;
            // A raw Scratch block id ("FWr0@1h…") on screen is worse than
            // nothing; only this side owns the VM, so the human label is
            // resolved here and the designer renders label, never blockId.
            return {...t, blockId, label: blockId ? this.labelForBlock(blockId) : undefined,
                kind: blockId && kinds ? kinds[blockId] : undefined};
        });
        const haltReason = why ? why.cause : null;
        // bwMs: the cooperative scheduler's millisecond tick, read from RAM via
        // the symbol table's bw_ms address. undefined before symbols exist (no
        // fabricated zero — see ceafc8d).
        const bwMs = ui ? ui.bwMs : undefined;
        const caps = ui ? ui.capabilities : null;
        const prev = this.state.debugState || {};
        if (board !== this.state.board || halted !== prev.halted ||
            haltReason !== prev.haltReason || enriched !== prev.tasks) {
            this.setState({
                board,
                debugState: {
                    halted,
                    skewNs: why ? why.skewNs : 0n,
                    haltReason,
                    bwMs,
                    tasks: enriched,
                    capabilities: caps
                }
            });
        }
    }

    /** Resolve a Scratch block id to something a person can read: the
     *  block's opcode with its extension prefix dropped and underscores
     *  spaced ("stc12_setpin" → "setpin"). Null when the block is gone —
     *  the caller renders nothing rather than an opaque id. */
    labelForBlock (blockId) {
        const vm = this.props.vm;
        const targets = vm && vm.runtime && vm.runtime.targets;
        if (!targets) return null;
        for (const t of targets) {
            const b = t.blocks && t.blocks.getBlock && t.blocks.getBlock(blockId);
            if (b && b.opcode) {
                const bare = b.opcode.includes('_') ? b.opcode.slice(b.opcode.indexOf('_') + 1) : b.opcode;
                return bare.replace(/_/g, ' ');
            }
        }
        return null;
    }

    /** The project's own hardware declarations — device, clock, and the pin table.
     *
     * They live on the runtime, not in the serialised project: scratch-vm's sb3
     * serializer emits targets/monitors/extensions/meta and drops every other
     * top-level key, so the `stc` block that SB3Creator writes into the .sb3 never
     * came back out of vm.toJSON(). This read used to be that one, which is why the
     * designer opened empty for every project, hardware or not. */
    readStc () {
        const vm = this.props.vm;
        if (vm && vm.runtime && vm.runtime.stc) return vm.runtime.stc;
        try { return JSON.parse(vm.toJSON()).stc || null; } catch { return null; }
    }

    render () {
        const {Designer, error, reloading, stc} = this.state;
        // overflow:clip prevents deep sidebar scrolls from shifting the page.
        // But clip on its own cuts off anything taller than the tab with no way
        // to reach it — the parts palette ended below the fold at "09 Shift Reg"
        // with no bottom edge, and the multimeter the same. A column flex box
        // gives the designer the remaining height explicitly, and `minHeight: 0`
        // is what lets a flex child actually shrink and scroll instead of
        // growing past its parent (the default `min-height: auto` is exactly
        // why this looked like a clipping bug rather than a sizing one).
        // `width: 100%` is not redundant with a block element's default: the
        // tab panel upstream is `display: flex`, so this root is a FLEX ITEM,
        // and a flex item's default `flex-grow: 0` sizes it to its content. It
        // measured 1313px inside a 1400px panel — the leftover strip that made
        // "Full width" look like it was not reclaiming the whole width. The
        // stage was hidden correctly the whole time; the tab simply never grew
        // into the space it was given. `flex` is stated too, so this does not
        // depend on which of the two upstream happens to honour.
        // minHeight:0 breaks the flex min-height:auto trap so the designer
        // content can scroll when portalled into the right pane (where the
        // host has overflow:auto). Without it, the box grows to its content
        // height and the portal host clips silently.
        const box = {height: '100%', width: '100%', flex: '1 1 auto', minHeight: 0,
            overflow: 'auto', padding: 8, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column'};
        if (reloading) {
            return (
                <div style={{...box, color: '#64748b'}}>
                    {'A new version was published while this tab was open. Reloading…'}
                </div>
            );
        }
        if (error) {
            // Reached only when recovery declined: not a stale build, or the
            // one-shot is spent (a second failure is a real bug, not a deploy
            // race, and looping the reload would hide it). Offer the manual
            // action rather than leaving a dead panel — the user's tab may have
            // been open across two deploys, which is not their fault.
            return (
                <div style={{...box, color: '#b91c1c'}}>
                    <div>{`The circuit designer failed to load: ${error}`}</div>
                    <button
                        style={{marginTop: 10, padding: '6px 12px', borderRadius: 6, cursor: 'pointer'}}
                        onClick={() => {
                            try {
                                sessionStorage.removeItem('bw-chunk-recovery');
                            } catch { /* private mode */ }
                            location.reload();
                        }}
                    >
                        {'Reload the editor'}
                    </button>
                </div>
            );
        }
        // Debugger-only right pane: dock 'solo' gives the DebugPanel the whole
        // stage column, no designer around it — the mode for working the
        // debugger directly beside the code editor. It deliberately does not
        // wait for the Designer chunk (the panel has its own Suspense), and it
        // only applies while portalled: on the dedicated Circuit tab, 'solo'
        // falls back to the instruments-column dock below, so the designer —
        // and the compact debugger in its Instruments panel — stay reachable.
        if (this.state.debugDock === 'solo' && this._stagePortalOn()) {
            this._portalOn = true;
            const solo = (
                <div style={{...box, overflow: 'auto'}} data-debugger-solo-pane>
                    {stc && stc.pins && stc.pins.length ? this.renderDebugPanel() : (
                        <div style={{color: '#64748b', fontSize: 12.5, padding: 8}} data-no-code-indicator>
                            {(SOLO_L10N[String(this.props.locale || 'en').slice(0, 2)]
                                || SOLO_L10N.en).noCode}
                        </div>
                    )}
                </div>
            );
            return ReactDOM.createPortal(solo, this._stageHost);
        }
        if (!Designer) {
            return <div style={{...box, color: '#64748b'}}>{'Loading the circuit designer…'}</div>;
        }
        this._portalOn = this._stagePortalOn();
        // On the dedicated Circuit tab 'solo' behaves as 'top': the designer
        // with the compact debugger in its Instruments column.
        const dock = this.state.debugDock === 'solo' ? 'top' : this.state.debugDock;
        const content = (
            <div style={box}>
                {/* A circuit does not need a microcontroller.
                    This used to read "declares no pins, so the board starts empty", which
                    framed a battery-LED-resistor circuit — the first circuit anyone builds —
                    as a misconfigured MCU project. The board, the solver, the instruments and
                    the design-rule check all work with no MCU in the netlist at all. So this
                    is an invitation, shown once and dismissible, not a warning. */}
                {(stc && stc.pins && stc.pins.length) || this.state.hintDismissed ? null : (
                    <details style={{marginBottom: 6, flex: '0 0 auto', color: '#075985'}}>
                    <summary style={{cursor: 'pointer', color: '#d97706', fontSize: 18, lineHeight: 1, padding: '2px 4px'}} title="Show circuit hint">▲</summary>
                    <div style={{padding: '5px 8px', borderRadius: 5,
                        background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12,
                        color: '#075985', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                        <span style={{flex: 1}}>
                            {'Build a circuit on its own — battery, LED, resistor, a 555. ' +
                             'To drive parts from blocks, declare pins in the Code tab ' +
                             '(PIN led1 IS P1.0 OUTPUT ACTIVE LOW).'}
                        </span>
                        <button
                            title={'Dismiss'}
                            onClick={() => {
                                this.setState({hintDismissed: true});
                                try {
                                    localStorage.setItem('bw-circuit-hint', '1');
                                } catch { /* private mode: dismissed for this session only */ }
                            }}
                            style={{border: 'none', background: 'transparent', cursor: 'pointer',
                                color: '#0369a1', fontSize: 15, lineHeight: 1, padding: '0 2px'}}
                        >{'×'}</button>
                    </div>
                    </details>
                )}
                {/* The debugger's controls, above the board they act on. The design note
                    puts them in the stage header; they are here because that header is
                    shown for every project including pure Scratch ones — see the panel's
                    own comment. The block glow lands in the Blocks tab regardless. */}
                {stc && stc.pins && stc.pins.length ? null : (
                    // The panel is correctly absent — there is no program to run
                    // control over — but absent and broken look identical, and a
                    // reader who came here for the debugger finds nothing and no
                    // reason. Every other panel in this strip explains why it is
                    // empty; this one used to be the exception.
                    this.state.debugHintDismissed ? null : (
                        <details style={{marginBottom: 8, flex: '0 0 auto', color: '#64748b'}}>
                        <summary style={{cursor: 'pointer', color: '#ca8a04', fontSize: 18, lineHeight: 1, padding: '2px 4px'}} title="Show debugger hint">▲</summary>
                        <div style={{padding: '4px 8px', borderRadius: 4,
                            background: '#f8fafc', border: '1px solid #e2e8f0', flex: '0 0 auto',
                            fontSize: 11.5, color: '#64748b',
                            display: 'flex', alignItems: 'center', gap: 8}}>
                            <span style={{flex: 1}}>
                                {'Run and step controls appear here once the project declares ' +
                                 'pins — the debugger needs a program and a chip to drive. Add ' +
                                 'one in the Code tab, e.g. PIN led1 IS P1.0 OUTPUT ACTIVE LOW.'}
                            </span>
                            {/* Dismissible for the same reason the standalone-circuit hint is:
                                someone building a circuit with no MCU has read it once and does
                                not need it on every visit. Its own key, not the circuit hint's —
                                they answer different questions and dismissing one should not
                                silence the other. */}
                            <button
                                title={'Dismiss'}
                                onClick={() => {
                                    this.setState({debugHintDismissed: true});
                                    try {
                                        localStorage.setItem('bw-debug-hint', '1');
                                    } catch { /* private mode: dismissed for this session */ }
                                }}
                                style={{border: 'none', background: 'transparent', cursor: 'pointer',
                                    color: '#64748b', fontSize: 15, lineHeight: 1, padding: '0 2px'}}
                            >{'×'}</button>
                        </div>
                        </details>
                    )
                )}
                {this.state.panel === 'designer' ? null : this.renderPanelStrip()}
                <div style={{display: 'flex', flex: '1 1 auto', minHeight: 0, gap: 8}}>
                <div style={{flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column'}}>
                {/* The tab container is `overflow: clip` so a deep sidebar scroll cannot
                    shift the page. That is right for the designer, whose palette and panels
                    scroll internally — but these panels do not. A 53-row parts list or a
                    long warnings list would be clipped with no way to reach the rest of it:
                    content silently absent, which is the failure this strip exists to avoid.
                    So the panel body carries its own scroll. */}
                {this.state.panel === 'designer' ? null : (
                    <div style={{flex: '1 1 0', minHeight: 0, height: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                        {this.renderPanel()}
                    </div>
                )}
                {/* The designer stays mounted whatever panel is showing: it owns the
                    circuit, the board and the emulator's view of both, and unmounting
                    it to show a parts list would tear all three down and rebuild them
                    on the way back. Hidden, not destroyed. */}
                <div style={this.state.panel === 'designer' ?
                    {flex: '1 1 auto', minHeight: 0, overflow: 'auto'} : {display: 'none'}}>
                    <Designer
                    stc={stc}
                    examples={this.state.examples || undefined}
                    onLoadExample={this.loadExample}
                    board={this.state.board || undefined}
                    debugState={this.state.debugState || undefined}
                    onCircuitReady={c => { window.__circuit = c; this.handleCircuitReady(c); }}
                    circuitData={this.state.circuitData || undefined}
                    onBoardReady={(board) => {
                        // Same diagnosis hook the standalone harness exposes —
                        // production incidents get measured, not guessed at.
                        window.__board = board;
                        // Publish the board so the Code tab's sim runner can use it
                        // instead of building its own. One board, one truth.
                        const vm = this.props.vm;
                        if (vm && vm.runtime) {
                            vm.runtime.circuitBoard = board;
                            // Producer-asserts-the-consumer: verify the circuit extension
                            // can read it (it uses a lazy getter on this.runtime.circuitBoard).
                            console.assert(vm.runtime.circuitBoard === board,
                                'circuitBoard not readable from runtime');
                        }
                    }}
                    simulationOnly={(() => {
                        // Read stc12liveCapabilities from runtime.
                        // If a live hardware target is connected, simulation-only
                        // features (voltage, current, brightness) are unavailable.
                        const vm = this.props.vm;
                        const caps = vm && vm.runtime && vm.runtime.stc12liveCapabilities;
                        if (caps) return false; // live hardware → no sim values
                        return undefined; // default: simulator assumed
                    })()}
                        onDeclarationChange={this.handleDeclarationChange}
                        panelNav={this.renderPanelStrip()}
                    embedded={this._portalOn}
                    // The debugger belongs to the designer's Instruments
                    // column in both the Code Blocks portal and the dedicated
                    // Circuit tab. The old visibility guard made “switch to
                    // debugger” a no-op whenever Circuit itself was active.
                    debuggerOn={dock === 'top'}
                    debuggerPanel={dock === 'top' ? this.renderDebugPanel() : null}
                        runToken={this.state.runToken}
                        stopToken={this.state.stopToken}
                    />
                </div>
                </div>
                {/* One block covers both non-top docks: 'right' shows the
                    column, 'off' keeps the panel mounted but hidden (the
                    runner survives the toggle). This used to be two blocks,
                    and dock 'off' matched BOTH — two live DebugPanel
                    instances, two runners. */}
                {dock !== 'top' && stc && stc.pins && stc.pins.length ? (
                    <div
                        style={dock === 'right' ?
                            {flex: '0 0 320px', minWidth: 0, overflow: 'auto'} : {display: 'none'}}
                        aria-hidden={dock === 'right' ? undefined : 'true'}
                    >
                        {this.renderDebugPanel()}
                    </div>
                ) : null}
                </div>
            </div>
        );
        if (this._portalOn) return ReactDOM.createPortal(content, this._stageHost);
        return content;
    }

    /** One DebugPanel instance, wherever it docks. Moving between the top
     *  slot, the right column and the solo pane remounts it (different tree
     *  positions), so the runner restarts on a dock change — a rare,
     *  user-initiated action.
     *  Toggling right<->off does NOT remount: off keeps it hidden, alive. */
    renderDebugPanel () {
        const {stc} = this.state;
        return (
            <React.Suspense fallback={null}>
                <DebugPanel
                    clockHz={(stc && Number(stc.clock)) || 11059200}
                    runToken={this.state.runToken}
                    stopToken={this.state.stopToken}
                    onRunnerChange={this.handleRunnerChange}
                />
            </React.Suspense>
        );
    }

    /** Designer | Warnings | Parts list | Examples. */
    renderPanelStrip () {
        const {panel} = this.state;
        const drc = this.drcWarnings();
        // Only a real count earns a badge. "0" when the check could not run would
        // say "this circuit is clean", which is the opposite of what we know.
        const count = drc.warnings ? drc.warnings.length : null;
        const danger = drc.warnings ? drc.warnings.filter(w => w.severity === 'danger').length : 0;
        const tabs = [
            ['designer', 'Designer', null],
            ['warnings', 'Warnings', count],
            ['bom', 'Parts list', null],
            ['examples', 'Examples', null]
        ];
        const tabIcons = {designer: '▦', warnings: '⚠', bom: '☷', examples: '▤'};
        const tabTitles = {designer: 'Designer', warnings: 'Warnings', bom: 'Parts list', examples: 'Examples'};
        return (
            <div data-panel-navigation style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, flex: '0 0 auto',
                fontSize: 11.5, lineHeight: 1.6}}>
            <div style={{display: 'inline-flex', gap: 1, padding: 1,
                borderRadius: 5, background: '#f1f5f9'}}>
                {tabs.map(([id, label, badge]) => (
                    <button
                        key={id}
                        onClick={() => {
                            this.setState({panel: id});
                            if (id === 'examples') this.loadExamples();
                        }}
                        title={tabTitles[id]}
                        aria-label={tabTitles[id]}
                        aria-pressed={panel === id}
                        style={{
                            width: 34, minWidth: 34, height: 34, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4,
                            fontSize: 17, lineHeight: 1, position: 'relative', fontWeight: 600,
                            background: panel === id ? '#1d4ed8' : 'transparent',
                            boxShadow: panel === id ? '0 1px 2px rgba(15,23,42,.25)' : 'none',
                            color: panel === id ? '#fff' : '#64748b'
                        }}
                    >
                        <span aria-hidden="true">{tabIcons[id]}</span>
                        {badge ? (
                            <span style={{position: 'absolute', top: 1, right: 1, minWidth: 13, padding: '0 2px', borderRadius: 8, fontSize: 9,
                                background: danger ? '#fecaca' : '#fef3c7',
                                color: danger ? '#991b1b' : '#92400e'}}
                            >{badge}</span>
                        ) : null}
                    </button>
                ))}
            </div>
            <span style={{flex: 1}} />
            </div>
        );
    }

    renderPanel () {
        const {panel, ui, circuit} = this.state;
        const note = (text) => (
            <div style={{padding: '10px 12px', borderRadius: 6, background: '#f8fafc',
                border: '1px solid #e2e8f0', fontSize: 13, color: '#475569'}}
            >{text}</div>
        );

        if (panel === 'warnings') {
            const drc = this.drcWarnings();
            if (drc.error) return note(drc.error);
            if (!drc.warnings.length) return note('No design-rule warnings for this circuit.');
            if (ui && ui.DrcPanel) return <ui.DrcPanel warnings={drc.warnings} />;
            // The data is real even when their panel is not in the build; render it
            // plainly rather than withhold it.
            return (
                <ul style={{margin: 0, paddingLeft: 18, fontSize: 13}}>
                    {drc.warnings.map((w, i) => (
                        <li key={i} style={{marginBottom: 6,
                            color: w.severity === 'danger' ? '#991b1b' : '#92400e'}}
                        >{`${w.rule}: ${w.message || ''} (${w.partId || 'circuit'})`}</li>
                    ))}
                </ul>
            );
        }

        if (panel === 'bom') {
            if (!ui || typeof ui.generateBom !== 'function') {
                return note('This build of the circuit designer does not export generateBom yet.');
            }
            if (!circuit) {
                return note('The designer has not handed over its circuit yet ' +
                            '(onCircuitReady has not fired), so the parts list cannot ' +
                            'be built. Open the Designer once and come back.');
            }
            if (ui.BomPanel) return <ui.BomPanel parts={circuit.parts} />;
            const bom = ui.generateBom(circuit.parts) || [];
            return bom.length ? (
                <table style={{fontSize: 13, borderCollapse: 'collapse'}}>
                    <tbody>
                        {bom.map((row, i) => (
                            <tr key={i}>
                                <td style={{padding: '2px 10px 2px 0'}}>{row.qty || row.quantity}</td>
                                <td style={{padding: '2px 10px 2px 0'}}>{row.kind || row.name}</td>
                                <td style={{padding: '2px 0'}}>{row.value || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : note('No parts on the board yet.');
        }

        if (panel === 'examples') {
            if (!ui || !ui.ExamplesBrowser) {
                return note('This build of the circuit designer does not include the ' +
                            'examples browser yet.');
            }
            // An empty array here used to read as "there are no examples", which
            // is a different and much worse statement than "this build does not
            // ship them". bw-cfront publishes examples/index.json — 53 entries,
            // bilingual titles, and a `kind` of "circuit" or "program" — so the
            // browser is fed from that or says why it is not.
            const {examples, examplesError} = this.state;
            if (!examples) return note(examplesError || 'Loading examples…');
            const stc = this.readStc();
            const currentDevice = stc && stc.device ? String(stc.device).toLowerCase() : null;
            // An advisory renders as a DISMISSIBLE STRIP above the list —
            // it used to replace the entire browser, so one sticky message
            // rendered "where the actual examples list should have been"
            // (owner report, with screenshot).
            return (
                <div style={{display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%'}}>
                    {examplesError ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 10px', fontSize: '12px',
                            background: 'rgba(230, 126, 34, 0.12)',
                            borderBottom: '1px solid rgba(230, 126, 34, 0.4)',
                            flexShrink: 0
                        }}>
                            <span style={{flex: 1}}>{examplesError}</span>
                            <button
                                type="button"
                                onClick={() => this.setState({examplesError: null})}
                                style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1}}
                                aria-label="Dismiss"
                            >{'×'}</button>
                        </div>
                    ) : null}
                    <div style={{flex: 1, minHeight: 0, overflow: 'auto'}}>
                        <ui.ExamplesBrowser
                            examples={examples}
                            onLoadExample={this.loadExample}
                            currentDevice={currentDevice}
                            lang={(typeof navigator !== 'undefined' && navigator.language || 'en')
                                .slice(0, 2) === 'de' ? 'de' : 'en'}
                        />
                    </div>
                </div>
            );
        }
        return null;
    }
}

CircuitTab.propTypes = {
    isVisible: PropTypes.bool,
    vm: PropTypes.shape({toJSON: PropTypes.func}).isRequired
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale,
    isVisible: state.scratchGui.editorTab.activeTabIndex === 4
}))(CircuitTab);
