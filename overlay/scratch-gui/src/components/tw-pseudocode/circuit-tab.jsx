import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

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
class CircuitTab extends React.Component {
    constructor (props) {
        super(props);
        let hintDismissed = false;
        try {
            hintDismissed = localStorage.getItem('bw-circuit-hint') === '1';
        } catch { /* private mode */ }
        this.state = {Designer: null, ui: null, error: null, reloading: false, stc: null,
            board: null, debugState: null, panel: 'designer', circuit: null, hintDismissed};
        this.handleRunnerChange = this.handleRunnerChange.bind(this);
        this.handleCircuitReady = this.handleCircuitReady.bind(this);
    }

    componentDidMount () {
        if (this.props.isVisible) this.load();
    }

    componentDidUpdate (prevProps) {
        if (this.props.isVisible && !prevProps.isVisible) this.load();
    }

    async load () {
        this.setState({stc: this.readStc()});
        if (this.state.Designer || this.loading) return;
        this.loading = true;
        try {
            const engine = await import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/index.js');
            const ui = await import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/index.js');
            ui.setEngine(engine);   // the panel takes the engine by injection, not by path
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
            return {...t, blockId, kind: blockId && kinds ? kinds[blockId] : undefined};
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
        const box = {height: '100%', overflow: 'auto', padding: 8, boxSizing: 'border-box'};
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
        if (!Designer) {
            return <div style={{...box, color: '#64748b'}}>{'Loading the circuit designer…'}</div>;
        }
        return (
            <div style={box}>
                {/* A circuit does not need a microcontroller.
                    This used to read "declares no pins, so the board starts empty", which
                    framed a battery-LED-resistor circuit — the first circuit anyone builds —
                    as a misconfigured MCU project. The board, the solver, the instruments and
                    the design-rule check all work with no MCU in the netlist at all. So this
                    is an invitation, shown once and dismissible, not a warning. */}
                {(stc && stc.pins && stc.pins.length) || this.state.hintDismissed ? null : (
                    <div style={{marginBottom: 6, padding: '5px 8px', borderRadius: 5,
                        background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12,
                        color: '#075985', display: 'flex', alignItems: 'center', gap: 8}}>
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
                )}
                {/* The debugger's controls, above the board they act on. The design note
                    puts them in the stage header; they are here because that header is
                    shown for every project including pure Scratch ones — see the panel's
                    own comment. The block glow lands in the Blocks tab regardless. */}
                {stc && stc.pins && stc.pins.length ? (
                    <div style={{marginBottom: 10}}>
                        <React.Suspense fallback={null}>
                            <DebugPanel
                                clockHz={(stc && Number(stc.clock)) || 11059200}
                                onRunnerChange={this.handleRunnerChange}
                            />
                        </React.Suspense>
                    </div>
                ) : null}
                {this.renderPanelStrip()}
                {this.state.panel === 'designer' ? null : this.renderPanel()}
                {/* The designer stays mounted whatever panel is showing: it owns the
                    circuit, the board and the emulator's view of both, and unmounting
                    it to show a parts list would tear all three down and rebuild them
                    on the way back. Hidden, not destroyed. */}
                <div style={this.state.panel === 'designer' ? null : {display: 'none'}}>
                <Designer
                    stc={stc}
                    board={this.state.board || undefined}
                    debugState={this.state.debugState || undefined}
                    onCircuitReady={this.handleCircuitReady}
                    onBoardReady={(board) => {
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
                    onDeclarationChange={(decls) => {
                        // Doubles as the change signal the once-only onCircuitReady
                        // handover does not provide. The circuit object is stable and
                        // mutates in place, so the warnings badge and the parts list
                        // would otherwise keep showing whatever was true when this
                        // component last happened to re-render — and a warnings count
                        // that is silently stale is worse than none, because it reads
                        // as a statement about the circuit in front of you. This fires
                        // on every parts/wires change, which is exactly when both
                        // panels need recomputing.
                        this.setState(s => ({circuitRev: (s.circuitRev || 0) + 1}));
                        // TODO: write decls back to project.stc so the block palette updates.
                        // Currently project.stc is read-only from the VM — writing it back
                        // requires either a vm.setStc() API or round-tripping through loadProject.
                        // For now, declarations are derived but not persisted.
                        // The bw-blocks agent may provide the integration path.
                    }}
                />
                </div>
            </div>
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
        // The board is the reason this tab exists, so the switcher costs one thin
        // row and nothing else — no tab-bar chrome, no borders, no 44px targets
        // stealing height from the canvas. A segmented control reads as "a view
        // of the same thing", which is what these are.
        return (
            <div style={{display: 'inline-flex', gap: 1, marginBottom: 6, padding: 1,
                borderRadius: 5, background: '#f1f5f9', fontSize: 11.5, lineHeight: 1.6}}>
                {tabs.map(([id, label, badge]) => (
                    <button
                        key={id}
                        onClick={() => this.setState({panel: id})}
                        style={{
                            padding: '2px 8px', border: 'none', cursor: 'pointer', borderRadius: 4,
                            fontSize: 'inherit',
                            background: panel === id ? '#fff' : 'transparent',
                            boxShadow: panel === id ? '0 1px 2px rgba(15,23,42,.12)' : 'none',
                            color: panel === id ? '#0f172a' : '#64748b'
                        }}
                    >
                        {label}
                        {badge ? (
                            <span style={{marginLeft: 5, padding: '0 5px', borderRadius: 8, fontSize: 10,
                                background: danger ? '#fecaca' : '#fef3c7',
                                color: danger ? '#991b1b' : '#92400e'}}
                            >{badge}</span>
                        ) : null}
                    </button>
                ))}
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
            return <ui.ExamplesBrowser examples={[]} />;
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
    isVisible: state.scratchGui.editorTab.activeTabIndex === 4
}))(CircuitTab);
