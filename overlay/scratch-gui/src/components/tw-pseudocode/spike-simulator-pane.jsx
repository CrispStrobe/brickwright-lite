// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import SpikeArenaPane from './spike-arena-pane.jsx';
import SimLabPane from './sim-lab-pane.jsx';
import VirtualSpikeHubState from '../../lib/virtual-hub/spike-hub-state.js';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
const TABS = {
    en: {arena: 'Arena', simLab: 'Sim Lab (beta)'},
    de: {arena: 'Arena', simLab: 'Sim-Labor (Beta)'}
};
const TEXT = {
    en: 'Virtual SPIKE Prime · Run Scratch blocks, DEVICE SPIKE programs or imported LEGO SPIKE 3 programs with Start in the arena.',
    de: 'Virtueller SPIKE Prime · Scratch-Blöcke, DEVICE-SPIKE-Programme oder importierte LEGO-SPIKE-3-Programme mit Start in der Arena ausführen.'
};
class SpikeSimulatorPane extends React.Component {
    constructor (props) {
        super(props);
        this.hubState = props.hubState || window.__brickwrightVirtualSpike?.hubState || new VirtualSpikeHubState();
        this.arena = React.createRef();
        // The arena and the Sim Lab never run together: each owns the hub's motor
        // clock while it is mounted (docs/SPIKE-ARENA.md, "One clock").
        this.state = {tab: 'arena'};
    }
    setTab (tab) {
        if (tab === this.state.tab) return;
        this.arena.current?.stopProgram();
        this.hubState.stopAll?.();
        this.setState({tab});
    }
    componentWillUnmount () {
        this.arena.current?.stopProgram();
        this.hubState.backend.cancel();
    }
    render () {
        const tabs = TABS[pickLocale(this.props.locale || browserLocale(), TABS)];
        return (
            <div data-testid="bw-spike-simulator" data-backend="native"
                style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#f8fafc'}}>
                <div role="status" data-testid="bw-spike-backend-hint" style={{padding: 10, fontSize: 12}}>
                    {TEXT[pickLocale(this.props.locale || browserLocale(), TEXT)]}
                </div>
                <div role="tablist" style={{display: 'flex', gap: 4, padding: '0 10px'}}>
                    {['arena', 'simLab'].map(tab => (
                        <button key={tab} type="button" role="tab" aria-selected={this.state.tab === tab}
                            data-testid={`bw-spike-simulator-tab-${tab}`} onClick={() => this.setTab(tab)}
                            style={{padding: '4px 10px', border: '1px solid #cbd5e1', borderBottom: 'none', borderRadius: '6px 6px 0 0',
                                background: this.state.tab === tab ? '#fff' : '#e2e8f0', fontWeight: this.state.tab === tab ? 600 : 400, cursor: 'pointer'}}>
                            {tabs[tab]}
                        </button>
                    ))}
                </div>
                <div style={{flex: '1 0 400px', minHeight: 300, background: '#fff'}}>
                    {this.state.tab === 'arena' ?
                        <SpikeArenaPane ref={this.arena} vm={this.props.vm} locale={this.props.locale} hubState={this.hubState} /> :
                        <SimLabPane locale={this.props.locale} hubState={this.hubState} />}
                </div>
            </div>
        );
    }
}
export default SpikeSimulatorPane;
