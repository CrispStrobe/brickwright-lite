import React from 'react';
import {browserLocale} from '../../lib/bw-i18n.js';
import {ArenaHubBridge} from '../../lib/spike-arena/arena-hub-bridge.js';
import {drawArena} from '../../lib/spike-arena/arena-render.js';
import {DEFAULT_UNIT, loadUnit, loadUnitIndex, loadSolution} from '../../lib/spike-arena/arena-units.js';
import {ARENA_L10N, arenaT, arenaLocale, localText, verdictText} from '../../lib/spike-arena/l10n.js';
import VirtualSpikeHubState from '../../lib/virtual-hub/spike-hub-state.js';
import {VmStepClock, frameSimMs} from '../../lib/spike-arena/arena-clock.js';

/**
 * SpikeArenaPane — a top-down arena for a SPIKE Prime driving base, docked in
 * the right column like the other simulator panes (docs/SPIKE-ARENA.md).
 *
 * The program is whatever drives lite's virtual SPIKE hub: the spikeprime
 * blocks in the Scratch VM (and so the SPIKE dialect and every two-way language
 * that becomes them), SPIKE 3 Python, or Pybricks. The pane never talks to a
 * program. It connects the spikeprime blocks to the virtual hub when they are
 * loaded, presses the green flag, and owns simulated time: each animation
 * frame it steps the hub's motor model and the world together, in fixed steps.
 *
 * Window events: 'bw-spike-arena-select' {id, unit?} picks a challenge (of
 * another unit when `unit` names one: the pane opens that unit first).
 * Test hook: window.__bwSpikeArena exposes the verdict, the snapshot and the
 * open unit.
 */

// The per-frame rule, frameSimMs, lives in lib/spike-arena/arena-clock.js with
// the VM-less fallback's MAX_FRAME_MS: while a VM exists the arena is driven by
// VmStepClock, because a wall-clock frame delta and a program the VM schedules
// are two clocks and the verdict used to depend on which one won. The headless
// end-to-end test (test/spike-arena-starved-vm.test.mjs) runs the same rule.
const STEP_BUTTON_MS = 100;

const virtualSpike = () => (typeof window !== 'undefined' && window.__brickwrightVirtualSpike) || null;

class SpikeArenaPane extends React.Component {
    constructor (props) {
        super(props);
        this.locale = arenaLocale(props.locale || browserLocale());
        this.t = arenaT(this.locale);
        this.hubState = virtualSpike()?.hubState || null;
        this.ownHub = !this.hubState;
        if (!this.hubState) this.hubState = new VirtualSpikeHubState();
        this.state = {
            status: 'loading', message: '', units: [], unit: null, challenges: [], index: 0,
            verdict: null, readout: null, hintsOpen: false
        };
        this.canvas = React.createRef();
        this.box = React.createRef();
        this.frame = this.frame.bind(this);
        this.onSelectEvent = this.onSelectEvent.bind(this);
        this.lastFrame = null;
        this.clock = new VmStepClock();
        this.lastReadout = 0;
    }

    async componentDidMount () {
        window.addEventListener('bw-spike-arena-select', this.onSelectEvent);
        window.__bwSpikeArena = {
            get verdict () { return this._pane.bridge ? this._pane.bridge.verdict : null; },
            get snapshot () { return this._pane.bridge ? this._pane.bridge.snapshot() : null; },
            get status () { return this._pane.state.status; },
            get unit () { return this._pane.state.unit ? this._pane.state.unit.id : null; },
            _pane: this
        };
        // The unit list is a convenience: without it the pane still opens the
        // default unit, as it did before there was more than one.
        loadUnitIndex().then(units => this.setState({units}), () => {});
        const pending = window.__bwSpikeArenaPending;
        const wantedUnit = (pending && typeof pending === 'object' && pending.unit) || DEFAULT_UNIT;
        const wanted = pending && typeof pending === 'object' ? pending.id : pending;
        await this.openUnit(wantedUnit, wanted);
        this.raf = requestAnimationFrame(this.frame);
    }

    /** Loads a unit and selects one of its challenges (the first when `wanted` is not in it). */
    async openUnit (unitId, wanted) {
        this.stopProgram();
        const token = this.unitToken = {};
        this.setState({status: 'loading', message: ''});
        try {
            const {unit, challenges, folder} = await loadUnit(unitId);
            if (token !== this.unitToken) return;
            this.folder = folder;
            const index = Math.max(0, wanted ? challenges.findIndex(c => c.id === wanted) : 0);
            this.bridge = null;
            this.setState({unit, challenges, index, readout: null, status: 'ready'}, () => this.select(index));
        } catch (error) {
            if (token === this.unitToken) this.setState({status: 'failed', message: this.t('loadFailed', {error: error.message})});
        }
    }

    componentWillUnmount () {
        window.removeEventListener('bw-spike-arena-select', this.onSelectEvent);
        cancelAnimationFrame(this.raf);
        this.clock.uninstall();
        if (window.__bwSpikeArena && window.__bwSpikeArena._pane === this) delete window.__bwSpikeArena;
    }

    onSelectEvent (event) {
        const id = event.detail && event.detail.id;
        const unit = event.detail && event.detail.unit;
        if (unit && (!this.state.unit || this.state.unit.id !== unit)) {
            this.openUnit(unit, id);
            return;
        }
        const index = this.state.challenges.findIndex(c => c.id === id);
        if (index >= 0) this.select(index);
        else window.__bwSpikeArenaPending = unit ? {unit, id} : id;
    }

    get world () { return this.state.challenges[this.state.index] || null; }

    select (index) {
        this.stopProgram();
        const world = this.state.challenges[index];
        if (!world) return;
        this.bridge = new ArenaHubBridge({hubState: this.hubState, world});
        this.setState({index, verdict: null, status: 'ready', message: '', hintsOpen: false}, () => this.draw());
    }

    get vm () { return this.props.vm || null; }

    spikeLoaded () {
        const vm = this.vm;
        return Boolean(vm && vm.extensionManager && vm.extensionManager.isExtensionLoaded('spikeprime'));
    }

    /** Connects the spikeprime blocks to the virtual hub over Web Bluetooth, picking it without a chooser. */
    async connect () {
        const vm = this.vm;
        if (vm.getPeripheralIsConnected && vm.getPeripheralIsConnected('spikeprime')) return;
        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions.spikeprime;
        if (!peripheral) throw new Error('spikeprime has no peripheral');
        const previous = window.__brickwrightChooseVirtualBluetooth;
        window.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
        try {
            if (typeof peripheral.setMode === 'function') peripheral.setMode('web-ble');
            await peripheral.scan();
            for (let i = 0; i < 60 && !vm.getPeripheralIsConnected('spikeprime'); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } finally {
            window.__brickwrightChooseVirtualBluetooth = previous;
        }
        if (!vm.getPeripheralIsConnected('spikeprime')) throw new Error('no connection');
    }

    async start () {
        if (!this.bridge) return;
        if (this.state.status === 'paused' && this.bridge.verdict.status === 'running') {
            this.lastFrame = null;
            // Resuming must not spend time that accrued while paused.
            this.clock.clear();
            if (this.vm) this.clock.install(this.vm.runtime);
            this.setState({status: 'running'});
            return;
        }
        this.stopProgram();
        this.hubState.setSimulationEnabled(true);
        this.bridge.reset();
        let message = '';
        if (this.spikeLoaded()) {
            this.setState({message: this.t('connecting')});
            try {
                await this.connect();
            } catch (error) {
                this.setState({message: this.t('connectFailed', {error: error.message})});
                return;
            }
            this.bridge.reset();
            this.vm.greenFlag();
        } else message = this.t('noProgram');
        this.lastFrame = null;
        this.clock.clear();
        if (this.vm) this.clock.install(this.vm.runtime);
        this.setState({status: 'running', verdict: this.bridge.verdict, message});
    }

    stopProgram () {
        this.clock.uninstall();
        if (this.vm && this.spikeLoaded()) {
            try { this.vm.stopAll(); } catch { /* the VM may be mid-load */ }
        }
    }

    pause () { this.setState({status: 'paused'}); }

    reset () {
        this.stopProgram();
        if (this.bridge) this.bridge.reset();
        this.setState({status: 'ready', verdict: null, message: ''}, () => this.draw());
    }

    step () {
        if (!this.bridge) return;
        this.advance(STEP_BUTTON_MS);
        this.setState({status: 'paused'});
    }

    async loadReferenceSolution () {
        const world = this.world;
        if (!world) return;
        try {
            const code = await loadSolution(this.folder, world);
            window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code, source: `spike-arena:${world.id}`}}));
        } catch (error) {
            this.setState({message: this.t('loadFailed', {error: error.message})});
        }
    }

    advance (ms) {
        const verdict = this.bridge.tick(ms);
        if (verdict.status !== 'running' && this.state.status === 'running') {
            this.stopProgram();
            this.setState({status: 'done', verdict});
        }
    }

    frame (now) {
        if (this.bridge && this.state.status === 'running') {
            // ONE CLOCK. With a VM, simulated time is what the VM actually
            // stepped — starve it and the mission slows with it, so the verdict
            // is a fact about the program rather than about runner load. With no
            // VM there is no program to be fair to, and the wall clock is all
            // there is.
            // isInert(): installed, asked many times, never counted a step. That
            // cannot happen against a running VM, so the hook is not being called
            // and freezing mission time would make every mission pass by never
            // timing out. Degrade loudly-in-behaviour rather than silently.
            const dt = frameSimMs(this.clock, this.lastFrame, now);
            this.lastFrame = now;
            if (dt > 0) this.advance(dt);
        }
        this.draw();
        if (this.bridge && now - this.lastReadout > 100) {
            this.lastReadout = now;
            this.setState({readout: this.bridge.snapshot()});
        }
        this.raf = requestAnimationFrame(this.frame);
    }

    draw () {
        const canvas = this.canvas.current;
        const box = this.box.current;
        const world = this.world;
        if (!canvas || !box || !world || !this.bridge) return;
        const cssWidth = Math.max(160, box.clientWidth);
        const scale = cssWidth / world.mat.width;
        const cssHeight = world.mat.height * scale;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.round(cssWidth * ratio);
        const height = Math.round(cssHeight * ratio);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            canvas.style.height = `${cssHeight}px`;
        }
        const ctx = canvas.getContext('2d');
        drawArena(ctx, world, this.bridge.snapshot(), this.bridge.robot, scale * ratio);
    }

    renderReadout () {
        const t = this.t;
        const snap = this.state.readout;
        if (!snap || !this.bridge) return null;
        const hub = this.hubState.data;
        const colors = ARENA_L10N[this.locale].colors;
        const rows = [[t('time'), `${(snap.timeMs / 1000).toFixed(1)} s`],
            [t('position'), `${snap.pose.x.toFixed(1)}, ${snap.pose.y.toFixed(1)} cm`],
            [t('heading'), `${Math.round(hub.imu.yaw)}°`],
            [t('motors'), this.bridge.robot.left.port + ' ' + Math.round(hub.motors['ABCDEF'.indexOf(this.bridge.robot.left.port)].position) +
                '° · ' + this.bridge.robot.right.port + ' ' + Math.round(hub.motors['ABCDEF'.indexOf(this.bridge.robot.right.port)].position) + '°']];
        for (const sensor of this.bridge.robot.sensors) {
            const reading = snap.sensors[sensor.port] || {};
            if (sensor.kind === 'color') {
                rows.push([`${t('color')} (${sensor.port})`, `${colors[reading.colorName] || reading.colorName} · ${reading.color} · ${reading.reflection}%`]);
            } else if (sensor.kind === 'distance') {
                rows.push([`${t('distance')} (${sensor.port})`, reading.distance >= 0 ? `${(reading.distance / 10).toFixed(1)} cm` : t('noReading')]);
            } else if (sensor.kind === 'force') {
                rows.push([`${t('force')} (${sensor.port})`, reading.pressed ? t('pressed') : t('released')]);
            }
        }
        return (
            <div data-testid="bw-spike-arena-readout" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '2px 12px', fontSize: 12, padding: '6px 10px', fontVariantNumeric: 'tabular-nums'}}>
                {rows.map(([label, value]) => (
                    <div key={label} style={{display: 'flex', justifyContent: 'space-between', gap: 6, borderBottom: '1px solid #eef2f7'}}>
                        <span style={{color: '#64748b'}}>{label}</span><strong>{value}</strong>
                    </div>
                ))}
            </div>
        );
    }

    /** A staged mission's checklist: which stages were met so far (partial credit). */
    renderStages (world) {
        if (!Array.isArray(world.stages)) return null;
        const met = (this.bridge && this.bridge.verdict && this.bridge.verdict.stages) || [];
        return (
            <ol data-testid="bw-spike-arena-stages" aria-label={this.t('stages')}
                style={{margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: '#475569'}}>
                {world.stages.map((stage, i) => (
                    <li key={i} data-met={met[i] ? 'true' : 'false'} style={{fontWeight: met[i] ? 700 : 400, color: met[i] ? '#2b8a3e' : undefined}}>
                        {`${met[i] ? '✓' : '○'} ${localText(stage, this.locale)}`}
                    </li>
                ))}
            </ol>
        );
    }

    render () {
        const t = this.t;
        const {status, challenges, index, verdict, message, hintsOpen, unit, units} = this.state;
        const world = this.world;
        const decided = verdict && verdict.status !== 'running' ? verdict : null;
        const btn = {padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, minHeight: 32};
        return (
            <div data-testid="bw-spike-arena-pane" style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
                background: '#f8fafc', fontFamily: 'system-ui, sans-serif', color: '#1e293b'}}>
                <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 13, marginRight: 4}}>{t('title')}</strong>
                    <select value={unit ? unit.id : ''} aria-label={t('unit')} data-testid="bw-spike-arena-unit"
                        onChange={e => this.openUnit(e.target.value)} style={{flex: '1 1 140px', minWidth: 0, minHeight: 32}}
                        disabled={status === 'loading' || units.length < 2}>
                        {(units.length ? units : unit ? [unit] : []).map(u => (
                            <option key={u.id} value={u.id}>{localText(u.title, this.locale)}</option>
                        ))}
                    </select>
                    <select value={index} aria-label={t('challenge')} data-testid="bw-spike-arena-select"
                        onChange={e => this.select(Number(e.target.value))} style={{flex: '1 1 160px', minWidth: 0, minHeight: 32}}
                        disabled={!challenges.length}>
                        {challenges.map((c, i) => <option key={c.id} value={i}>{`${i + 1}. ${localText(c.title, this.locale)}`}</option>)}
                    </select>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                        {status === 'running' ? (
                            <button type="button" style={btn} onClick={() => this.pause()} data-testid="bw-spike-arena-stop">{t('stop')}</button>
                        ) : (
                            <button type="button" style={{...btn, background: '#2f9e44', color: '#fff', border: '1px solid #2b8a3e'}}
                                disabled={!world} onClick={() => this.start()} data-testid="bw-spike-arena-start">{t('start')}</button>
                        )}
                        <button type="button" style={btn} disabled={!world} onClick={() => this.step()} data-testid="bw-spike-arena-step">{t('step')}</button>
                        <button type="button" style={btn} disabled={!world} onClick={() => this.reset()} data-testid="bw-spike-arena-reset">{t('reset')}</button>
                    </div>
                </div>
                {world ? (
                    <div style={{padding: '8px 10px 0', fontSize: 13, lineHeight: 1.45}} data-testid="bw-spike-arena-intro">
                        {localText(world.intro, this.locale)}
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6}}>
                            <button type="button" style={{...btn, fontWeight: 500}} onClick={() => this.setState({hintsOpen: !hintsOpen})}
                                aria-expanded={hintsOpen}>{t('hints')}</button>
                            <button type="button" style={{...btn, fontWeight: 500}} title={t('loadSolutionTitle')}
                                onClick={() => this.loadReferenceSolution()} data-testid="bw-spike-arena-load-solution">{t('loadSolution')}</button>
                        </div>
                        {hintsOpen ? (
                            <ol style={{margin: '6px 0 0', paddingLeft: 20, color: '#475569'}}>
                                {(world.hints || []).map((hint, i) => <li key={i}>{localText(hint, this.locale)}</li>)}
                            </ol>
                        ) : null}
                        {this.renderStages(world)}
                    </div>
                ) : null}
                {decided ? (
                    <div role="status" data-testid="bw-spike-arena-banner" data-verdict={decided.status} data-reason={decided.reason}
                        style={{margin: '8px 10px 0', padding: '8px 12px', borderRadius: 8, fontWeight: 700, fontSize: 14,
                            background: decided.status === 'pass' ? '#d3f9d8' : '#ffe3e3',
                            color: decided.status === 'pass' ? '#2b8a3e' : '#c92a2a',
                            border: `1px solid ${decided.status === 'pass' ? '#8ce99a' : '#ffa8a8'}`}}>
                        {verdictText(decided, world, this.locale)}
                        {Array.isArray(decided.stages) ? (
                            <div data-testid="bw-spike-arena-stages-done" style={{fontWeight: 500, fontSize: 12, marginTop: 2}}>
                                {t('stagesDone', {done: decided.stages.filter(Boolean).length, of: decided.stages.length})}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {message || status === 'loading' || this.ownHub ? (
                    <div style={{margin: '6px 10px 0', fontSize: 12, color: '#64748b'}} data-testid="bw-spike-arena-message">
                        {[status === 'loading' ? t('loading') : '', this.ownHub ? t('noHub') : '', message].filter(Boolean).join(' ')}
                    </div>
                ) : null}
                <div ref={this.box} style={{padding: 10}}>
                    <canvas ref={this.canvas} role="img" aria-label={t('canvasLabel')} data-testid="bw-spike-arena-canvas"
                        style={{width: '100%', display: 'block', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.25)'}} />
                </div>
                <div style={{fontSize: 11, color: '#64748b', padding: '0 10px'}} data-testid="bw-spike-arena-status">
                    {t(status === 'running' ? 'running' : status === 'paused' ? 'paused' : 'ready')}
                </div>
                {this.renderReadout()}
            </div>
        );
    }
}

export default SpikeArenaPane;
