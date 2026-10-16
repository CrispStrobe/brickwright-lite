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

import React from 'react';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';

const TEXT = {
    en: {
        title: 'Sim Lab (beta)',
        intro: 'A model from real LEGO® Technic parts with physics. Start a program that uses the virtual SPIKE Prime (ports A and B drive the wheels), then press Run.',
        model: 'Model', importModel: 'Open .ldr…', run: 'Run', pause: 'Pause', reset: 'Reset',
        loading: 'Loading the model and the physics engine…', ready: 'Ready', running: 'Running', paused: 'Paused',
        failed: 'Could not load the model: {error}', noWebgl: 'This browser cannot show the 3D view ({error}). The simulation still runs.',
        issues: 'Notes about this model', time: 'Simulated time: {s} s', canvasLabel: '3D view of the simulated model'
    },
    de: {
        title: 'Sim-Labor (Beta)',
        intro: 'Ein Modell aus echten LEGO®-Technic-Teilen mit Physik. Starte ein Programm für den virtuellen SPIKE Prime (Ports A und B treiben die Räder an) und drücke dann Start.',
        model: 'Modell', importModel: '.ldr öffnen…', run: 'Start', pause: 'Pause', reset: 'Zurücksetzen',
        loading: 'Modell und Physik-Engine werden geladen…', ready: 'Bereit', running: 'Läuft', paused: 'Pausiert',
        failed: 'Das Modell konnte nicht geladen werden: {error}', noWebgl: 'Dieser Browser kann die 3D-Ansicht nicht zeigen ({error}). Die Simulation läuft trotzdem.',
        issues: 'Hinweise zu diesem Modell', time: 'Simulierte Zeit: {s} s', canvasLabel: '3D-Ansicht des simulierten Modells'
    }
};

/** Longest step the pane hands the physics per frame: a backgrounded tab must not jump seconds ahead. */
const MAX_FRAME_MS = 50;

class SimLabPane extends React.Component {
    constructor (props) {
        super(props);
        const locale = pickLocale(props.locale || browserLocale(), TEXT);
        this.locale = locale;
        this.text = TEXT[locale];
        this.state = {status: 'loading', message: '', issues: [], modelFile: null, simMs: 0, view3d: 'loading'};
        this.box = React.createRef();
        this.file = React.createRef();
        this.lib = null;
        this.session = null;
        this.view = null;
        this.frame = this.frame.bind(this);
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
            _pane: this
        };
        try {
            this.lib = await import(/* webpackChunkName: "bw-sim-lab" */ '../../lib/bw-sim/sim-lab.js');
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (this.disposed) return;
        await this.openShipped(this.lib.MODELS[0].file);
        this.raf = requestAnimationFrame(this.frame);
    }

    componentWillUnmount () {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.teardown();
        if (window.__bwSimLab && window.__bwSimLab._pane === this) delete window.__bwSimLab;
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
        if (!this.session) return;
        if (this.state.status === 'running' && dt > 0) {
            this.session.tick(dt);
            if (Math.floor(this.session.time / 100) !== Math.floor((this.session.time - dt) / 100)) {
                this.setState({simMs: this.session.time});
            }
        }
        if (this.view) this.view.render(this.session.snapshot());
    }

    run () { if (this.session) this.setState({status: 'running'}); }
    pause () { if (this.session) this.setState({status: 'paused'}); }

    async reset () {
        if (!this.session) return;
        this.props.hubState.stopAll?.();
        const name = this.state.modelFile;
        const shipped = this.lib.MODELS.find(m => m.file === name);
        if (shipped) await this.openShipped(shipped.file);
        else if (this.lastText) await this.openText(this.lastText, name);
    }

    render () {
        const {status, message, issues, simMs, modelFile} = this.state;
        const busy = status === 'loading';
        const button = {padding: '4px 10px', marginRight: 6, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer'};
        return (
            <div data-testid="bw-sim-lab" data-status={status} style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 10, height: '100%', boxSizing: 'border-box'}}>
                <div style={{fontSize: 12, color: '#334155'}}>{this.text.intro}</div>
                <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
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
                </div>
                {message && <div role="alert" data-testid="bw-sim-lab-message" style={{fontSize: 12, color: '#b91c1c'}}>{message}</div>}
                <div ref={this.box} data-testid="bw-sim-lab-view" style={{flex: '1 1 auto', minHeight: 240}} />
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
