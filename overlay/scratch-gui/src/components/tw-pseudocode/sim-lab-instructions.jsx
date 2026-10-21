// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's building instructions: the model on show (a shipped example
// or one built in Build) as the pages of a LEGO manual. The step order is
// lib/bw-sim/instructions/steps.js's, the 3D picture view/instructions-view.js's,
// the part pictures in the "parts needed" callout view/part-thumbnails.js's
// (the Build palette's), all from the Sim Lab chunk the pane already loaded
// (`lib`). Previous / Next and the ← → keys turn the pages; the last page is
// the parts list. "Print / Save as PDF" draws every step into one printable
// page (instructions/print-page.js) in a new window and calls its print().
// Words: sim-lab-instructions-text.js.

import React from 'react';
import {INSTRUCTIONS_TEXT} from './sim-lab-instructions-text.js';

/** A page that looks from another corner than the page before (instructions/steps.js stepCorner), in the same assembly. */
const turnedFrom = (step, before) => Boolean(before && step.view && before.view && step.subassembly === before.subassembly &&
    (step.view[0] !== before.view[0] || step.view[1] !== before.view[1]));

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
/** Size of a printed step picture (px). */
const PRINT_W = 1200;
const PRINT_H = 800;
const THUMB_CSS_PX = 52;

class SimLabInstructions extends React.Component {
    constructor (props) {
        super(props);
        this.text = INSTRUCTIONS_TEXT[props.locale] || INSTRUCTIONS_TEXT.en;
        this.state = {status: 'loading', page: 0, message: '', printing: false};
        this.box = React.createRef();
        this.dialog = React.createRef();
        this.onKey = this.onKey.bind(this);
        this.onResize = this.onResize.bind(this);
        this.plan = null;
        this.view = null;
        this.thumbs = null;
    }

    async componentDidMount () {
        const pane = this;
        window.__bwSimLabInstructions = {
            get status () { return pane.state.status; },
            get page () { return pane.state.page; },
            get steps () { return pane.plan ? pane.plan.steps.length : 0; },
            get plan () { return pane.plan; },
            get stats () { return pane.view ? pane.view.stats() : null; },
            get printing () { return pane.state.printing; }
        };
        // Capture: the pages take ← → and Esc before the Scratch stage hears them as key presses.
        window.addEventListener('keydown', this.onKey, true);
        window.addEventListener('resize', this.onResize);
        this.dialog.current?.focus();
        const {lib, model} = this.props;
        const {buildSteps, fetchModelDrawing, parseLDConfig, createInstructionsView, createPartThumbnails, CATALOG, DEFAULT_COLOR} = lib;
        this.plan = buildSteps(model, CATALOG);
        if (!this.plan.steps.length) {
            this.setState({status: 'empty'});
            return;
        }
        try {
            // The parts, the decoration (a cable's segments) and the model's own embedded parts.
            const {read} = await fetchModelDrawing(model, {withConfig: true});
            if (this.disposed) return;
            const colors = parseLDConfig(read('ldconfig.ldr'));
            this.view = createInstructionsView({container: this.box.current, model, plan: this.plan, read, colors, catalog: CATALOG});
            // Callout pictures: null without WebGL (the callout then shows names).
            this.thumbs = createPartThumbnails({read, colors, color: DEFAULT_COLOR});
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: fill(this.text.failed, {error: error.message})});
            return;
        }
        this.setState({status: 'ready'}, () => this.showPage(0));
    }

    componentWillUnmount () {
        this.disposed = true;
        window.removeEventListener('keydown', this.onKey, true);
        window.removeEventListener('resize', this.onResize);
        if (this.view) { try { this.view.dispose(); } catch { /* a lost context may already be gone */ } }
        if (this.thumbs) { try { this.thumbs.dispose(); } catch { /* as above */ } }
        this.view = null;
        this.thumbs = null;
        delete window.__bwSimLabInstructions;
    }

    /** Pages: one per step, then the parts list. */
    pageCount () {
        return this.plan ? this.plan.steps.length + 1 : 0;
    }

    showPage (page) {
        const last = this.pageCount() - 1;
        const next = Math.max(0, Math.min(last, page));
        this.setState({page: next}, () => {
            if (this.view && next < this.plan.steps.length) {
                this.view.resize();
                this.view.show(next);
                this.view.canvas.setAttribute('aria-label', fill(this.text.canvasLabel, {n: next + 1, total: this.plan.steps.length}));
            }
        });
    }

    onKey (event) {
        const turn = {ArrowRight: 1, ArrowLeft: -1}[event.key];
        if (event.key !== 'Escape' && event.key !== 'Home' && event.key !== 'End' && !turn) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') this.props.onClose();
        else if (this.state.status === 'ready') this.showPage(event.key === 'Home' ? 0 : event.key === 'End' ? this.pageCount() - 1 : this.state.page + turn);
    }

    onResize () {
        if (this.view && this.state.page < this.plan.steps.length) this.view.resize();
    }

    /** Callout or parts-list rows for some part ids, each with its picture in the part's colour. */
    rows (ids) {
        const {lib, model, locale} = this.props;
        return lib.partsList(model, lib.CATALOG, ids).map(row => ({...row,
            label: (locale === 'de' ? row.name.de : row.name.en) || row.name.en,
            thumb: this.thumbs ? this.thumbs.render(row.part, row.color) : null}));
    }

    groupName (id) {
        return this.plan.groups.find(g => g.id === id)?.name || id;
    }

    /** Every step drawn to a picture, written into a new window, and printed. */
    async printAll () {
        // Opened at once, inside the click: a window opened later is a pop-up the browser blocks.
        const win = window.open('', '_blank');
        if (!win) {
            this.setState({message: this.text.printBlocked});
            return;
        }
        this.setState({printing: true, message: ''});
        const {lib, locale} = this.props;
        const T = this.text;
        const cell = row => ({thumb: row.thumb, count: row.count, length: row.length, name: row.label, part: row.part});
        const steps = this.plan.steps.map((step, i) => ({
            image: this.view.image(i, PRINT_W, PRINT_H),
            parts: this.rows(step.parts).map(cell),
            attach: step.attach.map(id => this.groupName(id)),
            subassembly: step.subassembly ? this.groupName(step.subassembly) : null,
            pins: Boolean(step.pins),
            turned: turnedFrom(step, this.plan.steps[i - 1])
        }));
        const html = lib.instructionsPrintHtml({lang: locale === 'de' ? 'de' : 'en',
            title: fill(T.documentTitle, {name: this.props.title || T.title}),
            text: {step: T.step, partsNeeded: T.partsNeeded, partsList: T.partsList, total: T.total, attach: T.attach, subassembly: T.subassembly, pins: T.pins,
                turned: T.turned},
            steps, bom: this.rows(this.props.model.parts.map(p => p.id)).map(cell)});
        win.document.open();
        win.document.write(html);
        win.document.close();
        await Promise.all([...win.document.images].map(img => (img.decode ? img.decode().catch(() => null) : null)));
        if (!this.disposed) this.setState({printing: false});
        if (!win.closed) {
            win.focus();
            win.print();
        }
    }

    renderPart (row, withName) {
        return (
            <div key={`${row.part}@${row.color}`} data-testid="bw-sim-instructions-part" data-part={row.part} data-count={row.count}
                title={row.label} style={{display: 'flex', alignItems: 'center', gap: 6, flexDirection: withName ? 'row' : 'column'}}>
                <div style={{position: 'relative', width: THUMB_CSS_PX, height: THUMB_CSS_PX, flex: 'none'}}>
                    {row.thumb ? <img src={row.thumb} alt="" width={THUMB_CSS_PX} height={THUMB_CSS_PX} /> :
                        <span style={{fontSize: 10, color: '#475569'}}>{row.label}</span>}
                    {row.length && (
                        <span aria-label={fill(this.text.lengthLabel, {n: row.length})} data-testid="bw-sim-instructions-length"
                            style={{position: 'absolute', right: -4, bottom: -2, width: 20, height: 20, borderRadius: '50%',
                                border: '2px solid #0f172a', background: '#fff', fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'}}>
                            {row.length}
                        </span>
                    )}
                </div>
                <span style={{fontWeight: 700}}>{row.count}×</span>
                {withName && <span style={{fontSize: 12}}>{row.label}</span>}
            </div>
        );
    }

    renderStepAside (step, before) {
        const T = this.text;
        const notes = [
            ...(turnedFrom(step, before) ? [T.turned] : []),
            ...(step.subassembly ? [fill(T.subassembly, {name: this.groupName(step.subassembly)})] : []),
            ...step.attach.map(id => fill(T.attach, {name: this.groupName(id)})),
            ...(step.loose ? [step.parts.every(id => this.props.model.parts.find(p => p.id === id)?.load) ? T.payload : T.loose] : []),
            ...(step.pins ? [T.pins] : [])
        ];
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: 8, width: 200, flex: 'none'}}>
                {notes.map(note => <div key={note} data-testid="bw-sim-instructions-note" style={{fontSize: 13, fontWeight: 600, color: '#1e3a8a'}}>{note}</div>)}
                {step.parts.length > 0 && (
                    <div data-testid="bw-sim-instructions-callout"
                        style={{background: '#e0f2fe', border: '2px solid #7dd3fc', borderRadius: 8, padding: 8,
                            display: 'flex', flexWrap: 'wrap', gap: 10}}>
                        <div style={{width: '100%', fontSize: 12, fontWeight: 600, color: '#075985'}}>{T.partsNeeded}</div>
                        {this.rows(step.parts).map(row => this.renderPart(row, false))}
                    </div>
                )}
            </div>
        );
    }

    renderPartsList () {
        const rows = this.rows(this.props.model.parts.map(p => p.id));
        return (
            <div data-testid="bw-sim-instructions-bom" style={{flex: '1 1 auto', overflow: 'auto'}}>
                <div style={{fontSize: 13, marginBottom: 8}}>{fill(this.text.total, {n: rows.reduce((n, r) => n + r.count, 0)})}</div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12}}>
                    {rows.map(row => this.renderPart(row, true))}
                </div>
            </div>
        );
    }

    render () {
        const T = this.text;
        const {status, page, message, printing} = this.state;
        const steps = this.plan ? this.plan.steps : [];
        const onStep = status === 'ready' && page < steps.length;
        const onList = status === 'ready' && page === steps.length;
        const button = {padding: '5px 12px', borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer', fontSize: 13};
        const counter = onList ? T.partsList : fill(T.counter, {n: page + 1, total: steps.length});
        return (
            <div style={{position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div ref={this.dialog} role="dialog" aria-modal="true" aria-label={T.title} tabIndex={-1} data-testid="bw-sim-instructions"
                    data-status={status} data-page={page}
                    style={{width: 'min(1100px, 96vw)', height: 'min(760px, 94vh)', background: '#fff', borderRadius: 10, padding: 14,
                        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, outline: 'none',
                        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.35)'}}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
                        <strong style={{fontSize: 18}}>{T.title}</strong>
                        <span style={{fontSize: 12, color: '#475569', flex: '1 1 auto'}}>
                            {T.intro}{this.plan ? ` ${this.plan.source === 'meta' ? T.fromFile : T.derived}.` : ''}
                        </span>
                        <button type="button" style={button} data-testid="bw-sim-instructions-close" onClick={() => this.props.onClose()}>{T.close}</button>
                    </div>
                    {message && <div role="alert" data-testid="bw-sim-instructions-message" style={{fontSize: 12, color: '#b91c1c'}}>{message}</div>}
                    {status === 'loading' && <div role="status" style={{fontSize: 13}}>{T.loading}</div>}
                    {status === 'empty' && <div role="status" style={{fontSize: 13}}>{T.empty}</div>}
                    <div style={{display: 'flex', gap: 12, flex: '1 1 auto', minHeight: 0}}>
                        {onStep && this.renderStepAside(steps[page], steps[page - 1])}
                        <div ref={this.box} data-testid="bw-sim-instructions-view"
                            style={{flex: '1 1 auto', minHeight: 0, minWidth: 0, display: onList || status === 'empty' ? 'none' : 'block'}} />
                        {onList && this.renderPartsList()}
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <button type="button" style={button} data-testid="bw-sim-instructions-prev"
                            disabled={status !== 'ready' || page === 0} onClick={() => this.showPage(page - 1)}>◀ {T.previous}</button>
                        <span role="status" data-testid="bw-sim-instructions-counter" style={{fontSize: 18, fontWeight: 700, minWidth: 90, textAlign: 'center'}}>
                            {status === 'ready' ? counter : ''}
                        </span>
                        <button type="button" style={button} data-testid="bw-sim-instructions-next"
                            disabled={status !== 'ready' || page >= steps.length} onClick={() => this.showPage(page + 1)}>{T.next} ▶</button>
                        <span style={{fontSize: 12, color: '#475569', flex: '1 1 auto'}}>{T.keys}</span>
                        <button type="button" style={button} data-testid="bw-sim-instructions-print" title={T.printHelp}
                            disabled={status !== 'ready' || printing} onClick={() => this.printAll()}>
                            {printing ? T.printing : T.print}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default SimLabInstructions;
