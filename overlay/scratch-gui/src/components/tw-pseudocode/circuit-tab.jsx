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
        this.state = {Designer: null, error: null, stc: null, board: null, debugState: null};
        this.handleRunnerChange = this.handleRunnerChange.bind(this);
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
            this.setState({Designer: ui.CircuitDesigner});
        } catch (e) {
            this.setState({error: e.message});
        }
        this.loading = false;
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
        // bwMs: the runner snapshot does not expose target.bwMs() — it requires
        // the coordinator to add it to debug-runner.js's snapshot(). Until then,
        // DebugStatus shows "—" for the scheduler ms counter. Tracked in BLOCKED.md.
        const bwMs = undefined;
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
        const {Designer, error, stc} = this.state;
        const box = {height: '100%', overflow: 'auto', padding: 12, boxSizing: 'border-box'};
        if (error) {
            return (
                <div style={{...box, color: '#b91c1c'}}>
                    {`The circuit designer failed to load: ${error}`}
                </div>
            );
        }
        if (!Designer) {
            return <div style={{...box, color: '#64748b'}}>{'Loading the circuit designer…'}</div>;
        }
        return (
            <div style={box}>
                {stc && stc.pins && stc.pins.length ? null : (
                    <div style={{marginBottom: 10, padding: '8px 10px', borderRadius: 6,
                        background: '#fefce8', border: '1px solid #fde68a', fontSize: 13, color: '#713f12'}}>
                        {'This project declares no pins, so the board starts empty. ' +
                         'Declare them in the Code tab — e.g. PIN led1 IS P1.0 OUTPUT ACTIVE LOW — ' +
                         'and the designer will suggest the matching parts.'}
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
                <Designer
                    stc={stc}
                    board={this.state.board || undefined}
                    debugState={this.state.debugState || undefined}
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
                        // TODO: write decls back to project.stc so the block palette updates.
                        // Currently project.stc is read-only from the VM — writing it back
                        // requires either a vm.setStc() API or round-tripping through loadProject.
                        // For now, declarations are derived but not persisted.
                        // The bw-blocks agent may provide the integration path.
                    }}
                />
            </div>
        );
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
