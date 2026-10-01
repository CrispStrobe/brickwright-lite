// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import SpikeArenaPane from './spike-arena-pane.jsx';
import VirtualSpikeHubState from '../../lib/virtual-hub/spike-hub-state.js';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';

const PybricksSimPane = React.lazy(() =>
    import(/* webpackChunkName: "bw-pybricks-sim" */ './pybricks-sim-pane.jsx'));

const TEXT = {
    en: {backend: 'Simulator backend', native: 'Brickwright · Scratch / native', pybricks: 'Pybricks · Python',
        nativeHint: 'Run Scratch blocks, DEVICE SPIKE programs or imported SPIKE 3 programs with Start in the arena.',
        pybricksHint: 'Run Pybricks Python from the Code tab or the hub pane below. The same arena and hub are used.',
        switching: 'Stopping the active program…', loading: 'Loading Pybricks…'},
    de: {backend: 'Simulator-Backend', native: 'Brickwright · Scratch / nativ', pybricks: 'Pybricks · Python',
        nativeHint: 'Scratch-Blöcke, DEVICE-SPIKE-Programme oder importierte SPIKE-3-Programme mit Start in der Arena ausführen.',
        pybricksHint: 'Pybricks-Python im Code-Tab oder im Hub-Panel unten ausführen. Arena und Hub bleiben dieselben.',
        switching: 'Das laufende Programm wird angehalten…', loading: 'Pybricks wird geladen…'}
};

class SpikeSimulatorPane extends React.Component {
    constructor (props) {
        super(props);
        this.L = TEXT[pickLocale(props.locale || browserLocale(), TEXT)];
        this.hubState = props.hubState || window.__brickwrightVirtualSpike?.hubState || new VirtualSpikeHubState();
        this.state = {backend: window.__bwPybricksPending ? 'pybricks' : (props.initialBackend || 'native'),
            switching: false, arenaReady: false, error: ''};
        this.arena = React.createRef();
        this.onRun = this.onRun.bind(this);
    }

    componentDidMount () { window.addEventListener('bw-pybricks-run', this.onRun); }

    componentDidUpdate (previous) {
        if (previous.initialBackend !== this.props.initialBackend) this.selectBackend(this.props.initialBackend);
    }

    componentWillUnmount () {
        this.disposed = true;
        window.removeEventListener('bw-pybricks-run', this.onRun);
        this.arena.current?.stopProgram();
        this.hubState.backend.cancel();
    }

    onRun (event) {
        if (event.detail?.code) window.__bwPybricksPending = {code: event.detail.code};
        if (this.state.backend === 'pybricks' && !this.state.switching) return;
        this.selectBackend('pybricks');
    }

    async selectBackend (backend) {
        if (!['native', 'pybricks'].includes(backend)) return;
        const token = this.switchToken = {};
        this.setState({switching: true, error: ''});
        try {
            await this.arena.current?.stopProgram({restart: true});
            this.hubState.backend.cancel();
            if (this.disposed || token !== this.switchToken) return;
            if (backend === 'native') window.__bwPybricksPending = null;
            this.setState({backend, switching: false});
        } catch (error) {
            if (!this.disposed && token === this.switchToken) this.setState({switching: false, error: error.message});
        }
    }

    render () {
        const {backend, switching, arenaReady, error} = this.state;
        const L = this.L;
        return (
            <div data-testid="bw-spike-simulator" data-backend={backend}
                style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#f8fafc'}}>
                <label style={{padding: 10, display: 'flex', alignItems: 'center', gap: 8}}>
                    {L.backend}
                    <select data-testid="bw-spike-backend" aria-label={L.backend} value={backend} disabled={switching}
                        onChange={event => this.selectBackend(event.target.value)}>
                        <option value="native">{L.native}</option>
                        <option value="pybricks">{L.pybricks}</option>
                    </select>
                </label>
                <div role="status" data-testid="bw-spike-backend-hint" style={{padding: '0 10px 8px', fontSize: 12}}>
                    {error || (switching ? L.switching : backend === 'native' ? L.nativeHint : L.pybricksHint)}
                </div>
                <div style={{flex: '1 0 400px', minHeight: 300}}>
                    <SpikeArenaPane ref={this.arena} vm={this.props.vm} locale={this.props.locale}
                        hubState={this.hubState} backend={switching ? 'pybricks' : backend}
                        onReady={() => this.setState({arenaReady: true})} />
                </div>
                {backend === 'pybricks' && arenaReady ? (
                    <React.Suspense fallback={<div role="status">{L.loading}</div>}>
                        <div style={{flex: '1 0 450px'}}>
                            <PybricksSimPane hubState={this.hubState} locale={this.props.locale} />
                        </div>
                    </React.Suspense>
                ) : null}
            </div>
        );
    }
}

export default SpikeSimulatorPane;
