import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

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
        this.state = {Designer: null, error: null, stc: null};
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

    /** The project's own hardware declarations — device, clock, and the pin table.
     *  vm.runtime.stc is where they live while a project is loaded (set by the
     *  pseudocode importer on compile). toJSON read is a fallback. */
    readStc () {
        const vm = this.props.vm;
        if (!vm) return null;
        if (vm.runtime && vm.runtime.stc) return vm.runtime.stc;
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
                <Designer
                    stc={stc}
                    onBoardReady={(board) => {
                        // Hand the Board to the circuit extension so meter blocks work.
                        // The extension reads this.runtime.circuitBoard as a fallback
                        // when this._board is null (setBoard not yet called).
                        const vm = this.props.vm;
                        if (!vm || !vm.runtime) return;
                        vm.runtime.circuitBoard = board;
                    }}
                    onDeclarationChange={(decls) => {
                        // Write declarations back to vm.runtime.stc — the same place
                        // the pseudocode importer stores them on compile. The block
                        // palette reads from here for its dropdown menus.
                        const vm = this.props.vm;
                        if (vm && vm.runtime) {
                            const existing = vm.runtime.stc || {};
                            vm.runtime.stc = {
                                ...existing,
                                pins: decls.pins || existing.pins || [],
                                ports: decls.ports || existing.ports || [],
                                parts: decls.parts || existing.parts || [],
                            };
                        }
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
