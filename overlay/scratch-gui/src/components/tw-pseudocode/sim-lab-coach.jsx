// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's coach marks (docs/ROBOT-LAB-UX.md §3.9): the first time Build opens on a device,
// a small card in the corner of the 3D view shows a few tips one after the other. It is not a
// dialog — the view behind it keeps working — and Got it (or the last Next) puts it away for good
// on this device; the shortcut sheet can show it again (sim-lab-pane.jsx keeps the state).

import PropTypes from 'prop-types';
import React from 'react';

const SimLabCoach = ({T, step, onNext, onDone}) => {
    const tips = T.coach;
    const tip = tips[step];
    if (!tip) return null;
    const last = step === tips.length - 1;
    const button = {padding: '3px 10px', borderRadius: 6, border: '1px solid #2563eb', cursor: 'pointer', font: 'inherit'};
    return (
        <section data-testid="bw-sim-lab-coach" data-step={step} aria-label={T.coachTitle} aria-live="polite"
            style={{position: 'absolute', left: 8, bottom: 8, zIndex: 7, width: 280, maxWidth: 'calc(100% - 16px)', boxSizing: 'border-box',
                background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#1e293b',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.18)'}}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4}}>
                <strong style={{flex: '1 1 auto'}}>{tip.title}</strong>
                <span style={{color: '#92400e'}}>{step + 1} / {tips.length}</span>
            </div>
            <div style={{marginBottom: 8}}>{tip.body}</div>
            <div style={{display: 'flex', gap: 6, justifyContent: 'flex-end'}}>
                {!last && (
                    <button type="button" data-testid="bw-sim-lab-coach-done" onClick={onDone}
                        style={{...button, background: '#fff', color: '#2563eb'}}>{T.coachDone}</button>
                )}
                <button type="button" data-testid="bw-sim-lab-coach-next" onClick={last ? onDone : onNext}
                    style={{...button, background: '#2563eb', color: '#fff'}}>{last ? T.coachDone : T.coachNext}</button>
            </div>
        </section>
    );
};

SimLabCoach.propTypes = {
    T: PropTypes.object.isRequired,
    step: PropTypes.number.isRequired,
    onNext: PropTypes.func.isRequired,
    onDone: PropTypes.func.isRequired
};

export default SimLabCoach;
