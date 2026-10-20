// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's Readings panel (Simulate): every motor's angle and speed and every
// sensor's value, now and as a line over the last seconds. The pane samples them
// through the Robot Lab API (lib/bw-sim/api/robot-lab-api.js), so a hub's own program,
// the lab-direct hub and every hub kind read the same way.

import PropTypes from 'prop-types';
import React from 'react';

const W = 96;
const H = 22;

/** A sparkline of `values` (numbers; non-numbers are gaps), scaled to its own range. */
const Spark = ({values}) => {
    const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (nums.length < 2) return <svg width={W} height={H} aria-hidden="true" />;
    let lo = Math.min(...nums);
    let hi = Math.max(...nums);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const step = W / Math.max(1, values.length - 1);
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) { pen = false; return; }
        const x = (i * step).toFixed(1);
        const y = (H - 2 - ((v - lo) / (hi - lo)) * (H - 4)).toFixed(1);
        d += `${pen ? 'L' : 'M'}${x} ${y}`;
        pen = true;
    });
    return (
        <svg width={W} height={H} aria-hidden="true" style={{display: 'block', flex: '0 0 auto'}}>
            <path d={d} fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
};
Spark.propTypes = {values: PropTypes.arrayOf(PropTypes.any).isRequired};

/** rows: [{key, label, now (text), values (history)}], grouped as {motors, sensors}. */
const SimLabReadings = ({text: T, motors, sensors, onClose}) => {
    const row = r => (
        <li key={r.key} data-testid={`bw-sim-lab-reading-${r.key}`}
            style={{display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderTop: '1px solid #eef2f7'}}>
            <span style={{flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{r.label}</span>
            <span data-testid={`bw-sim-lab-reading-${r.key}-now`} style={{fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right'}}>{r.now}</span>
            <Spark values={r.values} />
        </li>
    );
    const list = {listStyle: 'none', margin: 0, padding: 0};
    return (
        <section data-testid="bw-sim-lab-readings-panel" aria-label={T.readingsTitle}
            style={{position: 'absolute', top: 8, right: 8, zIndex: 6, width: 300, maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)',
                overflow: 'auto', background: 'rgba(255, 255, 255, 0.96)', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px',
                fontSize: 12, color: '#1e293b', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)'}}>
            <div style={{display: 'flex', alignItems: 'center', marginBottom: 2}}>
                <strong style={{flex: '1 1 auto'}}>{T.readingsTitle}</strong>
                <button type="button" data-testid="bw-sim-lab-readings-close" aria-label={T.close} title={T.close} onClick={onClose}
                    style={{border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#475569'}}>✕</button>
            </div>
            {!motors.length && !sensors.length && <div style={{color: '#64748b'}}>{T.readingsEmpty}</div>}
            {motors.length > 0 && <div style={{color: '#64748b', marginTop: 4}}>{T.readingsMotors}</div>}
            <ul style={list}>{motors.map(row)}</ul>
            {sensors.length > 0 && <div style={{color: '#64748b', marginTop: 6}}>{T.readingsSensors}</div>}
            <ul style={list}>{sensors.map(row)}</ul>
        </section>
    );
};

SimLabReadings.propTypes = {
    text: PropTypes.object.isRequired,
    motors: PropTypes.arrayOf(PropTypes.object).isRequired,
    sensors: PropTypes.arrayOf(PropTypes.object).isRequired,
    onClose: PropTypes.func.isRequired
};

export default SimLabReadings;
