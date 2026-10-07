import React from 'react';
import {compileFirmwareProgram} from '../../lib/spike-arena/firmware-program.js';
import {RenodeArenaSession} from '../../lib/spike-arena/renode-arena-session.js';
import {encodePython, encodeInstructions} from '../../lib/spike-nuttx/upload-protocol.js';
import {encodeSource} from '../../lib/spike-micropython/raw-repl.js';
import {createNativeRenodeCapabilities} from 'scratch-vm/src/extension-support/native-renode-capability.js';
import {connectVirtualSpike} from '../../lib/virtual-hub/connect-virtual-spike.js';
import {browserLocale} from '../../lib/bw-i18n.js';
import {ArenaHubBridge} from '../../lib/spike-arena/arena-hub-bridge.js';
import {drawArena} from '../../lib/spike-arena/arena-render.js';
import {DEFAULT_UNIT, loadUnit, loadUnitIndex, loadSolution} from '../../lib/spike-arena/arena-units.js';
import {ARENA_L10N, arenaT, arenaLocale, localText, verdictText} from '../../lib/spike-arena/l10n.js';
import VirtualSpikeHubState from '../../lib/virtual-hub/spike-hub-state.js';
import {sandboxWorld, editSandbox, selectSandboxItem, transformSandboxItem, SANDBOX_STORAGE_KEY} from '../../lib/spike-arena/arena-sandbox.js';
import downloadBlob from '../../lib/download-blob.js';
import {VmStepClock, frameSimMs} from '../../lib/spike-arena/arena-clock.js';

/**
 * SpikeArenaPane — a top-down arena for a SPIKE Prime driving base, docked in
 * the right column like the other simulator panes (docs/SPIKE-ARENA.md).
 *
 * The program is whatever drives lite's virtual SPIKE hub: the spikeprime
 * blocks in the Scratch VM (and so the SPIKE dialect and every two-way language
 * that becomes them), LEGO SPIKE 3 Python. The pane never talks to a
 * program. It connects the spikeprime blocks to the virtual hub when they are
 * loaded, presses the green flag, and owns simulated time: each animation
 * frame it steps the hub's motor model and the world together, in fixed steps.
 *
 * Window events: 'bw-spike-arena-select' {id, unit?} picks a challenge (of
 * another unit when `unit` names one: the pane opens that unit first).
 * Test hook: window.__bwSpikeArena exposes the verdict, the snapshot, the
 * open unit and the view ('2d'/'3d', and the 3D view's state).
 *
 * The 3D view (docs/SPIKE-ARENA.md, "The 3D view") draws the same snapshot as
 * the 2D canvas, in place of it; it is loaded on first use as its own chunk
 * (three.js), and without WebGL the pane stays in 2D and says why. Which view
 * is open never touches the bridge: time is the clock's, not the renderer's.
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
        this.hubState = props.hubState || virtualSpike()?.hubState || null;
        this.ownHub = !this.hubState;
        if (!this.hubState) this.hubState = new VirtualSpikeHubState();
        this.state = {
            execution: 'native', topology: 'default', status: 'loading', message: '', units: [], unit: null, challenges: [], index: 0,
            verdict: null, readout: null, hintsOpen: false,
            sandbox: null, sandboxTool: 'none', sandboxSelection: null, sandboxColor: 'blue', driveSpeed: 30,
            view: '2d', view3dState: 'off', view3dMessage: '', cameraMode: 'orbit'
        };
        this.sandboxFile = React.createRef();
        this.canvas = React.createRef();
        this.view3dBox = React.createRef();
        this.view3d = null;
        this.box = React.createRef();
        this.frame = this.frame.bind(this);
        this.onSelectEvent = this.onSelectEvent.bind(this);
        this.lastFrame = null;
        this.clock = new VmStepClock();
        this.lastReadout = 0;
    }

    async componentDidMount () {
        window.addEventListener('bw-spike-arena-select', this.onSelectEvent);
        window.addEventListener('bw-project-bundle-loaded', this.onProjectLoaded);
        window.__bwSpikeArena = {
            get bridge () { return this._pane.bridge; },
            beginExternal: () => {
                this.clock.uninstall();
                this.setState({status: 'running'});
            },
            advanceExternal: ms => { if (this.bridge) this.advance(ms); },
            endExternal: () => {
                if (this.state.status === 'running') this.setState({status: 'paused'});
            },
            get verdict () { return this._pane.bridge ? this._pane.bridge.verdict : null; },
            get snapshot () { return this._pane.bridge ? this._pane.bridge.snapshot() : null; },
            get status () { return this._pane.state.status; },
            get unit () { return this._pane.state.unit ? this._pane.state.unit.id : null; },
            get mode () { return this._pane.world?.mode === 'sandbox' ? 'sandbox' : 'challenge'; },
            get view () { return this._pane.state.view; },
            get view3d () { return this._pane.state.view3dState; },
            _pane: this
        };
        // The unit list is a convenience: without it the pane still opens the
        // default unit, as it did before there was more than one.
        loadUnitIndex().then(units => { if (!this.disposed) this.setState({units}); }, () => {});
        const pending = window.__bwSpikeArenaPending;
        const wantedUnit = (pending && typeof pending === 'object' && pending.unit) || DEFAULT_UNIT;
        const wanted = pending && typeof pending === 'object' ? pending.id : pending;
        // Free play must animate even if challenge downloads never finish.
        this.raf = requestAnimationFrame(this.frame);
        await this.openUnit(wantedUnit, wanted);
    }

    /** Loads a unit and selects one of its challenges (the first when `wanted` is not in it). */
    async openUnit (unitId, wanted) {
        await this.stopProgram();
        if (this.disposed) return;
        const token = this.unitToken = {};
        this.setState({status: 'loading', sandbox: null, topology: 'default', message: ''});
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
        this.disposed = true;
        this.stopProgram().catch(() => {});
        this.unitToken = null;
        window.removeEventListener('bw-spike-arena-select', this.onSelectEvent);
        window.removeEventListener('bw-project-bundle-loaded', this.onProjectLoaded);
        cancelAnimationFrame(this.raf);
        this.clock.uninstall();
        this.view3dToken = null;
        this.disposeView3D();
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

    get world () { return this.state.sandbox || this.state.challenges[this.state.index] || null; }

    async select (index) {
        await this.stopProgram();
        if (this.disposed) return;
        const world = this.state.challenges[index];
        if (!world) return;
        this.bridge = new ArenaHubBridge({hubState: this.hubState, world});
        this.setState({index, sandbox: null, topology: 'default', readout: null, verdict: null, status: 'ready', message: '', hintsOpen: false}, () => {
            // A new world needs a new scene; the renderer is not reused across worlds.
            if (this.view3d) this.mountView3D();
            this.draw();
            this.props.onReady?.();
        });
    }

    async setSandbox (world) {
        this.unitToken = null;
        await this.stopProgram();
        if (this.disposed) return;
        this.unitToken = null;
        this.bridge = new ArenaHubBridge({hubState: this.hubState, world});
        this.lastFrame = null;
        this.clock.clear();
        try { localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(world)); } catch { /* local storage may be unavailable */ }
        this.setState({sandbox: world, status: 'ready', verdict: null, readout: null, message: ''}, () => {
            if (this.view3d) this.mountView3D();
            this.draw();
        });
    }

    async openSandbox () {
        let world;
        try {
            const saved = localStorage.getItem(SANDBOX_STORAGE_KEY);
            world = sandboxWorld(saved ? JSON.parse(saved) : undefined);
        } catch { world = sandboxWorld(); }
        await this.setSandbox(world);
    }

    async sandboxTap (event) {
        if (!this.state.sandbox || ['none', 'move'].includes(this.state.sandboxTool)) return;
        const box = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width * this.world.mat.width;
        const y = (event.clientY - box.top) / box.height * this.world.mat.height;
        try { await this.setSandbox(editSandbox(this.world, this.state.sandboxTool, x, y, this.state.sandboxColor)); }
        catch (error) { this.setState({message: error.message}); }
    }

    onProjectLoaded = async () => {
        if (this.state.sandbox) await this.openSandbox();
    };

    sandboxPoint (event) {
        const box = event.currentTarget.getBoundingClientRect();
        return {x: (event.clientX - box.left) / box.width * this.world.mat.width,
            y: (event.clientY - box.top) / box.height * this.world.mat.height};
    }

    sandboxPointerDown = event => {
        if (!this.state.sandbox || this.state.sandboxTool !== 'move') return;
        const point = this.sandboxPoint(event);
        const selection = selectSandboxItem(this.world, point.x, point.y);
        this.setState({sandboxSelection: selection});
        this.sandboxDrag = selection ? {...point, selection, world: this.world} : null;
        if (selection) event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    sandboxPointerUp = async event => {
        const drag = this.sandboxDrag;
        this.sandboxDrag = null;
        if (!drag || drag.world !== this.world) return;
        const point = this.sandboxPoint(event);
        try { await this.setSandbox(transformSandboxItem(drag.world, drag.selection,
            {dx: point.x - drag.x, dy: point.y - drag.y})); }
        catch (error) { this.setState({message: error.message}); }
    };

    async resizeSandboxSelection (scale) {
        try { await this.setSandbox(transformSandboxItem(this.world, this.state.sandboxSelection, {scale})); }
        catch (error) { this.setState({message: error.message}); }
    }

    async manualDrive (direction) {
        if (!this.state.sandbox || !this.bridge) return;
        await this.stopProgram();
        if (this.disposed) return;
        this.hubState.setSimulationEnabled(true);
        const speeds = {forward: [1, 1], back: [-1, -1], left: [-1, 1], right: [1, -1], stop: [0, 0]}[direction];
        if (!speeds) return;
        for (const [i, side] of [this.bridge.robot.left, this.bridge.robot.right].entries()) {
            const speed = this.hubState.backend.percentToDps(side.port, this.state.driveSpeed * speeds[i] * (side.reversed ? -1 : 1));
            this.hubState.backend.runAtSpeed(side.port, speed);
        }
        this.lastFrame = null;
        this.setState({execution: 'native', topology: 'default', status: 'running', message: ''});
    }

    async importSandbox (event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            if (file.size > 1024 * 1024) throw new RangeError(this.t('sandboxFileTooLarge'));
            const world = sandboxWorld(JSON.parse(await file.text()));
            await this.setSandbox(world);
        } catch (error) { this.setState({message: this.t('sandboxImportFailed', {error: error.message})}); }
    }

    async exportSandbox () {
        if (!this.state.sandbox) return;
        try {
            await downloadBlob('spike-sandbox.json', new Blob([JSON.stringify(this.state.sandbox, null, 2)], {type: 'application/json'}));
        } catch (error) { this.setState({message: error.message}); }
    }

    renderSandboxTools (btn) {
        if (!this.state.sandbox) return null;
        const t = this.t;
        return (
            <div data-testid="bw-spike-sandbox-tools" style={{display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px'}}>
                {[['forward', '↑'], ['back', '↓'], ['left', '↶'], ['right', '↷'], ['stop', '■']].map(([direction, icon]) => (
                    <button key={direction} type="button" style={btn} data-testid={`bw-spike-sandbox-drive-${direction}`}
                        aria-label={t(`drive.${direction}`)} title={t(`drive.${direction}`)} onClick={() => this.manualDrive(direction)}>{icon}</button>
                ))}
                <label style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 12}}>{t('sandboxSpeed')}
                    <input type="range" min="0" max="100" value={this.state.driveSpeed} aria-label={t('sandboxSpeed')}
                        onChange={event => this.setState({driveSpeed: Number(event.target.value)})} style={{width: 90}} />
                </label>
                <select aria-label={t('sandboxTool')} data-testid="bw-spike-sandbox-tool" value={this.state.sandboxTool}
                    style={{minHeight: 32, maxWidth: '100%'}} onChange={event => this.setState({sandboxTool: event.target.value})}>
                    {['none', 'move', 'start', 'paint', 'wall', 'crate', 'erase'].map(tool => <option key={tool} value={tool}>{t(`tool.${tool}`)}</option>)}
                </select>
                <select aria-label={t('sandboxColor')} value={this.state.sandboxColor} style={{minHeight: 32, maxWidth: '100%'}}
                    onChange={event => this.setState({sandboxColor: event.target.value})}>
                    {Object.entries(ARENA_L10N[this.locale].colors).map(([color, title]) => <option key={color} value={color}>{title}</option>)}
                </select>
                <button type="button" style={btn} disabled={!this.state.sandboxSelection}
                    data-testid="bw-spike-sandbox-smaller" onClick={() => this.resizeSandboxSelection(0.8)}>{t('sandboxSmaller')}</button>
                <button type="button" style={btn} disabled={!this.state.sandboxSelection}
                    data-testid="bw-spike-sandbox-larger" onClick={() => this.resizeSandboxSelection(1.25)}>{t('sandboxLarger')}</button>
                <select aria-label={t('sandboxContact')} value={this.world.robot.contactModel}
                    data-testid="bw-spike-sandbox-contact" onChange={event => this.setSandbox(sandboxWorld({...this.world,
                        robot: {...this.world.robot, contactModel: event.target.value}}))}>
                    {['stall', 'slip'].map(value => <option key={value} value={value}>{t(`contact.${value}`)}</option>)}
                </select>
                <button type="button" style={btn} data-testid="bw-spike-sandbox-save" onClick={() => this.exportSandbox()}>{t('sandboxSave')}</button>
                <button type="button" style={btn} onClick={() => this.sandboxFile.current.click()}>{t('sandboxOpen')}</button>
                <input ref={this.sandboxFile} type="file" accept=".json,application/json" style={{display: 'none'}}
                    data-testid="bw-spike-sandbox-file" onChange={event => this.importSandbox(event)} />
                <button type="button" style={btn} onClick={() => this.setSandbox(sandboxWorld({mat: {width: 180, height: 120, background: 'white'},
                    start: {x: 30, y: 40, heading: 0}}))}>{t('sandboxClear')}</button>
            </div>
        );
    }

    /** Opens the 3D view: loads its chunk once, then builds it for the current world. */
    async openView3D () {
        const token = this.view3dToken = {};
        this.setState({view: '3d', view3dState: 'loading', view3dMessage: ''});
        let loaded = this.view3dModule;
        if (!loaded) {
            try {
                loaded = await import(/* webpackChunkName: "bw-arena-3d" */ '../../lib/spike-arena/arena-view3d.js');
            } catch (error) {
                if (token === this.view3dToken) this.fallback2D(this.t('view3dFailed', {error: error.message}));
                return;
            }
            this.view3dModule = loaded;
        }
        if (token === this.view3dToken) this.mountView3D();
    }

    mountView3D () {
        const loaded = this.view3dModule;
        const box = this.view3dBox.current;
        if (!loaded || !box || !this.bridge || !this.world) return;
        this.disposeView3D();
        try {
            this.view3d = loaded.createArenaView3D({
                container: box, world: this.world, robot: this.bridge.robot, mode: this.state.cameraMode,
                onContextLost: () => this.fallback2D(this.t('view3dFailed', {error: 'WebGL context lost'}))
            });
            this.view3d.canvas.setAttribute('aria-label', this.t('canvas3dLabel'));
        } catch (error) {
            this.fallback2D(error && error.code === 'no-webgl' ? this.t('webglUnavailable') :
                this.t('view3dFailed', {error: error && error.message}));
            return;
        }
        this.setState({view3dState: 'webgl'}, () => this.draw());
    }

    /** Back to 2D because the 3D view cannot run here; the message says why. */
    fallback2D (message) {
        this.view3dToken = null;
        this.disposeView3D();
        this.setState({view: '2d', view3dState: 'fallback', view3dMessage: message}, () => this.draw());
    }

    closeView3D () {
        this.view3dToken = null;
        this.disposeView3D();
        this.setState({view: '2d', view3dState: 'off', view3dMessage: ''}, () => this.draw());
    }

    disposeView3D () {
        if (!this.view3d) return;
        try { this.view3d.dispose(); } catch { /* a lost context may already be gone */ }
        this.view3d = null;
    }

    toggleView () {
        if (this.state.view === '3d') this.closeView3D();
        else this.openView3D();
    }

    setCameraMode (mode) {
        this.setState({cameraMode: mode});
        if (this.view3d) this.view3d.setMode(mode);
    }

    get vm () { return this.props.vm || null; }

    spikeLoaded () {
        const vm = this.vm;
        return Boolean(vm && vm.extensionManager && vm.extensionManager.isExtensionLoaded('spikeprime'));
    }

    /** Connects the spikeprime blocks to the virtual hub over Web Bluetooth, picking it without a chooser. */
    async connect () {
        const vm = this.vm;
        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions.spikeprime;
        if (!peripheral) throw new Error('spikeprime has no peripheral');
        await connectVirtualSpike({host: window, hubState: this.hubState,
            connected: () => vm.getPeripheralIsConnected('spikeprime'),
            disconnect: () => vm.disconnectPeripheral('spikeprime'),
            connect: async () => {
                if (typeof peripheral.setMode === 'function') peripheral.setMode('web-ble');
                await peripheral.scan();
            }});
    }

    nativeCapabilities () {
        if (this.props.renodeCapabilities) return this.props.renodeCapabilities;
        if (this._nativeCapabilities) return this._nativeCapabilities;
        const internals = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
        this._nativeCapabilities = createNativeRenodeCapabilities({
            invoke: typeof internals?.invoke === 'function' ? internals.invoke.bind(internals) : null
        });
        return this._nativeCapabilities;
    }

    // New MicroPython selection glue: BSD-3-Clause, (c) 2026 Brickwright contributors.
    async chooseMicroPythonImage () {
        const choose = this.nativeCapabilities()?.['renode.spike.micropython.image.choose'];
        if (!choose) throw new Error(this.locale === 'de' ? 'MicroPython benötigt das Desktop-Paket.' : 'MicroPython requires the desktop package.');
        this.setState({microImageSelected: false, status: 'choosing', message: this.locale === 'de' ? 'Lokales MicroPython-Anwendungsimage auswählen…' : 'Choose a local MicroPython application image…'});
        try {
            const result = await choose({});
            if (this.disposed || this.state.execution !== 'micropython') return false;
            if (!['selected', 'cancelled'].includes(result)) throw new Error('Unexpected image selection result');
            this.setState({microImageSelected: result === 'selected', status: 'ready', message: result === 'selected' ?
                (this.locale === 'de' ? 'Image ausgewählt. Python im Code-Tab ausführen.' : 'Image selected. Run Python from the Code tab.') :
                (this.locale === 'de' ? 'Image-Auswahl abgebrochen.' : 'Image selection cancelled.')});
            return result === 'selected';
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: error.message});
            throw error;
        }
    }

    firmwareProgramObserver (session, onProgramState) {
        return (programState, storageSupported, runtimeError) => {
            if (this.disposed || this.firmwareSession !== session) return;
            onProgramState(programState, storageSupported, runtimeError);
            this.setState({programState, storageSupported, status: programState === 2 ? 'running' : 'paused',
                ...(programState === 5 ? {message: this.locale === 'de' ? `Firmware-Programm fehlgeschlagen (${runtimeError}). Gespeichertes Programm laden oder aktuellen Code starten.` : `Firmware program failed (${runtimeError}). Load a saved program or run current code to recover.`} : {})});
        };
    }

    firmwareStoppedObserver (session, backend, program, onStopped) {
        return () => {
            onStopped();
            if (!this.disposed && this.firmwareSession === session) {
                this.firmwareSession = null;
                this.setState({execution: backend === 'micropython' ? 'micropython' : backend === 'nuttx' ? 'nuttx' : program ? 'program' : 'renode', status: 'paused'});
            }
        };
    }

    firmwareErrorObserver (session, onError) {
        return error => {
            if (this.disposed || this.firmwareSession !== session) return;
            this.firmwareSession = null;
            this.setState({status: 'failed', message: error.message});
            onError(error);
        };
    }

    firmwareStartedState (session, message) {
        if (this.disposed || this.firmwareSession !== session) return;
        if ([0, 1, 3, 4, 5].includes(session.programState)) {
            const messages = this.locale === 'de' ? {
                0: 'Kein Firmware-Programm geladen.', 1: 'Firmware-Programm bereit.',
                3: 'Firmware-Programm abgeschlossen.', 4: 'Programm gestoppt.'
            } : {0: 'No firmware program loaded.', 1: 'Firmware program ready.',
                3: 'Firmware program completed.', 4: 'Program stopped.'};
            this.setState({status: 'paused', message: messages[session.programState] || this.state.message});
        } else this.setState({status: 'running', message});
    }

    async startFirmware (program = null, {source = null, onOutput = () => {}, onCompleted = () => {}, onError = () => {}, onProgramState = () => {}, onStopped = () => {}} = {}) {
        if (this.disposed) throw new Error("The arena pane is closed");
        if (!this.bridge) return;
        const micro = this.state.execution === 'micropython';
        if (micro && (source === null || program)) throw new Error(this.locale === 'de' ? 'Python im Code-Tab ausführen.' : 'Run Python from the Code tab.');
        const topology = this.state.topology;
        if (this.firmwareSession && (this.firmwareSession.topology || 'default') !== topology) {
            throw new Error(this.locale === 'de' ? 'Diese Firmware-Sitzung vor dem Gerätewechsel schließen.' : 'Close this firmware session before changing devices.');
        }
        if (topology === 'six-motors' && (!this.state.sandbox || !['nuttx', 'micropython'].includes(this.state.execution))) {
            throw new Error(this.locale === 'de' ? 'Sechs Motoren benötigen NuttX oder MicroPython im Sandkasten.' :
                'Six motors require NuttX or MicroPython in the sandbox.');
        }
        // Compile before stopping a running session: unsupported blocks never run a demo.
        if (['program', 'nuttx'].includes(this.state.execution) && !program && source === null) program = compileFirmwareProgram(this.vm, {topology});
        if (source !== null) (micro ? encodeSource : encodePython)(source);
        if (program) encodeInstructions(program, {topology});
        if (this.firmwareSession?.storageSupported && (source !== null || this.state.execution === 'nuttx')) {
            const session = this.firmwareSession;
            session.onOutput = onOutput;
            session.onProgramState = this.firmwareProgramObserver(session, onProgramState);
            session.onStopped = this.firmwareStoppedObserver(session, 'nuttx', program, onStopped);
            session.onError = this.firmwareErrorObserver(session, onError);
            session.onCompleted = () => { onCompleted(); if (!this.disposed && this.firmwareSession === session) this.setState({message: this.locale === 'de' ? 'Firmware-Programm abgeschlossen.' : 'Firmware program completed.'}); };
            this.setState({status: 'starting', message: this.locale === 'de' ? 'Aktueller Code wird in die laufende Firmware geladen…' : 'Uploading current code to the live firmware…'});
            try {
                await session.uploadProgram(program, source);
                this.firmwareStartedState(session, this.locale === 'de' ? 'Aktueller Code geladen; läuft in der ARM-Firmware.' : 'Current code uploaded and running in ARM firmware.');
            } catch (error) {
                if (!this.disposed && this.firmwareSession === session) this.setState({status: session.programState === 2 ? 'running' : 'paused', message: error.message});
                throw error;
            }
            return;
        }
        await this.stopProgram();
        if (this.disposed) throw new Error('The arena pane is closed');
        this.hubState.setSimulationEnabled(true);
        if (topology === 'six-motors') this.bridge = new ArenaHubBridge({hubState: this.hubState, world: this.world, robot: {sensors: []}});
        this.bridge.reset();
        const capabilities = this.nativeCapabilities();
        const backend = micro ? 'micropython' : source !== null || this.state.execution === 'nuttx' ? 'nuttx' : 'guest';
        if (micro) this.setState({microImageSelected: false});
        const session = new RenodeArenaSession({bridge: this.bridge, capabilities, backend, topology, program, source, onOutput,
            onCompleted: () => { onCompleted(); if (!this.disposed) this.setState({message: this.locale === 'de' ? 'Firmware-Programm abgeschlossen.' : 'Firmware program completed.'}); },
            onFrame: snapshot => { if (!this.disposed && this.firmwareSession === session) {
                this.setState({status: session.storageSupported && session.programState !== 2 ? 'paused' : 'running', readout: snapshot, verdict: snapshot.verdict}); this.draw();
            } }});
        this.firmwareSession = session;
        session.onProgramState = this.firmwareProgramObserver(session, onProgramState);
        session.onStopped = this.firmwareStoppedObserver(session, backend, program, onStopped);
        session.onError = this.firmwareErrorObserver(session, onError);
        this.setState({status: 'starting', storageSupported: false, programState: null, message: this.locale === 'de' ? 'Simulation wird gestartet…' : 'Starting firmware simulation…'});
        try {
            await session.start();
            this.firmwareStartedState(session, program || source !== null ? (this.locale === 'de' ? 'Code-Programm läuft in der ARM-Firmware.' : 'Code program running in ARM firmware.') : (this.locale === 'de' ?
                'Die eingebaute Fahrdemo läuft.' : 'Running the built-in driving demo.'));
        } catch (error) {
            if (!this.disposed && this.firmwareSession === session) {
                this.firmwareSession = null; this.setState({status: 'failed', message: error.message});
            }
        }
    }

    async programStorage (operation) {
        const session = this.firmwareSession;
        if (!session || this.state.storageBusy) return;
        this.setState({storageBusy: true});
        try {
            await session.storage(operation);
            if (!this.disposed && this.firmwareSession === session) this.setState({status: 'paused',
                message: this.locale === 'de' ? (operation === 'save' ? (session.storagePersistent ? 'Programm für weitere Simulator-Sitzungen gespeichert.' : 'Programm in dieser Simulator-Sitzung gespeichert.') : 'Programm geladen und bereit. Editor-Text unverändert. Zum Ausführen „Geladenes Programm starten“ drücken.') :
                    (operation === 'save' ? (session.storagePersistent ? 'Program saved for future simulator sessions.' : 'Program saved in this simulator session.') : 'Program loaded and ready. Editor text is unchanged. Press Run loaded program to run it.')});
        } catch (error) {
            const messages = this.locale === 'de' ? {
                '-16': 'Programmspeicher beschäftigt. Programm stoppen und kurz warten.',
                '-2': 'Kein gespeichertes Programm vorhanden.',
                '-22': 'Ungültige Programmdaten oder abweichende Programm-ID.',
                '-5': 'Speichern fehlgeschlagen: Flash-Ein-/Ausgabefehler im Simulator.',
                '-74': 'Gespeichertes Programm beschädigt oder ungültig.'
            } : {'-16': 'Program storage is busy; stop the program and wait before trying again.',
                '-2': 'No saved program exists.', '-22': 'Program storage rejected invalid data or a mismatched program ID.',
                '-5': 'Program storage failed: simulator flash I/O error.', '-74': 'Saved program is damaged or invalid.'};
            if (!this.disposed && this.firmwareSession === session) this.setState({message: session.storageUncertain ?
                (this.locale === 'de' ? 'Ergebnis des Programmspeichers unbekannt. Diese Simulator-Sitzung vor dem Fortfahren schließen.' :
                    'Program storage result is unknown. Close this simulator session before continuing.') :
                messages[error.result ?? (/busy/.test(error.message) ? -16 : null)] || (this.locale === 'de' ? `Programmspeicher: ${error.message}` : error.message)});
        } finally { if (!this.disposed) this.setState({storageBusy: false}); }
    }

    async start () {
        const session = this.firmwareSession;
        if (session?.storageSupported && !session.closed &&
            ((session.loaded && session.programState === 1) || [3, 4, 5].includes(session.programState))) {
            this.setState({status: 'starting', message: this.locale === 'de' ? 'Firmware-Programm wird gestartet…' : 'Starting firmware program…'});
            try {
                await (session.programState === 1 ? session.startProgram() : session.restartProgram());
                if (!this.disposed && this.firmwareSession === session && !session.closed && session.programState === 2) {
                    this.setState({status: 'running', message: this.locale === 'de' ? 'Code-Programm läuft in der ARM-Firmware.' : 'Code program running in ARM firmware.'});
                }
            } catch (error) {
                if (error.name !== 'AbortError' && !this.disposed && this.firmwareSession === session && !session.closed) {
                    this.setState({status: session.programState === 2 ? 'running' : 'paused', message: error.message});
                }
            }
            return;
        }
        if (['renode', 'program', 'nuttx'].includes(this.state.execution)) {
            try { return await this.startFirmware(); }
            catch (error) { this.setState({status: 'failed', message: error.message}); return; }
        }
        if (!this.bridge) return;
        if (this.state.status === 'paused' && this.bridge.verdict.status === 'running') {
            this.lastFrame = null;
            // Resuming must not spend time that accrued while paused.
            this.clock.clear();
            if (this.vm) this.clock.install(this.vm.runtime);
            this.setState({status: 'running'});
            return;
        }
        await this.stopProgram();
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

    async stopProgram ({restart = false} = {}) {
        const firmware = this.firmwareSession;
        this.firmwareSession = null;
        if (firmware) await firmware.stop();
        if (this.state.topology === 'six-motors' && this.bridge?.robot.sensors.length === 0 && this.world) {
            this.hubState.setPort('F', 'none');
            this.bridge = new ArenaHubBridge({hubState: this.hubState, world: this.world});
        }
        this.clock.uninstall();
        if (restart) this.setState({status: 'ready'});
        const external = this.hubState?.externalBackend;
        if (external) external.cancel();
        this.hubState.backend.cancel();
        if (this.vm && this.spikeLoaded()) {
            try { this.vm.stopAll(); } catch { /* the VM may be mid-load */ }
        }
        return external?.completion?.catch(() => {});
    }

    async pause () {
        if (this.firmwareSession?.storageSupported) {
            try { await this.firmwareSession.stopProgram(); this.setState({status: 'paused', message: this.locale === 'de' ? 'Programm gestoppt. Speicher verfügbar, sobald die Firmware vollständig angehalten hat.' : 'Program stopped. Storage is available when firmware finishes stopping.'}); }
            catch (error) { this.setState({message: error.message}); }
            return;
        }
        if (this.firmwareSession || this.hubState?.externalBackend) await this.stopProgram();
        this.setState({status: 'paused'});
    }

    async reset () {
        await this.stopProgram();
        if (this.bridge) this.bridge.reset();
        this.setState({status: 'ready', verdict: null, message: ''}, () => this.draw());
    }

    async step () {
        if (!this.bridge) return;
        if (this.state.execution !== 'native') return;
        if (this.hubState?.externalBackend) await this.stopProgram();
        this.advance(STEP_BUTTON_MS);
        this.setState({status: 'paused'});
    }

    async loadReferenceSolution () {
        if (this.state.topology === 'six-motors') {
            this.setState({message: this.locale === 'de' ? 'Lektionsvorlagen benötigen die Standardgeräte mit Sensoren.' : 'Lesson templates require the default devices with sensors.'});
            return;
        }
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
        if (this.disposed) return;
        if (this.bridge && this.state.status === 'running' && (!this.hubState.clockOwner || this.hubState.clockOwner === 'native')) {
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
        // One snapshot, one reader per frame: the 3D view when it is open, else the canvas.
        if (this.view3d && this.bridge && this.state.view === '3d') {
            this.view3d.render(this.bridge.snapshot());
            return;
        }
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
        const {status, challenges, index, verdict, message, hintsOpen, unit, units, view, view3dState, view3dMessage, cameraMode} = this.state;
        const showing3d = view === '3d' && view3dState === 'webgl';
        const world = this.world;
        const decided = verdict && verdict.status !== 'running' ? verdict : null;
        const btn = {padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, minHeight: 32};
        return (
            <div data-testid="bw-spike-arena-pane" style={{display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
                background: '#f8fafc', fontFamily: 'system-ui, sans-serif', color: '#1e293b'}}>
                <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 13, marginRight: 4}}>{t('title')}</strong>
                    <button type="button" style={btn} aria-pressed={Boolean(this.state.sandbox)}
                        data-testid="bw-spike-arena-sandbox" onClick={() => this.openSandbox()}>{t('sandbox')}</button>
                    <button type="button" style={btn} aria-pressed={!this.state.sandbox} disabled={status === 'loading'}
                        data-testid="bw-spike-arena-challenges" onClick={() => this.state.challenges.length ? this.select(index) : this.openUnit(DEFAULT_UNIT)}>{t('challenges')}</button>
                    {this.state.sandbox ? null : <><select value={unit ? unit.id : ''} aria-label={t('unit')} data-testid="bw-spike-arena-unit"
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
                    </>}
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                        {status === 'running' || (status === 'starting' && this.firmwareSession) ? (
                            <button type="button" style={btn} onClick={() => this.pause()} data-testid="bw-spike-arena-stop">{t('stop')}</button>
                        ) : (
                            <button type="button" style={{...btn, background: '#2f9e44', color: '#fff', border: '1px solid #2b8a3e'}}
                                disabled={!world || this.state.execution === 'micropython' || this.state.storageBusy || this.firmwareSession?.uploading || status === 'starting'} onClick={() => this.start()} data-testid="bw-spike-arena-start">{this.firmwareSession?.storageSupported && [3, 4, 5].includes(this.state.programState) ? (this.locale === 'de' ? 'Programm neu starten' : 'Restart program') : this.firmwareSession?.loaded && this.state.programState === 1 ? (this.locale === 'de' ? 'Geladenes Programm starten' : 'Run loaded program') : t('start')}</button>
                        )}
                        <select aria-label={this.locale === 'de' ? 'Ausführung' : 'Execution'} data-testid="bw-spike-arena-execution"
                            value={this.state.execution} disabled={status === 'choosing' || status === 'starting'} onChange={async event => {
                                const execution = event.target.value; await this.stopProgram();
                                if (!this.disposed) this.setState({execution, topology: ['nuttx', 'micropython'].includes(execution) ? this.state.topology : 'default', status: 'ready', message: ''});
                            }}>
                            <option value="native">{this.locale === 'de' ? 'Simulator' : 'Simulator'}</option>
                            <option value="renode" disabled={!this.props.renodeCapabilities && !window.__TAURI_INTERNALS__}>
                                {this.locale === 'de' ? 'Firmware-Demo (Desktop)' : 'Firmware demo (desktop)'}
                            </option>
                            <option value="program" disabled={!this.props.renodeCapabilities && !window.__TAURI_INTERNALS__}>
                                {this.locale === 'de' ? 'Firmware-Programm (Desktop)' : 'Firmware program (desktop)'}
                            </option>
                            <option value="nuttx" disabled={!this.props.renodeCapabilities && !window.__TAURI_INTERNALS__}>
                                {this.locale === 'de' ? 'Vollständiges NuttX (Desktop)' : 'Full NuttX (desktop)'}
                            </option>
                            <option value="micropython" disabled={!this.props.renodeCapabilities && !window.__TAURI_INTERNALS__}>
                                {this.locale === 'de' ? 'MicroPython · lokales Image (Desktop)' : 'MicroPython · local image (desktop)'}
                            </option>
                        </select>
                        {this.state.execution === 'micropython' ? <>
                            <button type="button" style={btn} disabled={Boolean(this.firmwareSession) || ['choosing', 'starting'].includes(status)}
                                data-testid="bw-spike-micropython-image-choose" onClick={() => this.chooseMicroPythonImage().catch(() => {})}>
                                {this.locale === 'de' ? 'Image auswählen…' : 'Choose image…'}
                            </button>
                            <span style={{fontSize: 12}}>{this.locale === 'de' ?
                                'Python im Code-Tab mit einem Image starten, das bwspike enthält.' :
                                'Run Python from the Code tab with an image containing bwspike.'}</span>
                        </> : null}
                        {['nuttx', 'micropython'].includes(this.state.execution) ? <>
                            <select aria-label={this.locale === 'de' ? 'Firmware-Geräte' : 'Firmware devices'} data-testid="bw-spike-nuttx-topology"
                                value={this.state.topology} disabled={Boolean(this.firmwareSession) || status === 'starting'}
                                onChange={event => {
                                    if (this.firmwareSession || this.state.status === 'starting') return;
                                    const topology = event.target.value;
                                    if (topology === 'default' || (topology === 'six-motors' && this.state.sandbox)) this.setState({topology});
                                }}>
                                <option value="default">{this.locale === 'de' ? 'Standard: A/B-Motoren und Sensoren' : 'Default: A/B motors and sensors'}</option>
                                <option value="six-motors" disabled={!this.state.sandbox}>{this.locale === 'de' ? 'Sechs Motoren A–F (Sandkasten)' : 'Six motors A–F (sandbox)'}</option>
                            </select>
                            {this.state.topology === 'six-motors' ? <span style={{fontSize: 12, flex: '1 1 240px'}} data-testid="bw-spike-six-motor-hint">
                                {this.state.execution === 'micropython' ? (this.locale === 'de' ? 'Benötigt ein Image mit bwspike und aktualisierte Simulator-Unterstützung. Motoren A–F über bwspike verwenden. A/B bewegen den Roboter; C–F sind zusätzliche Motoren. Keine Arena-Sensoren.' : 'Requires an image containing bwspike and updated simulator support. Use bwspike for motors A–F. A/B drive the rover; C–F are extra motors. No arena sensors.') : this.locale === 'de' ? 'Benötigt ein NuttX-Paket mit sechs Motoren. Scratch-Motorbefehle unterstützen A–F; Positionsbewegungen verwenden einen Motor. Mehrportbefehle laufen nacheinander, ohne synchronisierten Start. A/B bewegen den Roboter; C–F sind zusätzliche Motoren. Keine Arena-Sensoren.' :
                                    'Requires a six-motor NuttX package. Scratch motor commands support A–F; position moves use one motor. Multiport commands execute sequentially, without synchronized starts. A/B drive the rover; C–F are extra motors. No arena sensors.'}
                            </span> : null}
                        </> : null}
                        {this.state.execution === 'nuttx' ? <>
                            <button type="button" style={btn} data-testid="bw-spike-program-save"
                                disabled={!this.firmwareSession?.storageSupported || this.state.storageBusy || this.firmwareSession?.uploading || ![1, 3, 4].includes(this.state.programState)}
                                onClick={() => this.programStorage('save')}>{this.locale === 'de' ? 'Programm speichern' : 'Save program'}</button>
                            <button type="button" style={btn} data-testid="bw-spike-program-load"
                                disabled={!this.firmwareSession?.storageSupported || this.state.storageBusy || this.firmwareSession?.uploading || this.state.programState === 2}
                                onClick={() => this.programStorage('load')}>{this.locale === 'de' ? 'Programm laden' : 'Load program'}</button>
                            <span style={{fontSize: 12, flex: '1 1 220px', alignSelf: 'center'}} data-testid="bw-spike-program-storage-hint">
                                {this.locale === 'de' ? (this.firmwareSession?.storageSupported ? (this.firmwareSession.storagePersistent ? 'Explizites Speichern bleibt nach dem Schließen dieses Simulators erhalten. Laden startet das Programm nicht automatisch.' : 'Speicher gilt für diese Simulator-Sitzung. Laden startet das Programm nicht.') : 'Speicher erfordert eine laufende NuttX-Sitzung mit Speicherunterstützung.') :
                                    (this.firmwareSession?.storageSupported ? (this.firmwareSession.storagePersistent ? 'Explicit Save survives closing this simulator. Load never runs automatically.' : 'Storage lasts for this live simulator session. Load never runs automatically.') : 'Storage requires a live NuttX package with program storage support.')}
                            </span>
                        </> : null}
                        <button type="button" style={btn} disabled={!world || this.state.execution !== 'native'} onClick={() => this.step()} data-testid="bw-spike-arena-step">{t('step')}</button>
                        <button type="button" style={btn} disabled={!world} onClick={() => this.reset()} data-testid="bw-spike-arena-reset">{t('reset')}</button>
                        <button type="button" style={btn} disabled={!world} onClick={() => this.toggleView()}
                            aria-pressed={view === '3d'} title={t('viewToggleTitle')} data-testid="bw-spike-arena-view-toggle">
                            {view === '3d' ? t('view2d') : t('view3d')}
                        </button>
                        {view === '3d' ? (
                            <select value={cameraMode} aria-label={t('camera')} data-testid="bw-spike-arena-camera"
                                onChange={e => this.setCameraMode(e.target.value)} style={{minHeight: 32, maxWidth: '100%'}}>
                                <option value="orbit">{t('cameraOrbit')}</option>
                                <option value="follow">{t('cameraFollow')}</option>
                                <option value="top">{t('cameraTop')}</option>
                            </select>
                        ) : null}
                    </div>
                </div>
                {this.renderSandboxTools(btn)}
                {world ? (
                    <div style={{padding: '8px 10px 0', fontSize: 13, lineHeight: 1.45}} data-testid="bw-spike-arena-intro">
                        {localText(world.intro, this.locale)}
                        {this.state.sandbox ? null : <><div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6}}>
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
                        {this.renderStages(world)}</>}
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
                {view3dMessage || view3dState === 'loading' ? (
                    <div role="status" style={{margin: '6px 10px 0', fontSize: 12, color: view3dMessage ? '#9a3412' : '#64748b'}}
                        data-testid="bw-spike-arena-3d-message">
                        {view3dMessage || t('view3dLoading')}
                    </div>
                ) : null}
                <div ref={this.box} style={{padding: 10}}>
                    <canvas ref={this.canvas} role="img" aria-label={t('canvasLabel')} data-testid="bw-spike-arena-canvas"
                        onClick={event => this.sandboxTap(event)} onPointerDown={this.sandboxPointerDown}
                        onPointerUp={this.sandboxPointerUp} onPointerCancel={() => { this.sandboxDrag = null; }}
                        hidden={showing3d}
                        style={{width: '100%', display: showing3d ? 'none' : 'block', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.25)'}} />
                    <div ref={this.view3dBox} data-testid="bw-spike-arena-3d" data-state={view3dState}
                        style={{display: showing3d ? 'block' : 'none', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.25)'}} />
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
