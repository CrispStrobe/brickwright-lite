// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {loadModelLesson} from '../../lib/bw-sim/model/lesson-loader.js';
const TEXT = {
    en: {title: 'Model lesson', close: 'Close lesson', loading: 'Loading lesson…', failed: 'The lesson could not be loaded.', retry: 'Try again',
        what: 'What you see', try: 'Try this', why: 'What is going on', matters: 'Why it matters', further: 'Go further', predict: 'Predict first',
        answer: 'Show explanation', hide: 'Hide explanation', open: 'Open model + program', only: 'Open model', related: 'Explore next'},
    de: {title: 'Modell-Lektion', close: 'Lektion schließen', loading: 'Lektion wird geladen…', failed: 'Die Lektion konnte nicht geladen werden.', retry: 'Erneut versuchen',
        what: 'Was du siehst', try: 'Probiere es aus', why: 'Was dahintersteckt', matters: 'Wozu das wichtig ist', further: 'Weiterforschen', predict: 'Erst vorhersagen',
        answer: 'Erklärung zeigen', hide: 'Erklärung ausblenden', open: 'Modell + Programm öffnen', only: 'Modell öffnen', related: 'Als Nächstes erkunden'}
};
const button = {minHeight: 40, border: '1px solid #94a3b8', borderRadius: 6, padding: '6px 10px', background: '#fff', cursor: 'pointer', color: '#0f172a'};
const SimLabLesson = ({entry, models, locale, overlay, onLoad, onRelated, onClose}) => {
    const lang = locale === 'de' ? 'de' : 'en', T = TEXT[lang];
    const [lesson, setLesson] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
    const [revealed, setRevealed] = useState(false), [opening, setOpening] = useState(false);
    const close = useRef(null), mounted = useRef(true);
    useEffect(() => { mounted.current = true; close.current?.focus(); return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        const controller = new AbortController(); let live = true;
        setLesson(null); setError(''); setRevealed(false);
        loadModelLesson(entry, lang, {signal: controller.signal}).then(data => { if (live) setLesson(data); })
            .catch(e => { if (live && e.name !== 'AbortError') setError(e.message); });
        return () => { live = false; controller.abort(); };
    }, [entry, lang, retry]);
    const open = async () => {
        setOpening(true); setError('');
        try { await onLoad(entry.id || entry.file, Boolean(entry.example)); }
        catch (e) { if (mounted.current) setError(e.message); }
        finally { if (mounted.current) setOpening(false); }
    };
    const heading = label => <h3 style={{fontSize: 14, margin: '20px 0 6px'}}>{label}</h3>;
    return (
        <aside aria-label={T.title} data-testid="bw-sim-lesson" data-overlay={overlay ? 'true' : 'false'} data-lesson={lesson?.id || ''}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            style={{...(overlay ? {position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 12, width: 'min(360px, 100%)', boxShadow: '-3px 0 12px #64748b55'} :
                {width: 330, maxWidth: '40%', flex: '0 0 330px'}), display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
                border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a', boxSizing: 'border-box'}}>
            <div style={{display: 'flex', alignItems: 'start', gap: 8, padding: 10, borderBottom: '1px solid #e2e8f0'}}>
                <h2 style={{fontSize: 15, margin: 0, flex: 1}}>{entry.title[lang] || entry.title.en}</h2>
                <button ref={close} type="button" style={button} aria-label={T.close} onClick={onClose}>×</button>
            </div>
            <div style={{overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 14px 16px', fontSize: 13, lineHeight: 1.55}}>
                {!lesson && !error && <p role="status">{T.loading}</p>}
                {error && <div role="alert"><p>{T.failed} {error}</p><button type="button" style={button} onClick={() => setRetry(n => n + 1)}>{T.retry}</button></div>}
                {lesson && <>
                    {heading(T.what)}<p>{lesson.what}</p>
                    <button type="button" style={{...button, background: '#ede9fe'}} disabled={opening} onClick={open}>{entry.example ? T.open : T.only}</button>
                    {heading(T.try)}<ol data-testid="bw-sim-lesson-steps" style={{paddingLeft: 20}}>{lesson.try.map(s => <li key={s} style={{marginBottom: 8}}>{s}</li>)}</ol>
                    {heading(T.why)}<p>{lesson.why}</p>
                    {lesson.formula && <p style={{fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#f1f5f9', padding: 8}}>{lesson.formula}</p>}
                    {heading(T.predict)}<p>{lesson.question}</p>
                    <button type="button" style={button} aria-expanded={revealed} onClick={() => setRevealed(v => !v)}>{revealed ? T.hide : T.answer}</button>
                    {revealed && <p data-testid="bw-sim-lesson-answer">{lesson.answer}</p>}
                    {heading(T.matters)}<p>{lesson.matters}</p>
                    {heading(T.further)}<ul style={{paddingLeft: 20}}>{lesson.further.map(s => <li key={s}>{s}</li>)}</ul>
                    {lesson.related.length > 0 && <>{heading(T.related)}<div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>{lesson.related.map(key => {
                        const next = models.find(m => (m.id || m.file) === key);
                        return next && <button type="button" key={key} data-related-model={key} style={button} onClick={() => onRelated(key)}>{next.title[lang] || next.title.en}</button>;
                    })}</div></>}
                </>}
            </div>
        </aside>
    );
};
SimLabLesson.propTypes = {entry: PropTypes.object.isRequired, models: PropTypes.array.isRequired, locale: PropTypes.string,
    overlay: PropTypes.bool, onLoad: PropTypes.func.isRequired, onRelated: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired};
export default SimLabLesson;
