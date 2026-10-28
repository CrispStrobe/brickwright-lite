// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import SpikeArenaPane from './spike-arena-pane.jsx';
import {sharedSpikeHubState} from '../../lib/virtual-hub/shared-spike-hub.js';
import {ROBOT_LAB_EVENTS, robotLabActive} from '../../lib/robot-lab-events.js';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
const TEXT = {
    en: {
        hint: 'Virtual SPIKE Prime · Run Scratch blocks, DEVICE SPIKE programs or imported LEGO SPIKE 3 programs with Start in the arena.',
        openLab: 'Open in Robot Lab', openLabHelp: 'Build and simulate a LEGO Technic robot in 3D, in the Robot Lab tab',
        labActive: 'The Robot Lab tab is driving the virtual hub now. One hub, one world: the arena waits until the Robot Lab lets go.',
        showLab: 'Show the Robot Lab', useArena: 'Use the arena here'
    },
    de: {
        hint: 'Virtueller SPIKE Prime · Scratch-Blöcke, DEVICE-SPIKE-Programme oder importierte LEGO-SPIKE-3-Programme mit Start in der Arena ausführen.',
        openLab: 'Im Roboter-Labor öffnen', openLabHelp: 'Einen LEGO-Technic-Roboter in 3D bauen und simulieren, im Tab Roboter-Labor',
        labActive: 'Der Tab Roboter-Labor steuert gerade den virtuellen Hub. Ein Hub, eine Welt: Die Arena wartet, bis das Roboter-Labor ihn freigibt.',
        showLab: 'Roboter-Labor zeigen', useArena: 'Arena hier benutzen'
    }
};
/**
 * The SPIKE arena in the right pane. The Robot Lab used to be its second sub-tab; it is
 * its own editor tab now (robot-lab-tab.jsx), and the two share one virtual hub
 * (lib/virtual-hub/shared-spike-hub.js). They never both drive it: while the Robot Lab
 * holds a session the arena is not mounted (its program stops with it, docs/SPIKE-ARENA.md
 * "One clock") and this pane says why, with a way to either side.
 */
class SpikeSimulatorPane extends React.Component {
    constructor (props) {
        super(props);
        this.hubState = props.hubState || sharedSpikeHubState();
        this.arena = React.createRef();
        this.state = {labActive: robotLabActive()};
        this.onLabOwner = this.onLabOwner.bind(this);
    }
    componentDidMount () {
        window.addEventListener(ROBOT_LAB_EVENTS.owner, this.onLabOwner);
    }
    componentWillUnmount () {
        window.removeEventListener(ROBOT_LAB_EVENTS.owner, this.onLabOwner);
        this.arena.current?.stopProgram();
        this.hubState.backend.cancel();
    }
    onLabOwner (event) {
        const active = Boolean(event && event.detail && event.detail.active);
        if (active === this.state.labActive) return;
        if (active) {
            this.arena.current?.stopProgram();
            this.hubState.stopAll?.();
        }
        this.setState({labActive: active});
    }
    openLab () {
        this.arena.current?.stopProgram();
        window.dispatchEvent(new CustomEvent(ROBOT_LAB_EVENTS.open));
    }
    render () {
        const T = TEXT[pickLocale(this.props.locale || browserLocale(), TEXT)];
        const button = {padding: '4px 10px', border: '1px solid #4338ca', borderRadius: 6, background: '#eef2ff', color: '#312e81', cursor: 'pointer', fontWeight: 600};
        return (
            <div data-testid="bw-spike-simulator" data-backend="native" data-robot-lab={this.state.labActive ? 'active' : 'idle'}
                style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#f8fafc'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: 10, flexWrap: 'wrap'}}>
                    <div role="status" data-testid="bw-spike-backend-hint" style={{fontSize: 12, flex: '1 1 220px', minWidth: 0}}>{T.hint}</div>
                    {!this.state.labActive && (
                        <button type="button" data-testid="bw-spike-simulator-open-robot-lab" title={T.openLabHelp}
                            onClick={() => this.openLab()} style={button}>{T.openLab}</button>
                    )}
                </div>
                <div style={{flex: '1 0 400px', minHeight: 300, background: '#fff'}}>
                    {this.state.labActive ? (
                        <div data-testid="bw-spike-simulator-lab-active" role="status"
                            style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: 16, fontSize: 13, color: '#334155'}}>
                            <span>{T.labActive}</span>
                            <span style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                                <button type="button" data-testid="bw-spike-simulator-show-robot-lab" style={button}
                                    onClick={() => window.dispatchEvent(new CustomEvent(ROBOT_LAB_EVENTS.open))}>{T.showLab}</button>
                                <button type="button" data-testid="bw-spike-simulator-use-arena" style={{...button, background: '#fff'}}
                                    onClick={() => window.dispatchEvent(new CustomEvent(ROBOT_LAB_EVENTS.release))}>{T.useArena}</button>
                            </span>
                        </div>
                    ) : (
                        <SpikeArenaPane ref={this.arena} vm={this.props.vm} locale={this.props.locale} hubState={this.hubState} />
                    )}
                </div>
            </div>
        );
    }
}
export default SpikeSimulatorPane;
