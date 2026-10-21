// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import PropTypes from 'prop-types';
import React, {useEffect, useRef, useState} from 'react';
import {MODEL_LESSONS} from '../../lib/bw-sim/model/example-catalog.js';
import {EXAMPLE_TOPICS, filterModelExamples} from '../../lib/bw-sim/model/example-browser.js';

export const EXAMPLES_TEXT = {
    en: {title: 'Robot Lab examples', search: 'Search models and physics', topics: 'Physics topic', all: 'All topics',
        size: 'Model size', anySize: 'Any piece count', large: 'More than 50 pieces', small: 'Up to 50 pieces',
        close: 'Close examples', open: 'Open model', program: 'Open model + program', pieces: 'pieces', motors: 'motors',
        lesson: 'Read lesson', count: '{n} models', empty: 'No models match these filters.', loading: 'Opening…',
        hint: 'Open an example to replace the model and code. Press Run to start.'},
    de: {title: 'Beispiele im Roboter-Labor', search: 'Modelle und Physik suchen', topics: 'Physikthema', all: 'Alle Themen',
        size: 'Modellgröße', anySize: 'Beliebige Teilezahl', large: 'Mehr als 50 Teile', small: 'Bis zu 50 Teile',
        close: 'Beispiele schließen', open: 'Modell öffnen', program: 'Modell + Programm öffnen', pieces: 'Teile', motors: 'Motoren',
        lesson: 'Lektion lesen', count: '{n} Modelle', empty: 'Keine Modelle passen zu diesen Filtern.', loading: 'Wird geöffnet…',
        hint: 'Ein Beispiel ersetzt Modell und Code. Mit Start geht es los.'}
};
const button = {minHeight: 40, border: '1px solid #94a3b8', borderRadius: 6, padding: '6px 10px', background: '#fff', color: '#0f172a', cursor: 'pointer'};

const SimLabExamples = ({models, locale, selected, onChoose, onLesson, onClose}) => {
    const lang = locale === 'de' ? 'de' : 'en';
    const T = EXAMPLES_TEXT[lang];
    const [query, setQuery] = useState('');
    const [topic, setTopic] = useState('');
    const [size, setSize] = useState('');
    const [pending, setPending] = useState(null);
    const [error, setError] = useState('');
    const search = useRef(null);
    const dialog = useRef(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        search.current?.focus();
        return () => { mounted.current = false; };
    }, []);
    const choose = async (key, program) => {
        setPending(key); setError('');
        try { await onChoose(key, program); }
        catch (e) { if (mounted.current) setError(e.message); }
        finally { if (mounted.current) setPending(null); }
    };
    const keyboard = e => {
        if (e.key === 'Escape') { e.stopPropagation(); if (!pending) onClose(); }
        if (e.key !== 'Tab') return;
        const nodes = [...dialog.current.querySelectorAll('button:not(:disabled), input, select, a[href]')];
        const first = nodes[0]; const last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    const filtered = filterModelExamples(models, MODEL_LESSONS, {query, topic, size, locale: lang});
    return (
        <div style={{position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(15,23,42,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8}}>
            <section ref={dialog} role="dialog" aria-modal="true" aria-label={T.title} data-testid="bw-sim-examples" onKeyDown={keyboard}
                style={{width: 'min(1080px, 100%)', maxHeight: '100%', minHeight: 0, background: '#f8fafc', color: '#0f172a', borderRadius: 10,
                    boxShadow: '0 10px 35px #0f172a55', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                <header style={{display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid #cbd5e1'}}>
                    <h2 style={{fontSize: 18, margin: 0, flex: 1}}>{T.title}</h2>
                    <button type="button" style={button} disabled={Boolean(pending)} aria-label={T.close} onClick={onClose}>×</button>
                </header>
                <div style={{padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    <input ref={search} type="search" aria-label={T.search} placeholder={T.search} value={query} onChange={e => setQuery(e.target.value)}
                        style={{...button, minWidth: 160, flex: '2 1 220px', boxSizing: 'border-box'}} />
                    <select aria-label={T.topics} value={topic} onChange={e => setTopic(e.target.value)} style={{...button, minWidth: 0, flex: '1 1 170px'}}>
                        <option value="">{T.all}</option>
                        {Object.entries(EXAMPLE_TOPICS).map(([id, title]) => <option key={id} value={id}>{title[lang]}</option>)}
                    </select>
                    <select aria-label={T.size} value={size} onChange={e => setSize(e.target.value)} style={{...button, minWidth: 0, flex: '1 1 170px'}}>
                        <option value="">{T.anySize}</option><option value="large">{T.large}</option><option value="small">{T.small}</option>
                    </select>
                </div>
                <p style={{fontSize: 12, color: '#475569', padding: '0 12px', margin: '0 0 10px'}}>{T.hint}</p>
                <div role="status" style={{padding: '0 12px 8px', fontSize: 13}}>{T.count.replace('{n}', filtered.length)}</div>
                {error && <div role="alert" style={{padding: 12, color: '#b91c1c'}}>{error}</div>}
                <div style={{overflow: 'auto', minHeight: 0, padding: '0 12px 12px'}}>
                    {!filtered.length && <p>{T.empty}</p>}
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12}}>
                        {filtered.map(entry => {
                            const key = entry.id || entry.file;
                            const d = MODEL_LESSONS[key];
                            const title = entry.title[lang] || entry.title.en;
                            return (
                                <article key={key} data-testid="bw-sim-example-card" data-model={key}
                                    style={{background: '#fff', border: `2px solid ${selected === key ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 8, padding: 12,
                                        display: 'flex', flexDirection: 'column', minWidth: 0}}>
                                    <h3 style={{fontSize: 15, margin: '0 0 6px'}}>{title}</h3>
                                    <span style={{fontSize: 12, color: '#6d28d9'}}>{EXAMPLE_TOPICS[d.topic][lang]}</span>
                                    <p style={{fontSize: 13, lineHeight: 1.45, flex: 1}}>{d.description[lang]}</p>
                                    <p style={{fontSize: 12, margin: '0 0 8px', color: '#475569'}}>{d.pieces} {T.pieces} · {d.motors} {T.motors} · {d.hubs.join(', ')}</p>
                                    <small style={{color: '#475569', marginBottom: 10}}>{d.author} · {d.license}</small>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                                        <button type="button" style={button} disabled={Boolean(pending)} onClick={() => onLesson(key)} aria-label={`${T.lesson}: ${title}`}>{T.lesson}</button>
                                        {!entry.example && <button type="button" style={button} disabled={Boolean(pending)} onClick={() => choose(key, false)} aria-label={`${T.open}: ${title}`}>
                                            {pending === key ? T.loading : T.open}
                                        </button>}
                                        {entry.example && <button type="button" style={{...button, background: '#ede9fe'}} disabled={Boolean(pending)}
                                            onClick={() => choose(key, true)} aria-label={`${T.program}: ${title}`}>{pending === key ? T.loading : (lang === 'de' ? 'Öffnen' : 'Open')}</button>}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
};
SimLabExamples.propTypes = {
    models: PropTypes.arrayOf(PropTypes.object).isRequired,
    locale: PropTypes.string,
    selected: PropTypes.string,
    onChoose: PropTypes.func.isRequired,
    onLesson: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};
export default SimLabExamples;
