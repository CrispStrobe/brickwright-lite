/**
 * The MakeCode simulator pane: a MakeCode project run in MakeCode's OWN
 * simulator — the micro:bit board or the Arcade console — as MakeCode wrote it.
 *
 * The Code tab compiles the project with pxt (lib/bw-makecode/pxt-runtime.js)
 * and announces the result on `bw-makecode-load` {target, js, name}; the pane
 * may not be mounted yet (switching the dock and running are one gesture), so
 * the program is also parked on `window.__bwMakeCodePending` for the pane to
 * collect on mount — the Arduboy pane's contract.
 *
 * The simulator itself runs in static/makecode/<target>/sim/host.html (see its
 * header for why a host page), which this pane frames and talks to by
 * postMessage. Keyboard input goes to the simulator frame when it has focus,
 * the way MakeCode's editor does it.
 */
import PropTypes from 'prop-types';
import React from 'react';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';

const L10N = {
    en: {
        'mc.title.microbit': 'MakeCode micro:bit',
        'mc.title.arcade': 'MakeCode Arcade',
        'mc.stop': '■ Stop',
        'mc.restart': '↻ Restart',
        'mc.empty': 'Run a MakeCode project from the Code tab: ⋯ → ▶ Run in MakeCode simulator.',
        'mc.loading': 'Starting the simulator…',
        'mc.running': 'Running',
        'mc.stopped': 'Stopped',
        'mc.serial': 'Serial',
        'mc.keys': 'Keys: arrows, Z/Space = A, X = B (click the screen first).',
        'mc.error': 'Simulator error: {msg}'
    },
    de: {
        'mc.title.microbit': 'MakeCode micro:bit',
        'mc.title.arcade': 'MakeCode Arcade',
        'mc.stop': '■ Stopp',
        'mc.restart': '↻ Neu starten',
        'mc.empty': 'Starte ein MakeCode-Projekt im Code-Tab: ⋯ → ▶ Im MakeCode-Simulator ausführen.',
        'mc.loading': 'Simulator startet…',
        'mc.running': 'Läuft',
        'mc.stopped': 'Gestoppt',
        'mc.serial': 'Seriell',
        'mc.keys': 'Tasten: Pfeile, Z/Leertaste = A, X = B (erst auf den Bildschirm klicken).',
        'mc.error': 'Simulatorfehler: {msg}'
    }
};
const t = makeT(L10N);

class MakeCodeSimPane extends React.Component {
    constructor (props) {
        super(props);
        this.state = {program: null, hostReady: false, running: false, serial: '', error: null, runId: 0};
        this._frame = React.createRef();
        this.onLoad = this.onLoad.bind(this);
        this.onMessage = this.onMessage.bind(this);
        this.restart = this.restart.bind(this);
        this.stop = this.stop.bind(this);
    }

    componentDidMount () {
        window.addEventListener('bw-makecode-load', this.onLoad);
        window.addEventListener('message', this.onMessage);
        const pending = window.__bwMakeCodePending;
        if (pending) this.take(pending);
    }

    componentWillUnmount () {
        window.removeEventListener('bw-makecode-load', this.onLoad);
        window.removeEventListener('message', this.onMessage);
    }

    onLoad (event) {
        if (event && event.detail) this.take(event.detail);
    }

    take (program) {
        window.__bwMakeCodePending = null;
        const sameTarget = this.state.program && this.state.program.target === program.target;
        // A different target is a different host page: the frame reloads and
        // announces itself again. The same target reuses the loaded simulator.
        this.setState(state => ({
            program, serial: '', error: null, running: false,
            hostReady: sameTarget ? state.hostReady : false,
            runId: state.runId + 1
        }), () => { if (this.state.hostReady) this.post({type: 'bw-makecode-run', js: program.js}); });
    }

    post (msg) {
        const frame = this._frame.current;
        if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
    }

    onMessage (event) {
        const frame = this._frame.current;
        if (!frame || event.source !== frame.contentWindow) return;
        const m = event.data || {};
        if (m.type === 'bw-makecode-host-ready') {
            this.setState({hostReady: true});
            if (this.state.program) this.post({type: 'bw-makecode-run', js: this.state.program.js});
        } else if (m.type === 'bw-makecode-state') {
            // pxsim.SimulatorState (pxtsim.d.ts): 0 Unloaded, 1 Stopped, 2 Pending,
            // 3 Starting, 4 Running, 5 Paused, 6 Suspended — the number pxtsim sends.
            this.setState({running: m.state === '4'});
        } else if (m.type === 'bw-makecode-serial') {
            this.setState(state => ({serial: (state.serial + m.data).slice(-8000)}));
        } else if (m.type === 'bw-makecode-error') {
            this.setState({error: m.message});
        }
    }

    restart () {
        if (!this.state.program) return;
        this.setState({serial: '', error: null});
        this.post({type: 'bw-makecode-run', js: this.state.program.js});
    }

    stop () {
        this.post({type: 'bw-makecode-stop'});
    }

    render () {
        const locale = this.props.locale || browserLocale();
        const {program, hostReady, running, serial, error} = this.state;
        const btn = {padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 13};
        if (!program) {
            return (
                <div data-testid="bw-makecode-pane" style={{padding: 24, color: '#64748b'}}>
                    {t(locale, 'mc.empty')}
                </div>
            );
        }
        return (
            <div data-testid="bw-makecode-pane" data-target={program.target}
                style={{display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 13}}>{t(locale, `mc.title.${program.target}`)}</strong>
                    <span style={{fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={program.name}>{program.name}</span>
                    <span data-testid="bw-makecode-state" style={{fontSize: 12, color: running ? '#15803d' : '#64748b'}}>
                        {hostReady ? t(locale, running ? 'mc.running' : 'mc.stopped') : t(locale, 'mc.loading')}
                    </span>
                    <button type="button" style={btn} onClick={this.stop} data-testid="bw-makecode-stop">
                        {t(locale, 'mc.stop')}</button>
                    <button type="button" style={btn} onClick={this.restart} data-testid="bw-makecode-restart">
                        {t(locale, 'mc.restart')}</button>
                </div>
                <iframe
                    key={program.target}
                    ref={this._frame}
                    title={t(locale, `mc.title.${program.target}`)}
                    data-testid="bw-makecode-frame"
                    src={`static/makecode/${program.target}/sim/host.html`}
                    style={{flex: 1, minHeight: 240, border: 0, width: '100%'}}
                />
                {program.target === 'arcade' ? (
                    <div style={{fontSize: 11, color: '#64748b', padding: '2px 10px'}}>{t(locale, 'mc.keys')}</div>
                ) : null}
                {error ? (
                    <div style={{fontSize: 12, color: '#b91c1c', padding: '4px 10px'}}>
                        {t(locale, 'mc.error', {msg: error})}</div>
                ) : null}
                {serial ? (
                    <pre data-testid="bw-makecode-serial" aria-label={t(locale, 'mc.serial')}
                        style={{margin: 0, maxHeight: 120, overflow: 'auto', fontSize: 11, padding: '4px 10px',
                            background: '#0f172a', color: '#e2e8f0'}}>{serial}</pre>
                ) : null}
            </div>
        );
    }
}

MakeCodeSimPane.propTypes = {
    locale: PropTypes.string
};

export default MakeCodeSimPane;
