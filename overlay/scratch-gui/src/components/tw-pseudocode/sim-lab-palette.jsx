// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's Build palette, after Tinkercad's shape panel: a grid of part
// pictures (lib/bw-sim/view/part-thumbnails.js, drawn when a tile scrolls into
// view), a search box (EN and DE names, part number), a "Recently used" row,
// and collapsible categories. A tile is clicked to arm the placing tool, or
// pressed and dragged into the 3D view (the pane hands the press to the editor
// view's `pressPalettePart`); a finger scrolls the list up and down (touch-action
// pan-y) and carries a tile sideways into the view. Every string comes from the pane's TEXT table
// (`text`); this component owns no wording.
//
// "+" (where the build may fetch parts, lib.CATALOGUE_PARTS) opens the whole LDraw
// catalogue instead of the palette: a search over ~24,000 parts; "Add" derives the
// part (the pane's onAddCatalogPart, lib/bw-sim/part-meta/catalog-parts.js) and arms it.

import React from 'react';
import SimLabInfo from './sim-lab-info.jsx';

/** Categories open when Build opens (the ones a first robot is made of). */
const OPEN_AT_START = ['mine', 'hub', 'motor', 'beam', 'pin', 'axle', 'wheel'];
const CATALOGUE_THUMB_PX = 40;
const THUMB_CSS_PX = 56;

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
class SimLabPalette extends React.Component {
    constructor (props) {
        super(props);
        // Which categories are open survives a search (which shows a flat list instead).
        this.state = {query: '', open: OPEN_AT_START,
            // the LDraw catalogue view: its list (null until loaded), search, and the add in progress
            catalogue: false, list: null, listError: '', catQuery: '', adding: null, note: null,
            // pictures of catalogue results, drawn when a row comes into view (part -> data URL; undefined while drawing)
            catThumbs: new Map()};
        this.scroller = React.createRef();
        this.observeRow = this.observeRow.bind(this);
        this.catIo = null;
        this.observe = this.observe.bind(this);
        this.sweep = this.sweep.bind(this);
        this.io = null;
    }

    componentDidMount () {
        if (typeof IntersectionObserver === 'function') {
            // A tile asks for its picture once it is (nearly) on screen; a closed category's
            // tiles are not laid out, so they ask when it is opened.
            this.io = new IntersectionObserver(entries => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    this.io.unobserve(e.target);
                    this.props.requestThumb(e.target.dataset.part);
                }
            }, {root: this.scroller.current, rootMargin: '120px 0px'});
            for (const el of this.pending || []) this.io.observe(el);
        }
        this.pending = null;
        // The observer alone missed tiles that were on screen from the start in a palette laid out
        // after it mounted (a side panel sized by the tab): their picture was never asked for. So
        // the tiles in view are also checked whenever the palette scrolls, resizes or re-renders.
        const scroller = this.scroller.current;
        if (scroller) {
            scroller.addEventListener('scroll', this.sweep, {passive: true});
            if (typeof ResizeObserver === 'function') {
                this.resizer = new ResizeObserver(this.sweep);
                this.resizer.observe(scroller);
            }
        }
        this.sweep();
    }

    componentDidUpdate () {
        this.sweep();
    }

    componentWillUnmount () {
        this.unmounted = true;
        if (this.catIo) this.catIo.disconnect();
        this.catIo = null;
        if (this.io) this.io.disconnect();
        this.io = null;
        if (this.resizer) this.resizer.disconnect();
        this.scroller.current?.removeEventListener('scroll', this.sweep);
    }

    /** Asks for the picture of every tile in (or near) view that has none yet. */
    sweep () {
        const scroller = this.scroller.current;
        const thumbs = this.props.thumbs;
        if (!scroller || !thumbs || !scroller.getBoundingClientRect) return;
        const view = scroller.getBoundingClientRect();
        for (const el of scroller.querySelectorAll('[data-part]')) {
            const part = el.dataset.part;
            if (thumbs.has(part)) continue;
            // A closed category draws nothing (its pictures wait until it is opened): a closed <details>
            // may still lay its tiles out (content-visibility), so its state is asked, not its boxes.
            const group = el.closest('details');
            if (group && !group.open) continue;
            const r = el.getBoundingClientRect();
            if (r.height > 0 && r.bottom >= view.top - 120 && r.top <= view.bottom + 120) this.props.requestThumb(part);
        }
    }

    observe (el) {
        if (!el || !this.props.thumbs || this.props.thumbs.has(el.dataset.part)) return;
        if (this.io) this.io.observe(el);
        else if (typeof IntersectionObserver === 'function') (this.pending = this.pending || []).push(el);
        else this.props.requestThumb(el.dataset.part);
    }

    openCatalogue () {
        this.setState({catalogue: true, note: null});
        if (this.state.list || this.loadingList) return;
        this.loadingList = this.props.onOpenCatalogue()
            .then(list => this.setState({list, listError: ''}),
                error => this.setState({listError: error.message}))
            .finally(() => { this.loadingList = null; });
    }

    addFromCatalogue (part) {
        const {text: T} = this.props;
        this.setState({adding: part, note: null});
        this.props.onAddCatalogPart(part).then(added => {
            const name = (this.props.locale === 'de' && added.meta.nameDe) || added.meta.name;
            this.setState({adding: null, catalogue: false, query: '',
                note: added.decoration ?
                    {kind: 'decoration', text: fill(T.catalogueDecoration, {name, why: added.why[0] || ''})} :
                    {kind: 'added', text: fill(T.catalogueAdded, {name})}});
        }, error => this.setState({adding: null, note: {kind: 'error', text: fill(T.catalogueFailed, {part, error: error.message})}}));
    }

    /** A catalogue result row came near the screen: its picture is asked for, once. */
    observeRow (el) {
        if (!el || !this.props.onCataloguePreview || this.state.catThumbs.has(el.dataset.part)) return;
        if (!this.catIo && typeof IntersectionObserver === 'function') {
            this.catIo = new IntersectionObserver(entries => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    this.catIo.unobserve(e.target);
                    this.preview(e.target.dataset.part);
                }
            }, {rootMargin: '80px 0px'});
        }
        if (this.catIo) this.catIo.observe(el);
        else this.preview(el.dataset.part);
    }

    preview (part) {
        if (this.state.catThumbs.has(part)) return;
        this.setState(s => ({catThumbs: new Map(s.catThumbs).set(part, undefined)}));
        this.props.onCataloguePreview(part).then(url => url, () => null).then(url => {
            if (!this.unmounted) this.setState(s => ({catThumbs: new Map(s.catThumbs).set(part, url)}));
        });
    }

    removeMine (part) {
        const {text: T, locale, lib} = this.props;
        const m = lib.CATALOG.get(part);
        const name = (locale === 'de' && m?.nameDe) || m?.name || part;
        const r = this.props.onRemoveCatalogPart(part);
        this.setState({note: r.ok ? {kind: 'added', text: fill(T.catalogueRemoved, {name})} : {kind: 'error-inline', text: fill(T.catalogueInUse, {name})}});
    }

    renderCatalogue () {
        const {text: T, lib, locale} = this.props;
        const {list, listError, catQuery, adding, note} = this.state;
        const found = list ? lib.searchCatalogue(list, catQuery) : null;
        return (
            <div data-testid="bw-sim-lab-catalogue">
                <div style={{display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4}}>
                    <button type="button" data-testid="bw-sim-lab-catalogue-back" onClick={() => this.setState({catalogue: false})}
                        aria-label={T.catalogueBack} title={T.catalogueBack}
                        style={{minWidth: 30, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer'}}>←</button>
                    <div style={{fontWeight: 600}}>{T.catalogueTitle}</div>
                </div>
                <input type="search" data-testid="bw-sim-lab-catalogue-search" value={catQuery} placeholder={T.catalogueHint} aria-label={T.catalogueTitle}
                    autoFocus onChange={e => this.setState({catQuery: e.target.value})}
                    onKeyDown={e => { if (e.key === 'Escape') this.setState({catalogue: false}); }}
                    style={{width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #94a3b8', marginBottom: 4}} />
                {note && note.kind === 'error' && <div data-testid="bw-sim-lab-catalogue-note" role="status" style={{color: '#b91c1c', margin: '4px 2px'}}>{note.text}</div>}
                {!list && !listError && <div role="status" style={{color: '#64748b', padding: '6px 2px'}}>{T.catalogueLoading}</div>}
                {listError && <div role="status" style={{color: '#b91c1c', padding: '6px 2px'}}>{fill(T.catalogueUnavailable, {error: listError})}</div>}
                {found && (catQuery.trim() ? (
                    <React.Fragment>
                        <div style={{color: '#64748b', fontSize: 11, margin: '2px 2px 4px'}}>
                            {fill(T.catalogueCount, {shown: found.results.length, total: found.total.toLocaleString(locale)})}
                        </div>
                        <ul data-testid="bw-sim-lab-catalogue-results" style={{listStyle: 'none', margin: 0, padding: 0}}>
                            {found.results.map(p => {
                                const have = lib.CATALOG.has(p.part);
                                return (
                                    <li key={p.part} data-part={p.part} ref={this.observeRow}
                                        style={{display: 'flex', gap: 6, alignItems: 'center', padding: '5px 2px', borderBottom: '1px solid #e2e8f0'}}>
                                        {this.state.catThumbs.get(p.part) ?
                                            <img src={this.state.catThumbs.get(p.part)} alt="" width={CATALOGUE_THUMB_PX} height={CATALOGUE_THUMB_PX}
                                                data-testid="bw-sim-lab-catalogue-thumb" style={{flex: '0 0 auto', display: 'block'}} /> :
                                            <span aria-hidden="true" style={{flex: '0 0 auto', width: CATALOGUE_THUMB_PX, height: CATALOGUE_THUMB_PX, borderRadius: 4, background: '#f1f5f9'}} />}
                                        <span style={{flex: '1 1 auto', minWidth: 0}}>
                                            <span style={{color: '#64748b', fontFamily: 'monospace', marginRight: 4}}>{lib.partNumber(p.part)}</span>
                                            {p.title}
                                        </span>
                                        <button type="button" data-testid={`bw-sim-lab-catalogue-add-${p.part}`} disabled={have || Boolean(adding)}
                                            onClick={() => this.addFromCatalogue(p.part)}
                                            style={{flex: '0 0 auto', padding: '3px 8px', borderRadius: 6, border: '1px solid #2563eb',
                                                background: have ? '#f1f5f9' : '#2563eb', color: have ? '#64748b' : '#fff', cursor: have ? 'default' : 'pointer'}}>
                                            {adding === p.part ? T.catalogueAdding : have ? T.catalogueHave : T.catalogueAdd}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </React.Fragment>
                ) : <div style={{color: '#64748b', fontSize: 11, padding: '4px 2px'}}>{fill(T.catalogueAbout, {total: list.length.toLocaleString(locale)})}</div>)}
                <div style={{color: '#64748b', fontSize: 10, marginTop: 8}}>{T.catalogueCredit}</div>
                {this.renderCredits()}
            </div>
        );
    }

    /** "My parts": the parts added from the LDraw catalogue, each with a remove button. */
    renderMine (grid) {
        const {text: T, lib, locale} = this.props;
        const mine = (lib.catalogueParts ? lib.catalogueParts() : []).map(e => e.part).filter(p => lib.CATALOG.has(p));
        if (!mine.length) return null;
        const item = part => {
            const m = lib.CATALOG.get(part);
            return {part, name: (locale === 'de' && m?.nameDe) || m?.name || part, number: lib.partNumber(part)};
        };
        return (
            <details data-testid="bw-sim-lab-category-mine" open={this.state.open.includes('mine')}
                onToggle={e => {
                    const isOpen = e.currentTarget.open;
                    this.setState(s => ({open: isOpen ? [...new Set([...s.open, 'mine'])] : s.open.filter(c => c !== 'mine')}));
                }}>
                <summary style={{cursor: 'pointer', padding: '6px 2px', fontWeight: 600, userSelect: 'none'}}>{T.myParts} ({mine.length})</summary>
                <div style={grid}>
                    {mine.map(part => (
                        <div key={part} style={{position: 'relative'}}>
                            {this.renderTile(item(part), {testid: 'bw-sim-lab-part-'})}
                            <button type="button" data-testid={`bw-sim-lab-mine-remove-${part}`} aria-label={fill(T.catalogueRemove, {name: item(part).name})}
                                title={fill(T.catalogueRemove, {name: item(part).name})} onClick={() => this.removeMine(part)}
                                style={{position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, lineHeight: '16px', fontSize: 11,
                                    borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer'}}>×</button>
                        </div>
                    ))}
                </div>
            </details>
        );
    }

    /** CC BY attribution of every part added on this device: each file's author, licence and source. */
    renderCredits () {
        const {text: T, lib, locale} = this.props;
        const added = lib.catalogueParts ? lib.catalogueParts() : [];
        if (!added.length) return null;
        return (
            <details data-testid="bw-sim-lab-catalogue-credits" style={{marginTop: 6, fontSize: 10, color: '#475569'}}>
                <summary style={{cursor: 'pointer'}}>{fill(T.catalogueCredits, {n: added.length})}</summary>
                {added.map(({part, meta, credits = []}) => (
                    <div key={part} style={{margin: '4px 0'}}>
                        <div style={{fontWeight: 600}}>{(locale === 'de' && meta.nameDe) || meta.name} ({lib.partNumber(part)})</div>
                        {credits.map(c => (
                            <div key={c.path}>
                                <a href={c.url} target="_blank" rel="noopener noreferrer">{c.path}</a>{` — ${c.author} — ${c.license}`}
                            </div>
                        ))}
                    </div>
                ))}
            </details>
        );
    }

    renderTile (item, {testid, compact = false}) {
        const {text: T, placing, thumbs, onArm, onPress, fits} = this.props;
        const on = placing === item.part;
        // Target-first: a part that cannot go into the pinned target steps back.
        const dim = Boolean(fits && !fits(item.part));
        const picture = thumbs ? thumbs.get(item.part) : null;
        const title = fill(T.partTitle, {name: item.name, number: item.number});
        return (
            <button key={`${testid}${item.part}`} type="button" data-testid={`${testid}${item.part}`} data-part={item.part}
                ref={this.observe} aria-pressed={on} title={title} draggable={false}
                onDragStart={e => e.preventDefault()}
                onPointerDown={e => onPress(item.part, e)}
                onClick={e => onArm(item.part, {keyboard: e.detail === 0})}
                data-fits={fits ? (dim ? 'no' : 'yes') : undefined}
                style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2,
                    width: '100%', minHeight: compact ? 0 : 44, padding: compact ? 3 : '4px 4px 6px', borderRadius: 8, cursor: 'grab',
                    border: `${on ? 2 : 1}px solid ${on ? '#2563eb' : '#e2e8f0'}`, background: on ? '#dbeafe' : '#fff',
                    userSelect: 'none', touchAction: 'pan-y', WebkitTouchCallout: 'none', boxSizing: 'border-box', fontSize: 11, lineHeight: '13px', color: '#1e293b',
                    opacity: dim ? 0.35 : 1}}>
                {thumbs && (picture ?
                    <img src={picture} alt="" draggable={false} data-testid="bw-sim-lab-thumb" width={THUMB_CSS_PX} height={THUMB_CSS_PX}
                        style={{display: 'block', pointerEvents: 'none'}} /> :
                    <span aria-hidden="true" data-testid="bw-sim-lab-thumb-pending"
                        style={{display: 'block', width: THUMB_CSS_PX, height: THUMB_CSS_PX, borderRadius: 6, background: '#f1f5f9'}} />)}
                {!(compact && picture) && (
                    <span style={{display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        textAlign: 'center', wordBreak: 'break-word'}}>{item.name}</span>
                )}
            </button>
        );
    }

    render () {
        const {text: T, lib, locale, recent} = this.props;
        const {query, note} = this.state;
        if (this.state.catalogue) {
            return (
                <div data-testid="bw-sim-lab-palette" ref={this.scroller}
                    style={{width: 214, flex: '0 0 214px', overflow: 'auto', fontSize: 12, borderRight: '1px solid #e2e8f0', paddingRight: 6}}>
                    {this.renderCatalogue()}
                </div>
            );
        }
        const item = part => {
            const m = lib.CATALOG.get(part);
            return {part, name: (locale === 'de' && m?.nameDe) || m?.name || part, number: lib.partNumber(part)};
        };
        const searching = query.trim().length > 0;
        const found = searching ? lib.searchPalette(lib.CATALOG, query, {locale}) : null;
        const grid = {display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, margin: '4px 0 6px'};
        // parts added from the catalogue sit in "My parts", not in the categories too
        const mineSet = new Set((lib.catalogueParts ? lib.catalogueParts() : []).map(e => e.part));
        return (
            <div data-testid="bw-sim-lab-palette" ref={this.scroller}
                style={{width: '100%', minWidth: 0, flex: '1 1 auto', overflow: 'auto', fontSize: 12, paddingRight: 6, boxSizing: 'border-box'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4}}>
                    {T.parts}
                    <SimLabInfo testid="bw-sim-lab-help-parts" label={T.helpParts} text={T.paletteHelp} />
                </div>
                <div style={{display: 'flex', gap: 4, marginBottom: 6}}>
                    <input type="search" data-testid="bw-sim-lab-search" value={query} placeholder={T.searchHint} aria-label={T.search}
                        onChange={e => this.setState({query: e.target.value})}
                        onKeyDown={e => { if (e.key === 'Escape') this.setState({query: ''}); }}
                        style={{flex: '1 1 auto', minWidth: 0, padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #94a3b8'}} />
                    {searching && (
                        <button type="button" data-testid="bw-sim-lab-search-clear" aria-label={T.clearSearch} title={T.clearSearch}
                            onClick={() => this.setState({query: ''})}
                            style={{minWidth: 30, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer'}}>×</button>
                    )}
                    {lib.CATALOGUE_PARTS && this.props.onOpenCatalogue && (
                        <button type="button" data-testid="bw-sim-lab-catalogue-open" aria-label={T.catalogueOpen} title={T.catalogueOpen}
                            onClick={() => this.openCatalogue()}
                            style={{minWidth: 30, fontSize: 16, lineHeight: 1, borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer'}}>+</button>
                    )}
                </div>
                {note && note.kind === 'error-inline' && (
                    <div data-testid="bw-sim-lab-catalogue-note" role="status" style={{color: '#b91c1c', margin: '0 2px 6px'}}>{note.text}</div>
                )}
                {note && note.kind !== 'error' && note.kind !== 'error-inline' && (
                    <div data-testid="bw-sim-lab-catalogue-note" role="status"
                        style={{background: note.kind === 'decoration' ? '#fef9c3' : '#dcfce7', borderRadius: 6, padding: '5px 6px', marginBottom: 6}}>
                        {note.text}
                    </div>
                )}
                {searching ? (
                    <div data-testid="bw-sim-lab-search-results">
                        {found.length ?
                            <div style={grid}>{found.map(p => this.renderTile(p, {testid: 'bw-sim-lab-part-'}))}</div> :
                            <div data-testid="bw-sim-lab-search-none" style={{color: '#64748b', padding: '6px 2px'}}>{fill(T.noMatches, {q: query.trim()})}</div>}
                    </div>
                ) : (
                    <React.Fragment>
                        {recent.length > 0 && (
                            <div data-testid="bw-sim-lab-recent" style={{marginBottom: 4}}>
                                <div style={{fontWeight: 600, padding: '4px 2px'}}>{T.recent}</div>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4}}>
                                    {recent.map(part => this.renderTile(item(part), {testid: 'bw-sim-lab-recent-', compact: true}))}
                                </div>
                            </div>
                        )}
                        {this.renderMine(grid)}
                        {lib.paletteFrom(new Map([...lib.CATALOG].filter(([part]) => !mineSet.has(part))), {locale}).map(g => (
                            <details key={g.category} data-testid={`bw-sim-lab-category-${g.category}`} open={this.state.open.includes(g.category)}
                                onToggle={e => {
                                    const isOpen = e.currentTarget.open;
                                    this.setState(s => ({open: isOpen ? [...new Set([...s.open, g.category])] : s.open.filter(c => c !== g.category)}));
                                }}>
                                <summary style={{cursor: 'pointer', padding: '6px 2px', fontWeight: 600, userSelect: 'none'}}>{g.label} ({g.parts.length})</summary>
                                <div style={grid}>
                                    {[...g.parts].sort((x, y) => x.name.localeCompare(y.name, locale, {numeric: true}))
                                        .map(p => this.renderTile({...p, number: lib.partNumber(p.part)}, {testid: 'bw-sim-lab-part-'}))}
                                </div>
                            </details>
                        ))}
                    </React.Fragment>
                )}
            </div>
        );
    }
}

export default SimLabPalette;
