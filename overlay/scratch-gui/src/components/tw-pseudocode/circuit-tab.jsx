import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {normalizeDeviceId, resolveExampleBench} from '../../lib/example-bench.js';
import {setProjectTitle} from '../../reducers/project-title';
import {getIsAnyCreatingNewState} from '../../reducers/project-state';

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

// A panel render-crash must never take the whole app down: degrade to a
// card with the error and a remount button (the Step x10 chain unmounted
// the entire GUI before this existed).
class PanelBoundary extends React.Component {
    constructor (props) { super(props); this.state = {err: null}; }
    static getDerivedStateFromError (err) { return {err}; }
    componentDidCatch (err) { console.error('[brickwright] debug panel crashed:', err); }
    render () {
        if (this.state.err) {
            return (
                <div style={{padding: 10, color: '#b91c1c', fontSize: 12.5}} data-debug-panel-crash>
                    <div>{`The debugger hit an error: ${String(this.state.err && this.state.err.message || this.state.err).slice(0, 200)}`}</div>
                    <button style={{marginTop: 8, padding: '4px 10px', cursor: 'pointer'}}
                        onClick={() => this.setState({err: null})}>{'Restart the debugger panel'}</button>
                </div>
            );
        }
        return this.props.children;
    }
}

// A dock SLOT: adopts the persistent debug-host DOM node. The DebugPanel
// renders through ONE portal into ONE node that never changes identity —
// docking moves the NODE between slots, so the runner survives the move
// (owner requirement: '>>' must not reset a running session).
const HostMount = ({host, style}) => (
    <div
        data-debug-host-slot
        style={{display: 'flex', flexDirection: 'column', flex: '1 1 auto',
            minHeight: 0, minWidth: 0, ...style}}
        ref={el => { if (el && host && host.parentElement !== el) el.appendChild(host); }}
    />
);

// A program drives the board when it declares PINs OR binds a PART
// (PART leds = 74HC595 ... claims pins with zero PIN lines — the
// 8-LED chaser showed 'No program pins declared' forever, owner
// report 2026-08-17).
const stcDrives = stc => !!(stc && ((stc.pins && stc.pins.length) ||
    (stc.parts && stc.parts.length)));

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
        // 'right' by default: the FULL DebugPanel in the Circuit editor's
        // right column. 'top' tucked it into the Designer's Instruments
        // column, which reads as "there is no debugger here" — the owner
        // asked for the right-pane debugger roughly ten times before this
        // default changed (2026-08-17). 'top' stays selectable in settings.
        let debugDock = 'right';
        let showInStage = true; // owner default: while coding, the circuit replaces the stage
        let rightPaneHidden = true;
        try {
            showInStage = localStorage.getItem('bw-stage-circuit') !== '0';
            rightPaneHidden = localStorage.getItem('bw-right-pane-hidden') !== '0';
        } catch { /* private mode */ }
        this._stageHost = null;
        try {
            hideStage = localStorage.getItem('bw-hide-stage') === '1';
            const d = localStorage.getItem('bw-debug-dock');
            if (d === 'top' || d === 'right' || d === 'off' || d === 'solo') debugDock = d;
        } catch { /* private mode: defaults */ }
        this.state = {Designer: null, ui: null, error: null, reloading: false, stc: null,
            board: null, debugState: null, panel: 'designer', circuit: null, hintDismissed,
            debugHintDismissed, hideStage, debugDock, showInStage, rightPaneHidden,
            examples: null, examplesError: null, circuitData: null, loadingExample: null,
            machineBooted: false, pendingExampleTitle: null};
        this.handleRunnerChange = this.handleRunnerChange.bind(this);
        this.handleCircuitReady = this.handleCircuitReady.bind(this);
        this.loadExample = this.loadExample.bind(this);
        this._boxRef = React.createRef();
        this._measureBox = this._measureBox.bind(this);
        this.handleDeclarationChange = this.handleDeclarationChange.bind(this);
        this.handleCircuitEdit = this.handleCircuitEdit.bind(this);
        this.handleProjectStart = this.handleProjectStart.bind(this);
        this.handleProjectStop = this.handleProjectStop.bind(this);
        this.handleProjectChanged = this.handleProjectChanged.bind(this);
    }

    componentDidMount () {
        if (this.props.isVisible) {
            this.load();
            this.loadExamples();
        }
        window.addEventListener('resize', this._measureBox);
        // Project save/load carries the Circuit and Widgets tabs through the
        // .sb3 bundle (lib/bw-project-bundle.js). COLLECT: flush the LIVE
        // state into the bundle's keys before the save reads them — the
        // autosave only updates on an edit, so an untouched example saved
        // the previous bench. LOADED: the restored keys are in localStorage
        // but a mounted tab shows its old content; hand the circuit to the
        // Designer as fresh circuitData (it loads any new prop reference)
        // and rebuild the controller panel in place (listeners keep refs).
        this._onBundleCollect = () => {
            try {
                const rt = this.props.vm && this.props.vm.runtime;
                const m = rt && rt.circuitModel;
                if (m && typeof m.toJSON === 'function') {
                    localStorage.setItem('bw-circuit-autosave', JSON.stringify(m.toJSON()));
                }
                const p = rt && rt.controllerPanel;
                if (p && typeof p.toJSON === 'function') {
                    if (p.getWidgetNames().length) {
                        localStorage.setItem('bw-ctl-widgets', JSON.stringify(p.toJSON()));
                    } else {
                        localStorage.removeItem('bw-ctl-widgets');
                    }
                }
            } catch (e) { /* the Scratch half of the save must survive this */ }
        };
        window.addEventListener('bw-project-bundle-collect', this._onBundleCollect);
        this._onBundleLoaded = () => {
            try {
                const raw = localStorage.getItem('bw-circuit-autosave');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    try { localStorage.setItem('bw-circuit-file-loaded', '1'); } catch (e) { /* full */ }
                    this.setState({circuitData: parsed});
                }
                const wraw = localStorage.getItem('bw-ctl-widgets');
                const rt = this.props.vm && this.props.vm.runtime;
                const p = rt && rt.controllerPanel;
                if (wraw && p) {
                    const data = JSON.parse(wraw);
                    if (data && data.version === 1 && Array.isArray(data.widgets)) {
                        for (const name of p.getWidgetNames()) p.removeWidget(name);
                        for (const w of data.widgets) {
                            const added = p.addWidget(w.name, w.type, w.config || {}, w.layout || {});
                            if (w.binding) added.binding = {...w.binding};
                        }
                        if (data.mode === 'play' || data.mode === 'edit') p.setMode(data.mode);
                    }
                }
            } catch (e) {
                console.warn('[brickwright] restoring the loaded project\'s tabs failed', e);
            }
        };
        window.addEventListener('bw-project-bundle-loaded', this._onBundleLoaded);
        // The stage-hiding CSS lives here rather than in a stylesheet because
        // the wrapper's class is a hashed CSS-module name; the attribute-
        // contains selector survives rebuilds.
        if (!document.getElementById('bw-layout-style')) {
            const st = document.createElement('style');
            st.id = 'bw-layout-style';
            st.textContent = 'html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="stage-canvas-wrapper"],html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="target-wrapper"]{display:none !important} html[data-bw-hide-stage] div[class*="stage-and-target-wrapper"] div[class*="stage-wrapper"]{position:relative;z-index:3;background:transparent !important} details > summary::-webkit-details-marker{display:none} details > summary::marker{content:""}';
            document.head.appendChild(st);
        }
        this._syncStageAttr();
        this._ensureStageHost();
        this._settingsHandler = event => {
            const {key, value} = event.detail || {};
            if (key === 'about') return;
            if (key === 'debugDock' || key === 'bw-debug-dock') {
                this.setDock(value);
                // A right-docked debugger (or a controller faceplate) is a
                // request to USE the optional right pane. gui.jsx opens its
                // column on this same event — but this tab keeps its own
                // rightPaneHidden, and _syncStageAttr re-nones the stage
                // wrapper from that stale flag on EVERY update. Since the
                // dock's portal host is a CHILD of that wrapper, the whole
                // dock — debugger, serial console, input line — was
                // display:none while every existence probe still passed
                // (the browser gate's :visible click caught it).
                if (value === 'right' || value === 'controller') {
                    try { localStorage.setItem('bw-right-pane-hidden', '0'); } catch { /* private mode */ }
                    this.setState({rightPaneHidden: false});
                }
                // Stage-header view changes can arrive while this tab is still
                // mounted but not selected. Request the designer here too;
                // otherwise the portal host is visible before its content has
                // ever been loaded and the user sees a blank debugger pane.
                //
                // EVERY dock, not just 'top' and 'solo'. 'right' and 'off' live
                // INSIDE the designer's tree, so they need it loaded more than
                // 'solo' does (which renders the panel on its own) — and they
                // were the two values excluded from this call. Settings →
                // Workspace → Debugger → Right, from any tab but Circuit, left
                // the portal host displayed and empty: the blank pane the owner
                // reported, and the same blank the Scratch stage showed on a
                // fresh load before anyone had opened the Circuit tab.
                if (this.state.showInStage) this.load();
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
        // The first-run chooser is global, but this tab owns the canonical
        // examples loader. forceRenderTabPanel keeps this listener alive even
        // when a starter ultimately opens the Code tab (the LEGO journey).
        this._starterJourneyHandler = event => this.loadStarterJourney(event);
        window.addEventListener('bw-start-journey', this._starterJourneyHandler);
        // Machine bench: Build Machine dispatches this when the bus extractor
        // succeeds. The DebugPanel needs to render even without declared pins
        // so the user can load a program and run the machine. The detail is
        // ALSO stashed on window: the DebugPanel mounts lazily BECAUSE of
        // this event, so its own listener structurally cannot have heard the
        // first one — it replays the stash on mount. Same for a program
        // delivered (preset / file / ASM) before the panel finished mounting.
        this._machineExtractedHandler = e => {
            window.__bwMachineExtracted = e && e.detail;
            this.setState({machineBooted: true});
        };
        window.addEventListener('bw-machine-extracted', this._machineExtractedHandler);
        this._mediaStashHandler = e => {
            window.__bwPendingMedia = {type: 'media', detail: e && e.detail};
            this.setState({machineBooted: true});
        };
        window.addEventListener('bw-machine-media-load', this._mediaStashHandler);
        this._asmStashHandler = e => {
            window.__bwPendingMedia = {type: 'asm', detail: e && e.detail};
            this.setState({machineBooted: true});
        };
        window.addEventListener('bw-asm-rom-ready', this._asmStashHandler);
        // Code-tab catalog loads name the bench for the chosen device; the
        // board must show THAT wiring and seating, not the authored default
        // and never the runner's inferred fallback.
        this._benchHandler = async (e) => {
            const {benchPath, exampleId} = (e && e.detail) || {};
            if (!benchPath) return;
            try {
                const res = await fetch(`examples/${benchPath}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                // Generated benches carry {parts, nets}; authored circuits
                // carry {parts, wires}. The designer accepts both (its
                // loader feeds nets to syncWithExternalNets directly).
                if (!data || !Array.isArray(data.parts) ||
                    !(Array.isArray(data.wires) || Array.isArray(data.nets))) {
                    throw new Error('not a circuit (no parts with wires or nets)');
                }
                this.setState({circuitData: {...data, fileOnly: true},
                    loadingExample: null, examplesError: null});
            } catch (err) {
                this.setState({examplesError:
                    `bench for "${exampleId}": ${err.message}`});
            }
        };
        window.addEventListener('bw-example-bench', this._benchHandler);
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
        // TitledHOC resets the title to “BrickWright Project” when the
        // load/create state settles. Publish an example's name after that
        // transition, rather than racing it immediately after vm.loadProject.
        if (this.state.pendingExampleTitle && prevProps.isProjectCreating &&
            !this.props.isProjectCreating) {
            this.props.onSetProjectTitle(this.state.pendingExampleTitle);
            this.setState({pendingExampleTitle: null});
        }
        this._measureBox();
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
        // The event above covers a dock CHANGE; this covers every other way the
        // portal turns on — a dock persisted in localStorage, a tab switch, the
        // host appearing after the first render. The host is the stage column
        // while coding, so if it is going to be shown, its content has to exist.
        if (portalNow && !this.state.Designer && !this.loading &&
            !this.state.error && !this.state.reloading) {
            this.load();
        }
        if (this._stageHost) {
            // Never show an EMPTY host. It is an opaque white overlay pinned
            // over the stage column: displayed with nothing portalled into it,
            // it does not read as "still loading", it reads as a blank pane —
            // which is exactly what a fresh editor showed where the Scratch
            // stage should be, and what dock 'right' showed instead of the
            // debugger. _portalRendered is set by render at the points where
            // it actually returns a portal, so this can never drift from it.
            const rightHere = this.props.isVisible &&
                this.state.debugDock === 'right' && this._stageRightRendered;
            this._stageHost.style.display =
                (portalNow && this._portalRendered) || rightHere ? 'block' : 'none';
        }
    }

    /** The tab panel gives height:100% nothing definite to resolve
     *  against, so the designer sat at its 700x500 MINIMUM in any window
     *  ("does not use the screen size", owner, roughly the tenth time).
     *  Measure where the box actually starts and claim the rest of the
     *  viewport explicitly. */
    _measureBox () {
        this._sizeStageHost();
        const el = this._boxRef.current;
        if (!el || this._portalOn) return;
        const r = el.getBoundingClientRect();
        const top = Math.round(r.top);
        const left = Math.round(r.left);
        if (Math.abs((this.state.boxTop ?? -99) - top) > 1 ||
            Math.abs((this.state.boxLeft ?? -99) - left) > 1) {
            this.setState({boxTop: top, boxLeft: left});
        }
    }

    componentWillUnmount () {
        cancelAnimationFrame(this._hostResizeFrame);
        if (this._hostRO) { this._hostRO.disconnect(); this._hostRO = null; }
        window.removeEventListener('resize', this._measureBox);
        window.removeEventListener('bw-project-bundle-collect', this._onBundleCollect);
        window.removeEventListener('bw-project-bundle-loaded', this._onBundleLoaded);
        window.removeEventListener('bw-settings-change', this._settingsHandler);
        window.removeEventListener('bw-start-journey', this._starterJourneyHandler);
        window.removeEventListener('bw-machine-extracted', this._machineExtractedHandler);
        window.removeEventListener('bw-machine-media-load', this._mediaStashHandler);
        window.removeEventListener('bw-asm-rom-ready', this._asmStashHandler);
        window.removeEventListener('bw-example-bench', this._benchHandler);
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

    publishExampleTitle (example) {
        const titles = example && example.title;
        const locale = String(this.props.locale || 'en').slice(0, 2);
        const title = typeof titles === 'string' ? titles :
            (titles && (titles[locale] || titles.en || titles.de)) || example.id;
        if (this.props.isProjectCreating) this.setState({pendingExampleTitle: title});
        else if (this.props.onSetProjectTitle) this.props.onSetProjectTitle(title);
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
    _ensureDebugHost () {
        if (!this._debugHost) {
            const el = document.createElement('div');
            el.dataset.bwDebugHost = 'true';
            el.style.cssText = 'display:flex;flex-direction:column;flex:1 1 auto;' +
                'min-height:0;width:100%;height:100%;overflow:auto;';
            this._debugHost = el;
        }
        return this._debugHost;
    }

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
        this._sizeStageHost();
        // Layout-driven, not render-driven: the wrapper reaches its final
        // (oversized) width after our render pass, so a one-shot measure
        // reads pre-layout numbers and the cap never applies.
        // Per-host wiring: the stage wrapper is REPLACED when a project
        // loads, and an observer bound once watched the dead wrapper while
        // the new one grew to 1992px unobserved.
        if (typeof ResizeObserver !== 'undefined') {
            if (this._hostRO) this._hostRO.disconnect();
            this._hostRO = new ResizeObserver(() => {
                cancelAnimationFrame(this._hostResizeFrame);
                this._hostResizeFrame = requestAnimationFrame(() => this._sizeStageHost());
            });
            this._hostRO.observe(wrap);
        }
        return host;
    }

    /** The stage wrapper can be laid out WIDER than the viewport (it gets
     *  clipped by an ancestor), so an inset:0 host inherits a phantom
     *  ~2x width and everything portalled into it lays out off-screen —
     *  the Code-mode debugger sat 'too much to the right' with its right
     *  half cut (owner report + measured: pane 1992px wide at x=1018 in a
     *  2000px window). Cap the host at what is actually visible. */
    _sizeStageHost () {
        const host = this._stageHost;
        if (!host || !host.parentElement) return;
        const wl = host.parentElement.getBoundingClientRect().left;
        const visible = Math.max(280, Math.round(window.innerWidth - wl - 4));
        const wrapW = Math.round(host.parentElement.getBoundingClientRect().width);
        if (wrapW > visible + 8) {
            host.style.right = 'auto';
            host.style.width = `${visible}px`;
        } else {
            host.style.right = '0';
            host.style.width = '';
        }
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
            // `stc_mcu` is the legacy arbitrary-package surface: shipped
            // circuits legitimately use P5 and package pins absent from the
            // registry's smaller concrete STC model. Returning that model
            // makes bw-circuit-ui treat its terminal list as authoritative and
            // disconnects those wires. Null deliberately selects the generic
            // MCU boundary for this one kind; every functional model below
            // (PS/2, SimpleVGA, memories, modern boards) still passes through.
            const getCircuitDevice = kind => kind === 'stc_mcu' ? null : engine.getDevice(kind);
            // getDevice lets the designer keep registered board kinds
            // (arduino_uno, attiny85, ...) as themselves in the engine
            // netlist instead of collapsing them to 'mcu' — power pins
            // source, inputs read, and stateful PS/2/VGA faces exist. The
            // registry contract returns the model, not only a boolean: the
            // designer also derives authoritative terminal names from it.
            // Keep hasDevice for older vendored UI builds, but getDevice is
            // the current contract. Omitting it collapsed Aurora-65's PS/2
            // and SimpleVGA parts into generic MCUs in the browser while the
            // isolated tests (which injected getDevice) remained green.
            // The machine extractors ride the SAME injection: Build Machine
            // reads eng.extract6502Machine from getEngine(). They were wired
            // into the DRC (setExtractors, top of this file) but not into the
            // engine object, so every deployed Build Machine answered "no
            // retro CPU found" with the W65C02 seated in plain sight.
            setEngine({BoardImpl: engine.BoardImpl, inferNetlist: engine.inferNetlist, checkWiring: engine.checkWiring,
                hasDevice: engine.hasDevice, getDevice: getCircuitDevice, extract6502Machine, extractZ80Machine,
                // The sweep instrument (SweepPanel): Kennlinien + Bode run
                // these on an offline board copy. Same contract as the
                // extractors above — if they are absent, the panel refuses
                // truthfully instead of blaming the circuit.
                runDcSweep: engine.runDcSweep, runAcSweep: engine.runAcSweep, logSpace: engine.logSpace,
                // DRC rule 8 (aggregate current) sums the chip current of every
                // seated part. Without these two it cannot: drc.js's
                // getCurrentRatings() falls back to `getMaxCurrent: () => null`,
                // which marks EVERY kind-rated part an honest unknown, so the
                // sum never reaches the limit and the danger warning cannot
                // fire — silently, because the fallback is a legitimate
                // conservative default and nothing logs. The deployed app has
                // been in that state; only the isolated tests (which inject
                // them) ever summed. Same producer-must-assert-consumer shape
                // as getDevice and the extractors above.
                getMaxCurrent: engine.getMaxCurrent, PORT_LIMITS: engine.PORT_LIMITS});
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
            // it off this tab's visibility made local routing depend on whether
            // the user happened to open the Circuit tab first.)
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
        // Deleting/clearing the circuit must STOP the debugger: a live
        // runner kept driving a board that no longer exists (owner
        // report, 2026-08-17). An empty board with a runner attached =
        // bump the stop token; the panel tears its session down.
        try {
            const nParts = circuit && circuit.parts
                ? (circuit.parts.size ?? circuit.parts.length ?? 0) : 0;
            const hadParts = this.state.circuit && this.state.circuit.parts
                ? (this.state.circuit.parts.size ?? this.state.circuit.parts.length ?? 0) : 0;
            if (nParts === 0 && hadParts > 0) {
                this.setState(st => ({stopToken: (st.stopToken || 0) + 1}));
            }
        } catch { /* never block circuit publication */ }
        this.setState({circuit});
        if (typeof window !== 'undefined') {
            const parts = circuit && circuit.parts ?
                (circuit.parts.size ?? circuit.parts.length ?? 0) : 0;
            const wires = circuit && circuit.wires ?
                (circuit.wires.size ?? circuit.wires.length ?? 0) : 0;
            window.dispatchEvent(new CustomEvent('bw-circuit-ready', {detail: {parts, wires}}));
        }
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
    /**
     * The designer telling us the CIRCUIT changed — a part added or removed, a
     * param edited, a wire made or broken.
     *
     * `bw-circuit-changed` used to be dispatched from `handleDeclarationChange`
     * below, which fires only when the DERIVED PIN DECLARATIONS move. On a bench
     * with no microcontroller they never do — `{"pins":[],"ports":[],"parts":[]}`
     * before and after every edit — so on those benches the event could not fire
     * at all, and three lessons that ask the learner to edit a circuit and watch
     * for a response were left with a checkpoint only their manual button could
     * complete (`starter-circuit-path`, `signals-resonance`,
     * `machines-contention`; `docs/WAVE-OPEN-DEFECTS.md` D6).
     *
     * `onCircuitEdit` is the honest producer and strictly subsumes the old one,
     * since declarations are derived from the same parts and wires. It does not
     * fire on the circuit arriving, only on a change to it.
     */
    handleCircuitEdit (detail) {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('bw-circuit-changed', {detail: detail || {}}));
    }

    handleDeclarationChange (decls) {
        this.setState(s => ({circuitRev: (s.circuitRev || 0) + 1}));
        if (!decls || !decls.device || !Array.isArray(decls.pins)) return;
        const vm = this.props.vm;
        if (!vm) return;
        const current = (vm.runtime && vm.runtime.stc) || {};
        // An EMPTY derived pin list must never erase a loaded program's
        // non-empty pins: a stale bench that derives nothing would wipe
        // runtime.stc and kill the debugger ('No program pins' on a
        // program that has them). Peer-suggested guard (stc-e1).
        if (!decls.pins.length && current.pins && current.pins.length) return;
        // A loaded PROGRAM's declarations are the contract; the designer's
        // wiring-derived pins are heuristics (their polarity walk falls
        // back to the 8051 active-low idiom when nets have not resolved
        // yet). Letting the derivation REPLACE parsed pins flipped the
        // Pico calculator's 17 ACTIVE-HIGH keys to active-low mid-load:
        // the firmware then armed pull-UPS, every key read as pressed
        // forever, and the OLED never drew. Program-declared names win;
        // derived pins only add names the program does not declare.
        const rt = vm.runtime;
        const hasProgram = current.pinsSource === 'program' &&
            Array.isArray(current.pins) && current.pins.length > 0;
        let pins = decls.pins;
        if (hasProgram) {
            const progByName = new Map(current.pins.map(p => [p.name, p]));
            pins = decls.pins.map(dp => progByName.get(dp.name) || dp);
            for (const p of current.pins) {
                if (!pins.some(m => m.name === p.name)) pins.push(p);
            }
        }
        const next = {
            ...current,
            device: decls.device,
            pins,
            pinsSource: hasProgram ? 'program' : 'derived',
            ports: decls.ports || [],
            parts: decls.parts || []
        };
        { const stcTraceObj = next; if (typeof window !== 'undefined') { (window.__bwStcTrace = window.__bwStcTrace || []).push({who: 'declChange', t: Date.now(), b4: JSON.stringify((stcTraceObj && stcTraceObj.pins || []).find(p => p.name === 'b4') || null), dbg: JSON.stringify({hasProgram, src: !!(rt && rt.bwPseudocodeSource), curLen: (current.pins || []).length, curB4: (current.pins || []).find(p => p.name === 'b4') || null})}); } }
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
        if (this.state.examples) return this.state.examples;
        if (this.examplesLoadingPromise) return this.examplesLoadingPromise;
        this.examplesLoadingPromise = (async () => {
            try {
                const res = await fetch('examples/index.json');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.examples || []);
                this.setState({examples: list});
                return list;
            } catch (e) {
                const message = 'The example gallery is not part of this build yet ' +
                    `(examples/index.json: ${e.message}). The examples exist — they ` +
                    'are published by bw-cfront and need vendoring into the app.';
                this.examplesLoadError = message;
                this.setState({examplesError: message});
                // Existing visibility-triggered callers do not await this method.
                // Resolve with null so a missing optional gallery cannot become an
                // unhandled rejection; the starter path turns it into a visible error.
                return null;
            } finally {
                this.examplesLoadingPromise = null;
            }
        })();
        return this.examplesLoadingPromise;
    }

    /** Open one of the three first-run journeys through the normal loaders. */
    async loadStarterJourney (event) {
        const journey = event && event.detail || {};
        const finish = detail => window.dispatchEvent(new CustomEvent('bw-starter-result', {
            detail: {journeyId: journey.id, ...detail}
        }));
        try {
            const list = await this.loadExamples();
            if (!Array.isArray(list)) throw new Error(this.examplesLoadError ||
                'The starter project index could not be loaded.');
            const example = list.find(item => item.id === journey.exampleId);
            if (!example) throw new Error(
                `Starter example "${journey.exampleId}" is missing from examples/index.json.`);
            if (journey.mode !== 'program-only') this.load();
            const result = journey.mode === 'program-only' ?
                await this.loadProgramOnlyStarter(example) :
                await this.loadExample(example, {circuitOnly: journey.mode === 'circuit-only'});
            finish(result && result.ok ? {ok: true} : {
                ok: false,
                cancelled: !!(result && result.cancelled),
                error: result && result.error
            });
        } catch (error) {
            finish({ok: false, error: error.message});
        }
    }

    /**
     * Apply an example's shipped controller layout (files.controller) to
     * the runtime panel — replacing whatever widgets the previous project
     * left, exactly as loading an example replaces its circuit and program.
     * With no controller file the panel is CLEARED for the same reason.
     * Factored out of loadProgramOnlyStarter (2026-08-25) because the
     * general loadExample path never applied layouts at all: a circuit
     * example could not ship pre-defined widgets (owner report — the
     * calculator "SHOULD come with widgets pre-defined").
     */
    async applyControllerLayout (example, opts = {}) {
        const runtime = this.props.vm && this.props.vm.runtime;
        const panel = runtime && runtime.controllerPanel;
        const path = example && example.files && example.files.controller;
        if (!path) {
            if (panel) for (const name of panel.getWidgetNames()) panel.removeWidget(name);
            return false;
        }
        const response = await fetch(`examples/${path}`);
        if (!response.ok) {
            if (opts.required) throw new Error(`controller: HTTP ${response.status}`);
            return false;
        }
        const layout = await response.json();
        if (!panel || !layout || !Array.isArray(layout.widgets)) {
            if (opts.required) throw new Error('controller layout is not available');
            return false;
        }
        for (const name of panel.getWidgetNames()) panel.removeWidget(name);
        for (const widget of layout.widgets) {
            const added = panel.addWidget(widget.name, widget.type,
                widget.config || {}, widget.layout || {});
            if (widget.binding) added.binding = {...widget.binding};
        }
        if (layout.mode) panel.setMode(layout.mode);
        if (runtime.stc) runtime.stc.controller = layout;
        return true;
    }

    /** Program-only starters (currently LEGO) have no fictional circuit to load. */
    async loadProgramOnlyStarter (example) {
        if (typeof confirm === 'function') {
            const message = /^de/i.test(navigator.language) ?
                `„${example.id}" öffnen?\n\nDas ersetzt das aktuelle Projekt. Nicht Gespeichertes geht verloren.` :
                `Open "${example.id}"?\n\nThis replaces the current project. Anything unsaved is lost.`;
            if (!confirm(message)) return {ok: false, cancelled: true};
        }
        this.setState({loadingExample: example.id, examplesError: null});
        try {
            await this.loadExampleProgram(example, null);
            this.setState({loadingExample: null, stc: this.readStc()});
            this.publishExampleTitle(example);
            if (example.files && example.files.controller) {
                await this.applyControllerLayout(example, {required: true});
                window.dispatchEvent(new CustomEvent('bw-settings-change', {
                    detail: {key: 'bw-stage-circuit', value: '1'}
                }));
                window.dispatchEvent(new CustomEvent('bw-settings-change', {
                    detail: {key: 'bw-debug-dock', value: 'controller'}
                }));
            } else {
                // A hardware extension project has no fictional breadboard. Show
                // its Scratch/extension stage while coding instead of an empty circuit.
                window.dispatchEvent(new CustomEvent('bw-settings-change', {
                    detail: {key: 'bw-stage-circuit', value: '0'}
                }));
            }
            return {ok: true};
        } catch (error) {
            this.setState({loadingExample: null, examplesError:
                `Could not fully open "${example.id}": ${error.message}.`});
            return {ok: false, error: error.message};
        }
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
    async loadExampleProgram (ex, pick) {
        const path = ex && ex.files && ex.files.program;
        if (!path) return false;
        const vm = this.props.vm;
        if (!vm || !vm.loadProject) return false;
        const res = await fetch(`examples/${path}`);
        if (!res.ok) throw new Error(`program: HTTP ${res.status}`);
        let source = await res.text();
        // Through the registering door: an example loaded here is parsed here, and a
        // game example's `SHAPE art …` needs this app's artwork already injected.
        const {default: SB3Creator} = await import(
            /* webpackChunkName: "sb3-creator" */ '../../lib/sb3-creator-register-art.js');

        // An example is a curated PAIRING of program and circuit: the
        // circuit.json has the example's own device seated and wired. This
        // used to retarget the program to the CURRENT project's device,
        // which silently broke the pairing — the ATtiny88 pendant retargeted
        // to an STC12 program (or, when retarget refused, loaded as-authored
        // but with the OLD device's engine still selected), and the matrix
        // never lit (owner report, 3791c09). The example's device wins;
        // retargeting stays available afterwards in the Code tab.
        let exDevice = (source.match(/^DEVICE\s+([\w-]+)/im) || [])[1];
        // A picked device retargets the program; a refusal keeps the
        // authored pairing and says why instead of silently substituting.
        const pickNorm = (pick || '').toLowerCase().replace(/_/g, '-');
        if (pickNorm && exDevice &&
            pickNorm !== exDevice.toLowerCase().replace(/_/g, '-') &&
            SB3Creator.retargetPseudocode) {
            const r = SB3Creator.retargetPseudocode(source, pickNorm);
            if (r.ok) {
                source = r.pseudocode;
                exDevice = pickNorm;
            } else {
                throw new Error(`cannot retarget to ${pickNorm}: ` +
                    `${(r.reasons || []).join('; ') || 'unknown reason'}`);
            }
        }

        const creator = new SB3Creator();
        creator.parse(source);
        const blob = await creator.generateSB3();
        await vm.loadProject(await blob.arrayBuffer());
        // Auto-select the first sprite with scripts so the Blocks palette
        // shows meaningful blocks, not "Stage selected — no motion blocks".
        if (vm.runtime && vm.runtime.targets) {
            const best = vm.runtime.targets.find(
                t => !t.isStage && t.blocks.getScripts().length > 0
            ) || vm.runtime.targets.find(t => !t.isStage);
            if (best) {
                vm.setEditingTarget(best.id);
            }
        }
        // scratch-vm's serializer drops unknown top-level keys, so `stc` never
        // survives toJSON. Keep it on the runtime, which lives as long as the
        // project does — the same reason the importer does it.
        const stc = creator.project.stc || null;
        // Pins parsed from a PROGRAM outrank wiring-derived heuristics —
        // the marker travels on the object because the importer consumes
        // (and clears) bwPseudocodeSource before the designer's first
        // declaration pass fires.
        if (stc) stc.pinsSource = 'program';
        { const stcTraceObj = stc; if (typeof window !== 'undefined') { (window.__bwStcTrace = window.__bwStcTrace || []).push({who: 'loadExampleProgram', t: Date.now(), b4: JSON.stringify((stcTraceObj && stcTraceObj.pins || []).find(p => p.name === 'b4') || null)}); } }
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
                /^stm32/.test(id) ? 'arm' :
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
            pins: !!stcDrives(stc),
            hasPart: /^PART\s+/im.test(source),
            device: (exDevice || '').toLowerCase(),
        };
    }

    async loadExample (ex, opts) {
        // The Examples browser's device chip arrives here as opts.device
        // (with opts.bench naming the generated per-device circuit). It
        // used to be DROPPED: clicking Pico on any example loaded the
        // authored device anyway (owner report, 2026-08-17). The authored
        // circuit still outranks a generated bench for the example's own
        // device — the bench is a generic approximation.
        const pick = normalizeDeviceId(opts && opts.device) || null;
        const benchOverride = (opts && opts.bench) || null;
        const path = ex && ex.files && ex.files.circuit;
        if (!path) {
            const error = `"${(ex && ex.id) || 'that example'}" lists no circuit file, so there is ` +
                'nothing to place on the board.';
            this.setState({examplesError: error});
            return {ok: false, error};
        }
        // An example with a program replaces the project, which undo cannot
        // recover — so ask, once, and say what is at stake. A circuit-only
        // example touches nothing but the board and needs no permission.
        // Whether the example ships a program file. The kind field is a
        // categorisation tag, not a file-presence gate: an example can be
        // kind:'circuit' (it is ABOUT a circuit) and still declare pins
        // that need loading. The gate must be the file, not the tag.
        const hasProgram = !(opts && opts.circuitOnly) && !!(ex.files && ex.files.program);
        if (hasProgram && typeof confirm === 'function') {
            const msg = /^de/i.test(navigator.language)
                ? `„${ex.id}" öffnen?\n\nDas ersetzt das aktuelle Projekt — seine Blöcke, Pins und sein Board. Nicht Gespeichertes geht verloren.`
                : `Open "${ex.id}"?\n\nThis replaces the current project — its blocks, its pins and its board. Anything unsaved is lost.`;
            const ok = confirm(msg);
            if (!ok) return {ok: false, cancelled: true};
        }
        this.setState({loadingExample: ex.id, examplesError: null});
        try {
            // Which circuit: the authored one for the authored device, the
            // generated bench for a genuinely different picked device.
            let circuitPath = path;
            if (pick && hasProgram) {
                const pres = await fetch(`examples/${ex.files.program}`);
                if (!pres.ok) throw new Error(`program: HTTP ${pres.status}`);
                const psrc = await pres.text();
                const exDev = (psrc.match(/^DEVICE\s+([\w-]+)/im) || [])[1] || '';
                const resolved = resolveExampleBench(ex, pick, exDev, benchOverride);
                if (resolved.error) throw new Error(resolved.error);
                circuitPath = resolved.path || path;
            }
            const res = await fetch(`examples/${circuitPath}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data || !Array.isArray(data.parts) ||
                !(Array.isArray(data.wires) || Array.isArray(data.nets))) {
                throw new Error('not a circuit (no parts with wires or nets)');
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
                    prog = await this.loadExampleProgram(ex, pick);
                } catch (e) {
                    programError = e.message;
                }
            }
            // The example's faceplate, if it ships one — after the program,
            // whose vm.loadProject would have wiped a panel set earlier.
            // Non-fatal: a circuit without its widgets is still a circuit.
            // When a layout DID apply, surface it: dock the right pane on
            // the controller, else the shipped faceplate sits invisible
            // behind a toggle nobody knows to press.
            try {
                const applied = await this.applyControllerLayout(ex);
                if (applied) {
                    // BOTH events: the dock chooses WHAT the right column
                    // shows; the pane key makes the column exist. This tab
                    // itself nones the stage wrapper while rightPaneHidden
                    // is set, so a dock switch alone mounted 19 widgets
                    // into display:none (measured: every rect 0×0 while
                    // the OLED canvas painted invisibly).
                    window.dispatchEvent(new CustomEvent('bw-settings-change', {
                        detail: {key: 'bw-right-pane-hidden', value: '0'}
                    }));
                    window.dispatchEvent(new CustomEvent('bw-settings-change', {
                        detail: {key: 'bw-debug-dock', value: 'controller'}
                    }));
                }
            } catch (e) {
                console.warn('[brickwright] example controller layout failed', e);
            }
            // The example's own ROM, if it ships one. Three machine benches
            // used to extract a machine cleanly and then boot with ZERO ROM
            // bytes — the bus extract was never the problem, there was simply
            // no image (D7). Now that sb3-creator builds and declares them,
            // the bench that HAS an image boots its own program instead of
            // asking the learner to pick a generic preset from the loader.
            //
            // Non-fatal on purpose, like the faceplate above: a machine with
            // no image is still the machine the example wires, and the
            // preset loader remains available. The event is the SAME one
            // CircuitDesigner's preset buttons dispatch, so it takes the
            // established path — this tab stashes it to window.__bwPendingMedia
            // and debug-panel applies it when the panel mounts, which is what
            // makes an example loaded BEFORE the debugger exists still boot.
            try {
                const romPath = ex.files && ex.files.rom;
                if (romPath) {
                    // The machine kind comes off the parts actually on the
                    // board, not off the example id or its category — the
                    // same test CircuitDesigner uses to decide it has a
                    // retro CPU at all.
                    const cpu = data.parts.find(pt => pt.kind === 'w65c02' || pt.kind === 'z80');
                    if (cpu) {
                        const rres = await fetch(`examples/${romPath}`);
                        if (!rres.ok) throw new Error(`HTTP ${rres.status}`);
                        const bytes = new Uint8Array(await rres.arrayBuffer());
                        window.dispatchEvent(new CustomEvent('bw-machine-media-load', {
                            detail: {
                                slotId: 'rom',
                                bytes,
                                kind: cpu.kind === 'z80' ? 'z80' : 'eater6502',
                                profile: null,
                                name: romPath.split('/').pop(),
                            },
                        }));
                    }
                }
            } catch (e) {
                console.warn('[brickwright] example ROM load failed', e);
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
            // A loaded example is a named project, not the generic project
            // created by the SB3 converter. Keep the normal title reducer as
            // the single source used by the menu bar, save dialog and window.
            this.publishExampleTitle(ex);
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
            return programError ? {ok: false, error: programError} : {ok: true};
        } catch (e) {
            this.setState({loadingExample: null, examplesError:
                `Could not open "${ex.id}": ${e.message}. The board is unchanged.`});
            return {ok: false, error: e.message};
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
        if (typeof window !== 'undefined' && phase) {
            window.dispatchEvent(new CustomEvent('bw-debug-phase', {detail: {phase}}));
        }
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
        // CONTENT comparison, not identity: `enriched` is a fresh array on
        // every runner emit — emits come once per rAF pump frame — so the
        // old `enriched !== prev.tasks` guard was always true and this
        // setState re-rendered the entire tab subtree at 60 Hz throughout
        // a run (the dominant React cost in the run-mode CPU profile,
        // after the canvas layers were memoized). The ms tick alone must
        // not force a frame either: a live counter is readable at 4 Hz.
        const tasksStamp = enriched
            ? enriched.map(t => `${t.task}/${t.state}/${t.blockId || ''}`).join('|')
            : null;
        const msMoved = (typeof bwMs === 'number' && typeof prev.bwMs === 'number')
            ? Math.abs(bwMs - prev.bwMs) >= 250
            : bwMs !== prev.bwMs;
        // Serial progress must always reach the screen: the first stamp
        // guard ignored it and the debugger's console froze mid-banner
        // (the browser gate caught it — BBC BASIC's prompt never showed).
        // Complete lines are stamped; a PARTIAL line (a prompt with no
        // newline) is invisible to the snapshot, so a 10 Hz floor keeps
        // repainting while a session is live — still one sixth of the
        // per-frame setState this guard exists to stop.
        const so = ui && ui.session && ui.session.serialOutput;
        const serialStamp = so ? `${so.length}:${(so[so.length - 1] || '').length}` : '';
        const now = Date.now();
        const floorDue = (now - (this._debugStateAt || 0)) >= 100;
        if (board !== this.state.board || halted !== prev.halted ||
            haltReason !== prev.haltReason || tasksStamp !== (prev._tasksStamp ?? null) ||
            serialStamp !== (prev._serialStamp ?? '') ||
            msMoved || caps !== prev.capabilities || floorDue) {
            this._debugStateAt = now;
            this.setState({
                board,
                debugState: {
                    halted,
                    skewNs: why ? why.skewNs : 0n,
                    haltReason,
                    bwMs,
                    tasks: enriched,
                    _tasksStamp: tasksStamp,
                    _serialStamp: serialStamp,
                    capabilities: caps,
                    // D29. The designer's DebugStatus renders its watchpoint
                    // field only when `onAddWatchpoint` is a function, and it
                    // is handed `debugState.addWatchpoint` — which nothing here
                    // ever set, so the field could not appear no matter what
                    // the emulator supported. The defect ledger recorded this
                    // as a missing WASM export; the export was there all along
                    // (instantiated and checked), and the consumer was the gap.
                    // Producer-must-assert-consumer, from the other side.
                    //
                    // The space is iram because that is where the C target's
                    // scheduler variables live and where a learner's `counter`
                    // is; the drawer offers the other spaces by name.
                    addWatchpoint: addr => {
                        const r = runner.toggleWatchpoint
                            ? runner.toggleWatchpoint('iram', addr) : null;
                        // Surface a refusal rather than dropping it: the whole
                        // point of this feature is that an armed watchpoint is
                        // really armed.
                        if (r && r.refused && typeof window !== 'undefined') {
                            window.alert(r.refused);
                        }
                        return r;
                    },
                    // Step-over and step-out were the same shape of gap: the
                    // buttons render from `capabilities` and called undefined.
                    stepOver: () => runner.stepOver(),
                    stepOut: () => runner.stepOut()
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
        // Claim the real viewport once we know where the box starts —
        // see _measureBox. The portal path keeps the stage host's sizing.
        if (!this._portalOn && this.state.boxTop != null) {
            // HEIGHT only. Width claims override the GUI's right-pane
            // splitter and, in the Code-mode portal, laid the debugger out
            // for a phantom 1992px column (owner reports; the first attempt
            // at this fix was reverted by a concurrent agent's reset --hard
            // between edit and commit — verify the COMMITTED bytes).
            box.height = `calc(100vh - ${this.state.boxTop + 4}px)`;
        }
        // Nothing below returns a portal until it says so. componentDidUpdate
        // shows the stage host only when this is true, so the three early
        // returns here (reloading / error / designer not loaded) leave the
        // Scratch stage visible instead of covering it with a white box.
        this._portalRendered = false;
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
        // Debugger-only right pane: docks 'solo' AND 'right' give the
        // DebugPanel the stage column while coding — 'right' used to fall
        // through to the FULL DESIGNER portal squeezed into ~350px: the
        // canvas swallowed the width, the instruments column was clipped
        // off, and the owner met an "unusable debugger" whose clicks landed
        // on breadboard SVG (report, 2026-08-17). While coding, a debugger
        // dock means the DEBUGGER. It deliberately does not wait for the
        // Designer chunk (the panel has its own Suspense), and it only
        // applies while portalled: on the dedicated Circuit tab, 'right'
        // keeps the designer beside the panel (below) and 'solo' falls back
        // to the instruments-column dock, so the designer stays reachable.
        if ((this.state.debugDock === 'solo' || this.state.debugDock === 'right') && this._stagePortalOn()) {
            this._portalOn = true;
            const solo = (
                // paddingTop clears the stage-header row: the panel (and the
                // no-code warning) rendered flush against the tab strip and
                // read as misplaced (owner report, 2026-08-17 — and 7 hours
                // before that).
                <div style={{...box, overflow: 'auto', paddingTop: 48}} data-debugger-solo-pane>
                    {stcDrives(stc) || this.state.machineBooted ? <HostMount host={this._ensureDebugHost()} /> : (
                        <div style={{color: '#64748b', fontSize: 12.5, padding: 8, marginTop: 6}} data-no-code-indicator>
                            {(SOLO_L10N[String(this.props.locale || 'en').slice(0, 2)]
                                || SOLO_L10N.en).noCode}
                        </div>
                    )}
                </div>
            );
            this._portalRendered = true;
            return [
                ReactDOM.createPortal(solo, this._stageHost),
                ReactDOM.createPortal(this.renderDebugPanel(), this._ensureDebugHost())
            ];
        }
        if (!Designer) {
            return <div style={{...box, color: '#64748b'}}>{'Loading the circuit designer…'}</div>;
        }
        this._portalOn = this._stagePortalOn();
        // On the dedicated Circuit tab 'solo' behaves as 'top': the designer
        // with the compact debugger in its Instruments column.
        const dock = this.state.debugDock === 'solo' ? 'top' : this.state.debugDock;
        const content = (
            <div ref={this._boxRef} style={box}>
                {/* The standalone-circuit invitation and the debugger hint used to render here
                    as two dismissible orange ▲ banners. Removed at the owner's request: they
                    pushed the board down and duplicated the top-bar Warnings selector, which
                    (with its count) is now the single home for anything the user needs flagged.
                    The guidance they carried lives in the Examples/docs, not a persistent banner. */}
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
                    onCircuitReady={c => { window.__circuit = c; if (this.props.vm && this.props.vm.runtime) this.props.vm.runtime.circuitModel = c; this.handleCircuitReady(c); }}
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
                            // The Widgets tab resolves this board through an
                            // epoch — announce it, since the circuit-ready
                            // event fires before the board exists.
                            window.dispatchEvent(new CustomEvent('bw-board-ready'));
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
                        onCircuitEdit={this.handleCircuitEdit}
                        onDeclarationChange={this.handleDeclarationChange}
                        panelNav={this.renderPanelStrip()}
                    embedded={this._portalOn}
                    // The debugger belongs to the designer's Instruments
                    // column in both the Code Blocks portal and the dedicated
                    // Circuit tab. The old visibility guard made “switch to
                    // debugger” a no-op whenever Circuit itself was active.
                    debuggerOn={dock === 'top'}
                    debuggerPanel={dock === 'top' ? <HostMount host={this._ensureDebugHost()} /> : null}
                    // The >> / << move buttons in the Designer's instruments
                    // debugger header (cui 526dc9b) are gated on this
                    // callback — without it they never rendered, and the
                    // owner's 'move the debugger to the right pane' spec
                    // silently had no UI. Persist + broadcast so the
                    // stage-header view buttons stay in sync.
                    debugDock={dock}
                    onDebugDockChange={(d) => {
                        try { localStorage.setItem('bw-debug-dock', d); } catch { /* private mode */ }
                        this.setDock(d);
                        window.dispatchEvent(new CustomEvent('bw-settings-change',
                            {detail: {key: 'bw-debug-dock', value: d}}));
                    }}
                    // Remount-proof "a machine was built here": the designer's
                    // own machineResult dies with it on a tab switch, and the
                    // debugger slot must survive the Code-tab round trip the
                    // ASM workflow requires. This state lives up here and does.
                    benchOpen={this.state.machineBooted}
                        runToken={this.state.runToken}
                        stopToken={this.state.stopToken}
                        onSimulationStart={this.handleProjectStart}
                    />
                </div>
                </div>
{/* dock 'right' renders in the ACTUAL right pane (the stage
                    column, right of the GUI splitter) via the stage-host portal
                    below — the inline column that sat BETWEEN the instruments
                    and the splitter is gone (owner screenshot, 2026-08-17). */}
                </div>
            </div>
        );
        const panelPortal = ReactDOM.createPortal(
            this.renderDebugPanel(), this._ensureDebugHost());
        if (this._portalOn) {
            this._portalRendered = true;
            return [ReactDOM.createPortal(content, this._stageHost), panelPortal];
        }
        // Dedicated Circuit tab, dock 'right': the panel lives in the REAL
        // right pane — the stage column beyond the movable splitter.
        this._stageRightRendered = false;
        let stagePane = null;
        if (this.state.debugDock === 'right') {
            const host = this._ensureStageHost();
            if (host) {
                this._stageRightRendered = true;
                stagePane = ReactDOM.createPortal(
                    <div style={{height: '100%', width: '100%', boxSizing: 'border-box',
                        overflow: 'auto', padding: 8, paddingTop: 48,
                        display: 'flex', flexDirection: 'column'}} data-debugger-solo-pane>
                        {stcDrives(stc) || this.state.machineBooted
                            ? <HostMount host={this._ensureDebugHost()} />
                            : (
                                <div style={{color: '#64748b', fontSize: 12.5, padding: 8, marginTop: 6}} data-no-code-indicator>
                                    {(SOLO_L10N[String(this.props.locale || 'en').slice(0, 2)]
                                        || SOLO_L10N.en).noCode}
                                </div>
                            )}
                    </div>, host);
            }
        }
        return [content, stagePane, panelPortal];
    }

    /** One DebugPanel instance, rendered through ONE portal into ONE
     *  persistent DOM node (_ensureDebugHost). Docking moves the NODE
     *  between slots (HostMount adopts it), so the panel never remounts
     *  and a running session SURVIVES every dock change — including
     *  '>>' to the right pane and back (owner requirement, 2026-08-17). */
    renderDebugPanel () {
        const {stc} = this.state;
        return (
            <PanelBoundary>
                <React.Suspense fallback={null}>
                    <DebugPanel
                        clockHz={(stc && Number(stc.clock)) || 11059200}
                        runToken={this.state.runToken}
                        stopToken={this.state.stopToken}
                        onRunnerChange={this.handleRunnerChange}
                    />
                </React.Suspense>
            </PanelBoundary>
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
                            // The Designer button is a no-op when the designer is already the
                            // current panel — this strip only exists inside the Circuit tab, so
                            // "select Designer" from here is redundant. Grey it and swallow the
                            // click so it reads as the current view, not a live selector.
                            if (panel === id && id === 'designer') return;
                            this.setState({panel: id});
                            if (id === 'examples') this.loadExamples();
                        }}
                        title={tabTitles[id]}
                        aria-label={tabTitles[id]}
                        aria-pressed={panel === id}
                        aria-disabled={panel === id && id === 'designer'}
                        style={{
                            width: 34, minWidth: 34, height: 34, padding: 0, border: 'none', borderRadius: 4,
                            cursor: panel === id && id === 'designer' ? 'default' : 'pointer',
                            fontSize: 17, lineHeight: 1, position: 'relative', fontWeight: 600,
                            background: panel === id ? (id === 'designer' ? '#e2e8f0' : '#1d4ed8') : 'transparent',
                            boxShadow: panel === id && id !== 'designer' ? '0 1px 2px rgba(15,23,42,.25)' : 'none',
                            color: panel === id ? (id === 'designer' ? '#94a3b8' : '#fff') : '#64748b'
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
    isProjectCreating: PropTypes.bool,
    isVisible: PropTypes.bool,
    onSetProjectTitle: PropTypes.func,
    vm: PropTypes.shape({toJSON: PropTypes.func}).isRequired
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale,
    isProjectCreating: getIsAnyCreatingNewState(state.scratchGui.projectState.loadingState),
    isVisible: state.scratchGui.editorTab.activeTabIndex === 4
}), dispatch => ({
    onSetProjectTitle: title => dispatch(setProjectTitle(title))
}))(CircuitTab);
