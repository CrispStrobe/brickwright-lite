// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's Challenges panel (Simulate): the mats' challenges (lib/bw-sim/world/challenges.js)
// with their goal and best result on this device; the one under way shows its time, progress and,
// at the end, its stars. The pane judges the run (sim-lab-pane.jsx) and starts a challenge on its mat.

import PropTypes from 'prop-types';
import React from 'react';

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

/** Three stars, `n` of them filled (aria: "n of 3 stars"). */
const Stars = ({n, label}) => (
    <span role="img" aria-label={label} style={{color: '#d97706', letterSpacing: 1, whiteSpace: 'nowrap'}}>
        {'★'.repeat(n)}<span style={{color: '#cbd5e1'}}>{'★'.repeat(3 - n)}</span>
    </span>
);
Stars.propTypes = {n: PropTypes.number.isRequired, label: PropTypes.string.isRequired};

/**
 * challenges: [{id, title, goal, mat, best: {stars, text}|null}]; active: {id, result, measureText}|null.
 */
const SimLabChallenges = ({text: T, challenges, active, onStart, onClose}) => {
    const button = {padding: '3px 10px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', font: 'inherit'};
    const current = active && challenges.find(c => c.id === active.id);
    const r = active && active.result;
    return (
        <section data-testid="bw-sim-lab-challenges-panel" aria-label={T.challengesTitle}
            style={{position: 'absolute', top: 8, left: 8, zIndex: 6, width: 300, maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)',
                overflow: 'auto', background: 'rgba(255, 255, 255, 0.96)', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px',
                fontSize: 12, color: '#1e293b', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)'}}>
            <div style={{display: 'flex', alignItems: 'center', marginBottom: 4}}>
                <strong style={{flex: '1 1 auto'}}>{current ? current.title : T.challengesTitle}</strong>
                <button type="button" data-testid="bw-sim-lab-challenges-close" aria-label={T.close} title={T.close} onClick={onClose}
                    style={{border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#475569'}}>✕</button>
            </div>
            {current ? (
                <div data-testid="bw-sim-lab-challenge-status" data-status={r ? r.status : 'ready'}>
                    <div style={{marginBottom: 6}}>{current.goal}</div>
                    {(!r || r.status === 'running') && (
                        <React.Fragment>
                            <div style={{height: 6, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden'}}>
                                <div style={{width: `${Math.round((r ? r.progress : 0) * 100)}%`, height: '100%', background: '#4f46e5'}} />
                            </div>
                            <div style={{color: '#64748b', marginTop: 4, fontVariantNumeric: 'tabular-nums'}}>
                                {r && r.timeS > 0 ? fill(T.challengeTime, {s: r.timeS.toFixed(1)}) : T.challengeReady}
                            </div>
                        </React.Fragment>
                    )}
                    {r && r.status === 'done' && (
                        <div data-testid="bw-sim-lab-challenge-result" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                            <Stars n={r.stars} label={fill(T.challengeStars, {n: r.stars})} />
                            <span>{active.measureText}</span>
                        </div>
                    )}
                    {r && r.status === 'failed' && (
                        <div data-testid="bw-sim-lab-challenge-result" style={{color: '#b91c1c'}}>{T.challengeWhy[r.why] || r.why}</div>
                    )}
                    <div style={{display: 'flex', gap: 6, marginTop: 8}}>
                        <button type="button" data-testid={`bw-sim-lab-challenge-start-${current.id}`} onClick={() => onStart(current.id)} style={button}>
                            {r && r.status !== 'running' ? T.challengeAgain : T.challengeRestart}
                        </button>
                        <button type="button" data-testid="bw-sim-lab-challenge-list" onClick={() => onStart(null)}
                            style={{...button, background: '#fff', color: '#2563eb'}}>{T.challengeOthers}</button>
                    </div>
                </div>
            ) : (
                <ul style={{listStyle: 'none', margin: 0, padding: 0}}>
                    {challenges.map(c => (
                        <li key={c.id} data-testid={`bw-sim-lab-challenge-${c.id}`}
                            style={{display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #eef2f7'}}>
                            <span style={{flex: '1 1 auto', minWidth: 0}}>
                                <span style={{display: 'block', fontWeight: 600}}>{c.title}</span>
                                <span style={{display: 'block', color: '#64748b'}}>{c.mat}{c.best ? ' · ' : ''}
                                    {c.best && <Stars n={c.best.stars} label={fill(T.challengeBest, {n: c.best.stars, text: c.best.text})} />}</span>
                            </span>
                            <button type="button" data-testid={`bw-sim-lab-challenge-start-${c.id}`} onClick={() => onStart(c.id)} style={button}>
                                {T.challengeStart}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

SimLabChallenges.propTypes = {
    text: PropTypes.object.isRequired,
    challenges: PropTypes.arrayOf(PropTypes.object).isRequired,
    active: PropTypes.object,
    onStart: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default SimLabChallenges;
