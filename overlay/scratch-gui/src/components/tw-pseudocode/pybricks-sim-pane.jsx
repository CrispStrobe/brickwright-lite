import React from 'react';

import {createPybricksHost, PORTS} from '../../lib/pybricks-sim/pybricks-hub-host.js';
import {applyHubStateToSim, mirrorSimToHubState} from '../../lib/pybricks-sim/pybricks-hub-bridge.js';

/**
 * PybricksSimPane — a SPIKE Prime hub running Pybricks MicroPython in the
 * browser, docked in the right column like the micro:bit simulator.
 *
 * The hub is Pybricks' own firmware compiled to WebAssembly
 * (static/pybricks-sim/, built by build-pybricks-wasm.sh). No chip is
 * emulated: motors, sensors, buttons, IMU and speaker are simulated at the
 * firmware's driver layer, so everything above it — the Python API, motor
 * control, sensor protocol parsing — is the real Pybricks code.
 *
 * Protocol (Code tab → pane): window event 'bw-pybricks-run' {code}, with the
 * same latch pattern as the micro:bit pane (window.__bwPybricksPending) so a
 * click that mounts the pane is not lost.
 *
 * Ports follow lite's Virtual SPIKE Prime hub when it is present, so the
 * Scratch side and the Python side see the same hub (pybricks-hub-bridge.js).
 */

const L10N = {
    en: {
        title: 'SPIKE Prime · Pybricks simulator', run: '▶ Run', stop: '⏹ Stop', clear: '🗑 Clear',
        loading: 'Loading Pybricks…', ready: 'Ready', running: 'Running', failed: 'Could not load the simulator',
        output: '(program output appears here)', ports: 'Ports', none: 'empty', hub: 'Hub',
        pitch: 'Pitch', roll: 'Roll', yaw: 'Heading', follow: 'Use the Virtual SPIKE hub\'s ports',
        followHint: 'Ports and sensor values come from the Virtual SPIKE Prime panel; the light matrix and motor positions go back to it.',
        noProgram: 'Write a Pybricks program in the Code tab (Python, starting with "from pybricks…") and press ▶ Run on SPIKE.',
        kinds: {none: 'empty', 'motor-s': 'Small motor', 'motor-m': 'Medium motor', 'motor-l': 'Large motor',
            color: 'Color sensor', distance: 'Distance sensor', force: 'Force sensor'}
    },
    de: {
        title: 'SPIKE Prime · Pybricks-Simulator', run: '▶ Ausführen', stop: '⏹ Stopp', clear: '🗑 Leeren',
        loading: 'Pybricks wird geladen…', ready: 'Bereit', running: 'Läuft', failed: 'Simulator konnte nicht geladen werden',
        output: '(Programmausgabe erscheint hier)', ports: 'Anschlüsse', none: 'leer', hub: 'Hub',
        pitch: 'Neigung', roll: 'Rollen', yaw: 'Richtung', follow: 'Anschlüsse des virtuellen SPIKE-Hubs verwenden',
        followHint: 'Anschlüsse und Sensorwerte kommen aus dem Panel „Virtueller SPIKE Prime“; Lichtmatrix und Motorpositionen gehen dorthin zurück.',
        noProgram: 'Im Code-Tab ein Pybricks-Programm schreiben (Python, beginnend mit „from pybricks…“) und ▶ Auf SPIKE ausführen drücken.',
        kinds: {none: 'leer', 'motor-s': 'Kleiner Motor', 'motor-m': 'Mittlerer Motor', 'motor-l': 'Großer Motor',
            color: 'Farbsensor', distance: 'Abstandssensor', force: 'Kraftsensor'}
    }
};
const pickLocale = () => { try { return /^de/i.test(navigator.language) ? 'de' : 'en'; } catch { return 'en'; } };

const ASSET_BASE = 'static/pybricks-sim/';
let factoryPromise = null;
const loadFactory = () => {
    if (window.createPybricksHub) return Promise.resolve(window.createPybricksHub);
    if (!factoryPromise) {
        factoryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${ASSET_BASE}pybricks-hub.js`;
            script.onload = () => (window.createPybricksHub ? resolve(window.createPybricksHub) :
                reject(new Error('pybricks-hub.js did not define createPybricksHub')));
            script.onerror = () => { factoryPromise = null; reject(new Error('pybricks-hub.js failed to load')); };
            document.head.appendChild(script);
        });
    }
    return factoryPromise;
};

const DEFAULT_PORTS = {A: 'motor-m', B: 'motor-m', C: 'color', D: 'distance', E: 'force', F: 'none'};

const virtualSpike = () => (typeof window !== 'undefined' && window.__brickwrightVirtualSpike) || null;

class PybricksSimPane extends React.Component {
    constructor (props) {
        super(props);
        this.L = L10N[pickLocale()];
        this.host = null;
        this.state = {
            status: 'loading', output: '', snapshot: null, program: null,
            follow: Boolean(virtualSpike()?.hubState),
            ports: {...DEFAULT_PORTS},
            sensors: {C: {r: 200, g: 30, b: 30}, D: 500, E: 0},
            imu: {pitch: 0, roll: 0, yaw: 0},
            buttons: {}
        };
        this.onRunEvent = this.onRunEvent.bind(this);
        this.frame = this.frame.bind(this);
        this.audio = null;
    }

    async componentDidMount () {
        window.addEventListener('bw-pybricks-run', this.onRunEvent);
        try {
            const factory = await loadFactory();
            this.host = await createPybricksHost({
                factory,
                locateFile: name => `${ASSET_BASE}${name}`,
                realtime: true,
                onOutput: text => this.setState(s => ({output: (s.output + text).slice(-20000)})),
                onBeep: frequency => this.beep(frequency)
            });
            this.applyInputs();
            await this.host.boot();
            this.setState({status: 'ready'});
            this.raf = requestAnimationFrame(this.frame);
            this.unsubscribe = virtualSpike()?.hubState?.subscribe?.(() => {
                if (this.state.follow && !this.mirroring) this.applyInputs();
            });
            const pending = window.__bwPybricksPending;
            if (pending) { window.__bwPybricksPending = null; this.run(pending.code); }
        } catch (error) {
            this.setState({status: 'failed', output: `${this.L.failed}: ${error.message}\n`});
        }
    }

    componentWillUnmount () {
        window.removeEventListener('bw-pybricks-run', this.onRunEvent);
        cancelAnimationFrame(this.raf);
        if (this.unsubscribe) this.unsubscribe();
        if (this.host?.running) this.host.stop();
        if (this.audio) { try { this.audio.ctx.close(); } catch { /* closed */ } }
    }

    onRunEvent (event) {
        const code = event.detail?.code;
        try { window.__bwPybricksPending = null; } catch { /* noop */ }
        if (code) this.run(code);
    }

    applyInputs () {
        const host = this.host;
        if (!host) return;
        const hubState = this.state.follow ? virtualSpike()?.hubState : null;
        if (hubState) { applyHubStateToSim(host, hubState.data); return; }
        const {ports, sensors, imu, buttons} = this.state;
        for (const port of PORTS) {
            if (host.device(port) !== ports[port]) host.setDevice(port, ports[port]);
            const value = sensors[port];
            if (ports[port] === 'color' && value) host.setColor(port, value);
            if (ports[port] === 'distance') host.setDistance(port, Number(value ?? 500));
            if (ports[port] === 'force') host.setForce(port, Number(value ?? 0));
        }
        host.setOrientation(imu);
        host.setButtons(buttons);
    }

    async run (code) {
        if (!this.host || this.state.status === 'loading') { window.__bwPybricksPending = {code}; return; }
        if (this.host.running) { this.host.stop(); return; }
        this.applyInputs();
        this.setState({status: 'running', program: code, output: ''});
        try {
            await this.host.run(code);
        } catch (error) {
            this.setState(s => ({output: `${s.output}${error.message}\n`}));
        }
        this.setState({status: 'ready'});
    }

    frame () {
        if (this.host) {
            const snapshot = this.host.snapshot();
            this.setState({snapshot});
            const hubState = this.state.follow ? virtualSpike()?.hubState : null;
            if (hubState && snapshot.running) {
                this.mirroring = true;
                try { mirrorSimToHubState(this.host, hubState); } finally { this.mirroring = false; }
            }
        }
        this.raf = requestAnimationFrame(this.frame);
    }

    beep (frequency) {
        try {
            if (!this.audio) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                const ctx = new Ctx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                gain.gain.value = 0;
                osc.connect(gain).connect(ctx.destination);
                osc.start();
                this.audio = {ctx, osc, gain};
            }
            const {ctx, osc, gain} = this.audio;
            if (frequency > 0) {
                osc.frequency.setValueAtTime(frequency, ctx.currentTime);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
            } else {
                gain.gain.setValueAtTime(0, ctx.currentTime);
            }
        } catch { /* audio is optional */ }
    }

    setPort (port, kind) {
        this.setState(s => ({ports: {...s.ports, [port]: kind}}), () => this.applyInputs());
    }

    setSensor (port, value) {
        this.setState(s => ({sensors: {...s.sensors, [port]: value}}), () => this.applyInputs());
    }

    setImu (axis, value) {
        this.setState(s => ({imu: {...s.imu, [axis]: Number(value)}}), () => this.applyInputs());
    }

    pressButton (name, down) {
        this.setState(s => ({buttons: {...s.buttons, [name]: down}}), () => this.host?.setButtons(this.state.buttons));
    }

    renderMatrix () {
        const pixels = this.state.snapshot?.pixels || Array(25).fill(0);
        const light = this.state.snapshot?.statusLight || [0, 0, 0];
        const button = (name, label, style) => (
            <button type="button" aria-label={name}
                onPointerDown={() => this.pressButton(name, true)}
                onPointerUp={() => this.pressButton(name, false)}
                onPointerLeave={() => this.state.buttons[name] && this.pressButton(name, false)}
                style={{border: 'none', cursor: 'pointer', ...style}}
                data-testid={`bw-pybricks-button-${name}`}>{label}</button>
        );
        return (
            <div style={{background: '#f4d03f', borderRadius: 18, padding: 14, width: 190,
                boxShadow: 'inset 0 -5px 0 #c9a227', margin: '0 auto'}} data-testid="bw-pybricks-hub">
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
                    background: '#1f2937', padding: 8, borderRadius: 8}} data-testid="bw-pybricks-matrix">
                    {pixels.map((v, i) => (
                        <div key={i} data-brightness={v} style={{aspectRatio: '1', borderRadius: 3,
                            background: v ? `rgba(255,255,255,${0.15 + 0.85 * v / 100})` : '#374151'}} />
                    ))}
                </div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}>
                    {button('left', '◀', {width: 26, height: 26, borderRadius: 13, background: '#e5e7eb'})}
                    {button('center', '', {width: 34, height: 34, borderRadius: 17,
                        background: `rgb(${light.join(',')})`, boxShadow: '0 0 0 3px #fff'})}
                    {button('right', '▶', {width: 26, height: 26, borderRadius: 13, background: '#e5e7eb'})}
                </div>
            </div>
        );
    }

    renderPort (port, index) {
        const L = this.L;
        const snap = this.state.snapshot?.ports?.[index];
        const kind = snap?.device || 'none';
        const locked = this.state.follow && virtualSpike()?.hubState;
        const value = this.state.sensors[port];
        let control = null;
        if (kind.startsWith('motor')) {
            control = <span style={{fontVariantNumeric: 'tabular-nums'}}>{Math.round(snap.angle)}° · {Math.round(snap.speed)}°/s</span>;
        } else if (kind === 'color' && !locked) {
            const hex = value ? `#${[value.r, value.g, value.b].map(c => c.toString(16).padStart(2, '0')).join('')}` : '#000000';
            control = <input type="color" value={hex} aria-label={`${port} color`}
                onChange={e => { const h = e.target.value; this.setSensor(port, {r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16)}); }} />;
        } else if (kind === 'distance' && !locked) {
            control = <label><input type="range" min="0" max="2000" value={value ?? 500} aria-label={`${port} distance`}
                onChange={e => this.setSensor(port, Number(e.target.value))} /> {value ?? 500} mm</label>;
        } else if (kind === 'force' && !locked) {
            control = <label><input type="range" min="0" max="10" step="0.5" value={value ?? 0} aria-label={`${port} force`}
                onChange={e => this.setSensor(port, Number(e.target.value))} /> {value ?? 0} N</label>;
        }
        return (
            <div key={port} style={{display: 'grid', gridTemplateColumns: '18px 130px 1fr', gap: 6, alignItems: 'center',
                fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eef2f7'}} data-testid={`bw-pybricks-port-${port}`}>
                <strong>{port}</strong>
                {locked ? <span>{L.kinds[kind]}{snap?.synced ? '' : ' …'}</span> : (
                    <select value={this.state.ports[port]} onChange={e => this.setPort(port, e.target.value)}
                        aria-label={`Port ${port}`}>
                        {Object.keys(L.kinds).map(k => <option key={k} value={k}>{L.kinds[k]}</option>)}
                    </select>
                )}
                <span>{control}</span>
            </div>
        );
    }

    render () {
        const L = this.L;
        const {status, output, program} = this.state;
        const hasVirtual = Boolean(virtualSpike()?.hubState);
        const btn = {padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 12, fontWeight: 600};
        return (
            <div style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
                background: '#f8fafc', fontFamily: 'system-ui, sans-serif', color: '#1e293b'}}
            data-testid="bw-pybricks-sim-pane">
                <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 13, flex: 1}}>{L.title}</strong>
                    <span style={{fontSize: 11, color: '#64748b'}} data-testid="bw-pybricks-status">{L[status] || status}</span>
                    <button type="button" style={btn} disabled={!program || status === 'loading'}
                        onClick={() => this.run(program)} data-testid="bw-pybricks-run">
                        {status === 'running' ? L.stop : L.run}
                    </button>
                    <button type="button" style={btn} onClick={() => this.setState({output: ''})}>{L.clear}</button>
                </div>
                <div style={{padding: 10}}>{this.renderMatrix()}</div>
                <div style={{padding: '0 10px'}}>
                    {hasVirtual ? (
                        <label style={{display: 'flex', gap: 6, fontSize: 12, alignItems: 'center'}} title={L.followHint}>
                            <input type="checkbox" checked={this.state.follow}
                                onChange={e => this.setState({follow: e.target.checked}, () => this.applyInputs())} />
                            {L.follow}
                        </label>
                    ) : null}
                    <div style={{fontSize: 11, fontWeight: 700, color: '#64748b', margin: '6px 0 2px'}}>{L.ports}</div>
                    {PORTS.map((port, i) => this.renderPort(port, i))}
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8, fontSize: 11}}>
                        {[['pitch', -90, 90], ['roll', -180, 180], ['yaw', -180, 180]].map(([axis, min, max]) => (
                            <label key={axis} style={{display: 'flex', flexDirection: 'column'}}>
                                {L[axis]} {this.state.imu[axis]}°
                                <input type="range" min={min} max={max} value={this.state.imu[axis]}
                                    onChange={e => this.setImu(axis, e.target.value)} aria-label={L[axis]} />
                            </label>
                        ))}
                    </div>
                </div>
                <pre style={{flex: 1, minHeight: 80, margin: 10, padding: 8, background: '#0f172a', color: '#e2e8f0',
                    borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', overflow: 'auto'}}
                data-testid="bw-pybricks-output">{output || (program ? L.output : L.noProgram)}</pre>
            </div>
        );
    }
}

export default PybricksSimPane;
