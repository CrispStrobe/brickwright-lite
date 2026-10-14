// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import SpikeArenaPane from './spike-arena-pane.jsx';
import VirtualSpikeHubState from '../../lib/virtual-hub/spike-hub-state.js';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
const TEXT = {
    en: 'Virtual SPIKE Prime · Run Scratch blocks, DEVICE SPIKE programs or imported LEGO SPIKE 3 programs with Start in the arena.',
    de: 'Virtueller SPIKE Prime · Scratch-Blöcke, DEVICE-SPIKE-Programme oder importierte LEGO-SPIKE-3-Programme mit Start in der Arena ausführen.'
};
class SpikeSimulatorPane extends React.Component {
    constructor (props) {
        super(props);
        this.hubState = props.hubState || window.__brickwrightVirtualSpike?.hubState || new VirtualSpikeHubState();
        this.arena = React.createRef();
    }
    componentWillUnmount () {
        this.arena.current?.stopProgram();
        this.hubState.backend.cancel();
    }
    render () {
        return (
            <div data-testid="bw-spike-simulator" data-backend="native"
                style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#f8fafc'}}>
                <div role="status" data-testid="bw-spike-backend-hint" style={{padding: 10, fontSize: 12}}>
                    {TEXT[pickLocale(this.props.locale || browserLocale(), TEXT)]}
                </div>
                <div style={{flex: '1 0 400px', minHeight: 300}}>
                    <SpikeArenaPane ref={this.arena} vm={this.props.vm} locale={this.props.locale} hubState={this.hubState} />
                </div>
            </div>
        );
    }
}
export default SpikeSimulatorPane;
