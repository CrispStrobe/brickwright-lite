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

import React from 'react';

/** Categories open when Build opens (the ones a first robot is made of). */
const OPEN_AT_START = ['hub', 'motor', 'beam', 'pin', 'axle', 'wheel'];
const THUMB_CSS_PX = 56;

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

class SimLabPalette extends React.Component {
    constructor (props) {
        super(props);
        // Which categories are open survives a search (which shows a flat list instead).
        this.state = {query: '', open: OPEN_AT_START};
        this.scroller = React.createRef();
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
        const {query} = this.state;
        const item = part => {
            const m = lib.CATALOG.get(part);
            return {part, name: (locale === 'de' && m?.nameDe) || m?.name || part, number: lib.partNumber(part)};
        };
        const searching = query.trim().length > 0;
        const found = searching ? lib.searchPalette(lib.CATALOG, query, {locale}) : null;
        const grid = {display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, margin: '4px 0 6px'};
        return (
            <div data-testid="bw-sim-lab-palette" ref={this.scroller}
                style={{width: '100%', minWidth: 0, flex: '1 1 auto', overflow: 'auto', fontSize: 12, paddingRight: 6, boxSizing: 'border-box'}}>
                <div style={{fontWeight: 600, marginBottom: 4}}>{T.parts}</div>
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
                </div>
                {searching ? (
                    <div data-testid="bw-sim-lab-search-results">
                        {found.length ?
                            <div style={grid}>{found.map(p => this.renderTile(p, {testid: 'bw-sim-lab-part-'}))}</div> :
                            <div data-testid="bw-sim-lab-search-none" style={{color: '#64748b', padding: '6px 2px'}}>{fill(T.noMatches, {q: query.trim()})}</div>}
                    </div>
                ) : (
                    <React.Fragment>
                        <div style={{color: '#64748b', fontSize: 11, marginBottom: 4}}>{T.paletteHelp}</div>
                        {recent.length > 0 && (
                            <div data-testid="bw-sim-lab-recent" style={{marginBottom: 4}}>
                                <div style={{fontWeight: 600, padding: '4px 2px'}}>{T.recent}</div>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4}}>
                                    {recent.map(part => this.renderTile(item(part), {testid: 'bw-sim-lab-recent-', compact: true}))}
                                </div>
                            </div>
                        )}
                        {lib.paletteFrom(lib.CATALOG, {locale}).map(g => (
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
