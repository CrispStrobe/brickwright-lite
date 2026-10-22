// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';

const TEXT = {
    en: {
        title: 'Simulation statistics', close: 'Close statistics', speed: 'Actual speed', last: 'Last measured speed',
        target: 'Selected speed', time: 'Simulated time', execution: 'Execution', worker: 'WASM physics worker',
        main: 'Main thread', firmware: 'Firmware lockstep', cost: 'Physics ms / simulated s (average)',
        trip: 'Worker round trip (average)', steps: 'Physics steps', redos: 'Redone batches',
        diverged: 'Replay divergences', dropped: 'Dropped simulation time'
    },
    de: {
        title: 'Simulationsstatistik', close: 'Statistik schließen', speed: 'Tatsächliches Tempo', last: 'Zuletzt gemessenes Tempo',
        target: 'Gewähltes Tempo', time: 'Simulierte Zeit', execution: 'Ausführung', worker: 'WASM-Physik-Worker',
        main: 'Hauptthread', firmware: 'Firmware im Gleichschritt', cost: 'Physik-ms / simulierte s (Mittel)',
        trip: 'Worker-Antwortzeit (Mittel)', steps: 'Physikschritte', redos: 'Wiederholte Pakete',
        diverged: 'Replay-Abweichungen', dropped: 'Verworfene Simulationszeit'
    }
};
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Read existing measurements only. Zero is measured; missing values are not zero. */
export const statisticsRows = ({locale, status, rtf, simMs, timeScale, worker, lockstep, stats}) => {
    const T = TEXT[locale] || TEXT.en;
    const number = (n, digits = 1) => finite(n) ? n.toFixed(digits).replace('.', locale === 'de' ? ',' : '.') : '—';
    const unit = (n, suffix, digits) => finite(n) ? `${number(n, digits)}${suffix}` : '—';
    const row = (id, label, value) => ({id, label, value});
    const s = stats || {};
    return [
        row('speed', status === 'running' || status === 'stopping' ? T.speed : T.last, unit(rtf, '×', rtf < 0.1 ? 3 : 2)),
        row('target', T.target, unit(timeScale, '×', 2)),
        row('time', T.time, unit(finite(simMs) ? simMs / 1000 : null, ' s', 1)),
        row('execution', T.execution, lockstep ? T.firmware : worker ? T.worker : T.main),
        row('cost', T.cost, number(worker && simMs > 0 && finite(s.workerMs) ? s.workerMs * 1000 / simMs : null)),
        row('trip', T.trip, unit(worker && s.batches > 0 && finite(s.roundTripMs) ? s.roundTripMs / s.batches : null, ' ms', 2)),
        row('steps', T.steps, number(s.steps, 0)),
        row('redos', T.redos, number(s.redos, 0)),
        row('diverged', T.diverged, number(s.diverged, 0)),
        row('dropped', T.dropped, unit(s.droppedMs, ' ms', 1))
    ];
};

const SimLabStats = ({locale, measurement, onClose}) => {
    const T = TEXT[locale] || TEXT.en;
    return (
        <section data-testid="bw-sim-lab-stats" aria-label={T.title}
            style={{position: 'absolute', top: 8, left: 8, zIndex: 5, width: 285, boxSizing: 'border-box',
                maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 48px)', overflow: 'auto',
                background: 'rgba(255,255,255,0.96)', border: '1px solid #cbd5e1', borderRadius: 8,
                padding: '6px 10px', fontSize: 12, color: '#1e293b', boxShadow: '0 4px 14px rgba(15,23,42,0.15)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <strong style={{flex: '1 1 auto'}}>{T.title}</strong>
                <button type="button" data-testid="bw-sim-lab-stats-close" aria-label={T.close} title={T.close} onClick={onClose}
                    style={{border: 0, background: 'transparent', color: '#475569', cursor: 'pointer', minWidth: 32, minHeight: 32}}>✕</button>
            </div>
            <dl style={{margin: 0}}>
                {statisticsRows({...measurement, locale}).map(row => (
                    <div key={row.id} style={{display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderTop: '1px solid #eef2f7'}}>
                        <dt>{row.label}</dt>
                        <dd data-testid={`bw-sim-lab-stat-${row.id}`} style={{margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{row.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
};
SimLabStats.propTypes = {locale: PropTypes.string.isRequired, measurement: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired};
export default SimLabStats;
