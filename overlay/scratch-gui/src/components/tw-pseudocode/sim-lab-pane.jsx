// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab (beta): a LEGO model built from real parts, simulated with
// physics, driven by the virtual SPIKE hub that every programming route
// already talks to (docs/SIM-LAB-PLAN.md). This pane only loads a model,
// runs the clock and shows the 3D view; everything else is in lib/bw-sim,
// reached through ONE dynamic import so the first load does not grow.
//
// One clock (docs/SPIKE-ARENA.md): while the Sim Lab runs, its session owns
// the hub's motor clock; the arena is not mounted at the same time (the
// simulator pane shows one or the other).
//
// The model is saved with the project (C8) the way every other Brickwright
// surface is (lib/bw-project-bundle.js): one localStorage key, carried as the
// bundle's `simLab` section. On `bw-project-bundle-collect` the pane writes
// the model it shows; on mount and on `bw-project-bundle-loaded` it opens the
// stored one. While the pane is not mounted the key simply keeps what the
// project load put there, so nothing is lost and nothing is pending.

import React from 'react';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
import {SIM_LAB_STORAGE_KEY, simLabRecordFromText, readSimLabStorage, isStorableName} from '../../lib/bw-sim/model/sim-lab-persist.js';

const TEXT = {
    en: {
        title: 'Sim Lab (beta)',
        intro: 'A model from real LEGO® Technic parts with physics. Write a SPIKE Prime program (ports A and B drive the wheels) and press Run: it starts on the green flag.',
        model: 'Model', importModel: 'Open .ldr…', run: 'Run', pause: 'Pause', reset: 'Reset',
        loading: 'Loading the model and the physics engine…', ready: 'Ready', running: 'Running', paused: 'Paused',
        failed: 'Could not load the model: {error}', noWebgl: 'This browser cannot show the 3D view ({error}). The simulation still runs.',
        connectFailed: 'Could not connect the program to the virtual hub: {error}',
        issues: 'Notes about this model', time: 'Simulated time: {s} s', canvasLabel: '3D view of the simulated model',
        simulate: 'Simulate', build: 'Build', parts: 'Parts', undo: 'Undo', redo: 'Redo', remove: 'Delete',
        save: 'Save .ldr', port: 'Port', none: 'none', placing: 'Placing {part}: click to place, R turns, Esc stops',
        buildHelp: 'Pick a part, move it over the model: it snaps green onto a matching hole or axle, blue on the floor. Click a part to select it.'
    },
    de: {
        title: 'Sim-Labor (Beta)',
        intro: 'Ein Modell aus echten LEGO®-Technic-Teilen mit Physik. Schreibe ein SPIKE-Prime-Programm (Ports A und B treiben die Räder an) und drücke Start: es beginnt mit der grünen Flagge.',
        model: 'Modell', importModel: '.ldr öffnen…', run: 'Start', pause: 'Pause', reset: 'Zurücksetzen',
        loading: 'Modell und Physik-Engine werden geladen…', ready: 'Bereit', running: 'Läuft', paused: 'Pausiert',
        failed: 'Das Modell konnte nicht geladen werden: {error}', noWebgl: 'Dieser Browser kann die 3D-Ansicht nicht zeigen ({error}). Die Simulation läuft trotzdem.',
        connectFailed: 'Das Programm konnte nicht mit dem virtuellen Hub verbunden werden: {error}',
        issues: 'Hinweise zu diesem Modell', time: 'Simulierte Zeit: {s} s', canvasLabel: '3D-Ansicht des simulierten Modells',
        simulate: 'Simulieren', build: 'Bauen', parts: 'Teile', undo: 'Rückgängig', redo: 'Wiederholen', remove: 'Löschen',
        save: '.ldr speichern', port: 'Port', none: 'keiner', placing: '{part} platzieren: klicken setzt, R dreht, Esc beendet',
        buildHelp: 'Wähle ein Teil und bewege es über das Modell: grün rastet es an einem passenden Loch oder einer Achse ein, blau liegt es auf dem Boden. Klicke ein Teil an, um es auszuwählen.'
    }
};

/** Longest step the pane hands the physics per frame: a backgrounded tab must not jump seconds ahead. */
const MAX_FRAME_MS = 50;
/** The `0 <title>` line every model the pane writes carries (it is not parsed back, so it must not vary). */
const MODEL_TITLE = 'Sim Lab model';

class SimLabPane extends React.Component {
    constructor (props) {
        super(props);
        const locale = pickLocale(props.locale || browserLocale(), TEXT);
        this.locale = locale;
        this.text = TEXT[locale];
        this.state = {status: 'loading', message: '', issues: [], modelFile: null, simMs: 0, view3d: 'loading',
            mode: 'simulate', placing: null, selected: null, editorTick: 0, mat: null};
        this.box = React.createRef();
        this.file = React.createRef();
        this.lib = null;
        this.session = null;
        this.view = null;
        this.frame = this.frame.bind(this);
        this.onBundleCollect = this.onBundleCollect.bind(this);
        this.onBundleLoaded = this.onBundleLoaded.bind(this);
        this.last = null;
    }

    t (key, values = {}) {
        return this.text[key].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
    }

    async componentDidMount () {
        window.__bwSimLab = {
            get status () { return this._pane.state.status; },
            get issues () { return this._pane.state.issues; },
            get snapshot () { return this._pane.session ? this._pane.session.snapshot() : null; },
            get view3d () { return this._pane.state.view3d; },
            get mode () { return this._pane.state.mode; },
            get editor () { return this._pane.editor || null; },
            get editView () { return this._pane.editView || null; },
            get projectRecord () { return this._pane.currentRecord(); },
            _pane: this
        };
        window.addEventListener('bw-project-bundle-collect', this.onBundleCollect);
        window.addEventListener('bw-project-bundle-loaded', this.onBundleLoaded);
        try {
            this.lib = await import(/* webpackChunkName: "bw-sim-lab" */ '../../lib/bw-sim/sim-lab.js');
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.frame);
        await this.openStored();
    }

    componentWillUnmount () {
        // Flush first: a Build-mode edit made just before switching to the arena
        // tab must still be in the next save.
        this.onBundleCollect();
        window.removeEventListener('bw-project-bundle-collect', this.onBundleCollect);
        window.removeEventListener('bw-project-bundle-loaded', this.onBundleLoaded);
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.teardown();
        this.teardownEditor();
        if (window.__bwSimLab && window.__bwSimLab._pane === this) delete window.__bwSimLab;
    }

    teardownEditor () {
        if (this.editView) { try { this.editView.dispose(); } catch { /* a lost context may already be gone */ } }
        this.editView = null;
        this.editor = null;
    }

    /** Build mode: the current model (or an empty one) in the editor. */
    async enterBuild () {
        const {createEditor, createEditorView3D, fetchLDrawClosure, parseLDConfig, CATALOG} = this.lib;
        const model = this.session ? this.session.model : {version: 1, parts: []};
        this.pause();
        this.teardown();
        this.teardownEditor();
        this.setState({mode: 'build', status: 'loading', message: '', placing: null, selected: null});
        // Any palette part may be placed, so load the whole catalog's geometry once.
        if (!this.catalogFiles) this.catalogFiles = await fetchLDrawClosure([...CATALOG.keys()], {withConfig: true});
        if (this.disposed) return;
        const {read} = this.catalogFiles;
        this.editor = createEditor({model, catalog: CATALOG});
        try {
            this.editView = createEditorView3D({container: this.box.current, read, colors: parseLDConfig(read('ldconfig.ldr')),
                catalog: CATALOG, editor: this.editor,
                onSelect: selected => this.setState({selected}),
                onChange: () => this.setState(s => ({editorTick: s.editorTick + 1}))});
        } catch (error) {
            this.setState({status: 'failed', message: this.t('noWebgl', {error: error.message})});
            return;
        }
        this.setState({status: 'ready'});
    }

    /**
     * The model the pane shows, as the project stores it, or null when there is
     * no model (an empty Build scene). `undefined` means "unknown": the pane is
     * still loading or failed to load, and must not erase what is stored.
     * @returns {object|null|undefined} a sim-lab-persist record
     */
    currentRecord () {
        if (!this.lib) return undefined;
        const model = this.editor ? this.editor.model : this.session?.model;
        if (!model) return undefined;
        // The name is written into the text's `0 Name:` line; one the record could not
        // keep would make the reopened text differ, so such a name is not used at all.
        const name = !this.editor && isStorableName(this.state.modelFile) ? this.state.modelFile : 'my-model.ldr';
        return simLabRecordFromText(this.lib.serializeModel(model, {name, title: MODEL_TITLE}),
            {name, mat: this.state.mat});
    }

    /** Before a save reads the bundle's keys: write the model the pane shows. */
    onBundleCollect () {
        try {
            const record = this.currentRecord();
            if (record) localStorage.setItem(SIM_LAB_STORAGE_KEY, JSON.stringify(record));
            else if (record === null) localStorage.removeItem(SIM_LAB_STORAGE_KEY);
        } catch { /* the Scratch half of the save must survive this */ }
    }

    /** A project was opened: its model (or none) is in storage now. */
    async onBundleLoaded (event) {
        const outcome = event && event.detail && event.detail.outcome;
        if (outcome !== 'loaded' && outcome !== 'legacy') return;
        // Mount reads storage itself once the chunk is in.
        if (!this.lib || this.disposed) return;
        if (this.state.status === 'running') this.pause();
        if (this.editor) {
            this.teardownEditor();
            this.setState({mode: 'simulate', placing: null, selected: null});
        }
        await this.openStored();
    }

    /** Open the project's model, or the default model when the project has none. */
    async openStored () {
        let stored;
        try {
            stored = readSimLabStorage(localStorage.getItem(SIM_LAB_STORAGE_KEY));
        } catch {
            stored = {record: null, refusals: []}; // storage disabled: nothing was restored
        }
        const {record, refusals} = stored;
        this.setState({mat: record && record.mat ? record.mat : null});
        if (record) {
            this.lastText = record.ldraw;
            await this.openText(record.ldraw, record.name || 'my-model.ldr');
        } else {
            await this.openShipped(this.lib.MODELS[0].file);
        }
        if (refusals.length && !this.disposed) this.setState(s => ({issues: [...refusals, ...s.issues]}));
    }

    /** Back to simulation: compile what was built. */
    async exitBuild () {
        const text = this.lib.serializeModel(this.editor.model, {name: 'my-model.ldr', title: MODEL_TITLE});
        this.lastText = text;
        this.teardownEditor();
        this.setState({mode: 'simulate', placing: null, selected: null});
        await this.openText(text, 'my-model.ldr');
    }

    saveLdr () {
        const text = this.lib.serializeModel(this.editor.model, {name: 'my-model.ldr', title: MODEL_TITLE});
        const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-model.ldr';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    teardown () {
        if (this.view) { try { this.view.dispose(); } catch { /* a lost context may already be gone */ } }
        this.view = null;
        if (this.session) this.session.dispose();
        this.session = null;
    }

    async openShipped (file) {
        const response = await fetch(`${this.lib.MODELS_BASE}${file}`);
        if (!response.ok) {
            this.setState({status: 'failed', message: this.t('failed', {error: `HTTP ${response.status}`})});
            return;
        }
        await this.openText(await response.text(), file);
    }

    async openImported (event) {
        const f = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!f) return;
        this.lastText = await f.text();
        await this.openText(this.lastText, f.name);
    }

    async openText (text, name) {
        const token = this.loadToken = {};
        this.teardown();
        this.setState({status: 'loading', message: '', issues: [], modelFile: name, simMs: 0, view3d: 'loading'});
        const {SimSession, fetchLDrawClosure, createSimView3D, CATALOG} = this.lib;
        let result;
        try {
            result = await SimSession.fromText(text, {hubState: this.props.hubState, catalog: CATALOG});
        } catch (error) {
            if (token === this.loadToken) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (token !== this.loadToken || this.disposed) { result.session?.dispose(); return; }
        const {session, issues, model} = result;
        if (!session) {
            this.setState({status: 'failed', issues, message: this.t('failed', {error: issues.at(-1)?.message || ''})});
            return;
        }
        this.session = session;
        let view3d = 'webgl';
        try {
            const {read} = await fetchLDrawClosure([...new Set(model.parts.map(p => p.part))], {withConfig: true});
            if (token !== this.loadToken || this.disposed) return;
            this.view = createSimView3D({container: this.box.current, model, mechanism: session.mechanism, read});
            this.view.canvas.setAttribute('aria-label', this.t('canvasLabel'));
            this.view.render(session.snapshot());
        } catch (error) {
            view3d = 'fallback';
            this.setState({message: this.t('noWebgl', {error: error.message})});
        }
        this.setState({status: 'ready', issues, view3d});
    }

    frame (now) {
        this.raf = requestAnimationFrame(this.frame);
        const dt = this.last === null ? 0 : Math.min(MAX_FRAME_MS, now - this.last);
        this.last = now;
        if (this.editView) { this.editView.render(); return; }
        if (!this.session) return;
        if (this.state.status === 'running' && dt > 0) {
            this.session.tick(dt);
            if (Math.floor(this.session.time / 100) !== Math.floor((this.session.time - dt) / 100)) {
                this.setState({simMs: this.session.time});
            }
        }
        if (this.view) this.view.render(this.session.snapshot());
    }

    spikeLoaded () {
        const vm = this.props.vm;
        return Boolean(vm && vm.extensionManager && vm.extensionManager.isExtensionLoaded('spikeprime'));
    }

    /** As the arena's Start: connect the spikeprime blocks to the shared virtual hub, then green flag. */
    async run () {
        if (!this.session) return;
        const hubState = this.props.hubState;
        hubState.setSimulationEnabled(true);
        this.setState({status: 'running'});
        const vm = this.props.vm;
        if (!this.spikeLoaded()) return;
        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions.spikeprime;
        try {
            const {connectVirtualSpike} = this.lib;
            await connectVirtualSpike({host: window, hubState,
                connected: () => vm.getPeripheralIsConnected('spikeprime'),
                disconnect: () => vm.disconnectPeripheral('spikeprime'),
                connect: async () => {
                    if (typeof peripheral.setMode === 'function') peripheral.setMode('web-ble');
                    await peripheral.scan();
                }});
        } catch (error) {
            this.setState({message: this.t('connectFailed', {error: error.message})});
            return;
        }
        if (this.state.status === 'running') vm.greenFlag();
    }
    pause () {
        if (!this.session) return;
        if (this.spikeLoaded()) { try { this.props.vm.stopAll(); } catch { /* the VM may be mid-load */ } }
        this.props.hubState.backend.cancel();
        this.setState({status: 'paused'});
    }

    async reset () {
        if (!this.session) return;
        this.props.hubState.stopAll?.();
        const name = this.state.modelFile;
        const shipped = this.lib.MODELS.find(m => m.file === name);
        if (shipped) await this.openShipped(shipped.file);
        else if (this.lastText) await this.openText(this.lastText, name);
    }

    renderPalette () {
        const groups = this.lib.paletteFrom(this.lib.CATALOG, {locale: this.locale});
        return (
            <div data-testid="bw-sim-lab-palette" style={{width: 190, flex: '0 0 190px', overflow: 'auto', fontSize: 12, borderRight: '1px solid #e2e8f0', paddingRight: 6}}>
                <div style={{fontWeight: 600, marginBottom: 4}}>{this.text.parts}</div>
                {groups.map(g => (
                    <details key={g.category} open={['hub', 'motor', 'beam', 'pin', 'axle', 'wheel'].includes(g.category)}>
                        <summary>{g.label}</summary>
                        {[...g.parts].sort((x, y) => x.name.localeCompare(y.name, this.locale, {numeric: true})).map(p => (
                            <button key={p.part} type="button" data-testid={`bw-sim-lab-part-${p.part}`}
                                aria-pressed={this.state.placing === p.part}
                                style={{display: 'block', width: '100%', textAlign: 'left', margin: '2px 0', padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
                                    border: '1px solid ' + (this.state.placing === p.part ? '#2563eb' : '#e2e8f0'), background: this.state.placing === p.part ? '#dbeafe' : '#fff'}}
                                onClick={() => {
                                    const next = this.state.placing === p.part ? null : p.part;
                                    this.editView?.setTool(next);
                                    this.setState({placing: next});
                                }}>
                                {p.name}
                            </button>
                        ))}
                    </details>
                ))}
            </div>
        );
    }

    renderBuildBar (button) {
        const editor = this.editor;
        const sel = editor && this.state.selected ? editor.model.parts.find(p => p.id === this.state.selected) : null;
        const meta = sel ? this.lib.CATALOG.get(sel.part) : null;
        const portable = meta && (meta.motor || meta.sensor);
        const name = part => {
            const m = this.lib.CATALOG.get(part);
            return m ? ((this.locale === 'de' && m.nameDe) || m.name) : part;
        };
        return (
            <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12}}>
                <button type="button" style={button} data-testid="bw-sim-lab-undo" disabled={!editor?.canUndo}
                    onClick={() => { editor.undo(); this.setState(s => ({editorTick: s.editorTick + 1})); }}>{this.text.undo}</button>
                <button type="button" style={button} data-testid="bw-sim-lab-redo" disabled={!editor?.canRedo}
                    onClick={() => { editor.redo(); this.setState(s => ({editorTick: s.editorTick + 1})); }}>{this.text.redo}</button>
                <button type="button" style={button} data-testid="bw-sim-lab-delete" disabled={!sel}
                    onClick={() => { editor.apply({type: 'delete', id: sel.id}); this.setState(s => ({selected: null, editorTick: s.editorTick + 1})); }}>{this.text.remove}</button>
                {portable && (
                    <label>{name(sel.part)} · {this.text.port}{': '}
                        <select data-testid="bw-sim-lab-port" value={sel.port || ''}
                            onChange={e => { editor.apply({type: 'setPort', id: sel.id, port: e.target.value || null}); this.setState(s => ({editorTick: s.editorTick + 1})); }}>
                            <option value="">{this.text.none}</option>
                            {['A', 'B', 'C', 'D', 'E', 'F'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                )}
                <button type="button" style={button} data-testid="bw-sim-lab-save" disabled={!editor} onClick={() => this.saveLdr()}>{this.text.save}</button>
                <span role="status" data-testid="bw-sim-lab-build-status" style={{color: '#475569'}}>
                    {this.state.placing ? this.t('placing', {part: name(this.state.placing)}) : this.text.buildHelp}
                </span>
            </div>
        );
    }

    render () {
        const {status, message, issues, simMs, modelFile} = this.state;
        const busy = status === 'loading';
        const button = {padding: '4px 10px', marginRight: 6, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer'};
        return (
            <div data-testid="bw-sim-lab" data-status={status} style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 10, height: '100%', boxSizing: 'border-box'}}>
                <div style={{fontSize: 12, color: '#334155'}}>{this.text.intro}</div>
                <div role="tablist" style={{display: 'flex', gap: 4}}>
                    {['simulate', 'build'].map(mode => (
                        <button key={mode} type="button" role="tab" aria-selected={this.state.mode === mode} disabled={busy || !this.lib}
                            data-testid={`bw-sim-lab-mode-${mode}`} style={{...button, fontWeight: this.state.mode === mode ? 600 : 400}}
                            onClick={() => (mode === 'build' ? this.state.mode !== 'build' && this.enterBuild() : this.state.mode !== 'simulate' && this.exitBuild())}>
                            {this.text[mode]}
                        </button>
                    ))}
                </div>
                {this.state.mode === 'simulate' && <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <label style={{fontSize: 12}}>{this.text.model}{': '}
                        <select data-testid="bw-sim-lab-model" disabled={busy || !this.lib} value={this.lib?.MODELS.some(m => m.file === modelFile) ? modelFile : ''}
                            onChange={e => e.target.value && this.openShipped(e.target.value)}>
                            {this.lib && this.lib.MODELS.map(m => <option key={m.file} value={m.file}>{m.title[this.locale] || m.title.en}</option>)}
                            {modelFile && !this.lib?.MODELS.some(m => m.file === modelFile) && <option value="">{modelFile}</option>}
                        </select>
                    </label>
                    <button type="button" style={button} disabled={busy || !this.lib} onClick={() => this.file.current.click()}>{this.text.importModel}</button>
                    <input ref={this.file} type="file" accept=".ldr,.mpd" style={{display: 'none'}} data-testid="bw-sim-lab-file"
                        onChange={e => this.openImported(e)} />
                    {status === 'running' ?
                        <button type="button" style={button} data-testid="bw-sim-lab-pause" onClick={() => this.pause()}>{this.text.pause}</button> :
                        <button type="button" style={button} data-testid="bw-sim-lab-run" disabled={!this.session || busy} onClick={() => this.run()}>{this.text.run}</button>}
                    <button type="button" style={button} data-testid="bw-sim-lab-reset" disabled={!this.session || busy} onClick={() => this.reset()}>{this.text.reset}</button>
                    <span role="status" data-testid="bw-sim-lab-status" style={{fontSize: 12, color: '#475569'}}>
                        {busy ? this.text.loading : this.text[status] || ''}{this.session ? ` · ${this.t('time', {s: (simMs / 1000).toFixed(1)})}` : ''}
                    </span>
                </div>}
                {message && <div role="alert" data-testid="bw-sim-lab-message" style={{fontSize: 12, color: '#b91c1c'}}>{message}</div>}
                {this.state.mode === 'build' && this.renderBuildBar(button)}
                <div style={{display: 'flex', flex: '1 1 auto', minHeight: 240, gap: 8}}>
                    {this.state.mode === 'build' && this.renderPalette()}
                    <div ref={this.box} data-testid="bw-sim-lab-view" style={{flex: '1 1 auto', minHeight: 240, position: 'relative'}} />
                </div>
                {issues.length > 0 && (
                    <details data-testid="bw-sim-lab-issues" style={{fontSize: 12}}>
                        <summary>{this.text.issues} ({issues.length})</summary>
                        <ul>{issues.map((i, n) => <li key={n} data-code={i.code}>{i.line ? `${i.line}: ` : ''}{i.message}</li>)}</ul>
                    </details>
                )}
            </div>
        );
    }
}

export default SimLabPane;
