// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import {measurementPlotGeometry} from '../../lib/bw-sim/measurements/history.js';
const number = value => Number(value.toPrecision(4)).toString();

const SimLabMeasurementPlot = ({points, name, unit, locale}) => {
    const g = measurementPlotGeometry(points), de = locale === 'de';
    if (g.min === null) return <p data-testid="bw-sim-measurement-plot-empty">{de ? 'Noch keine verfügbaren Zeitwerte. Simulation starten.' : 'No available time samples yet. Run the simulation.'}</p>;
    const current = points[points.length - 1]?.value;
    const summary = `${name}: ${de ? 'Aktuell' : 'Current'} ${Number.isFinite(current) ? `${number(current)} ${unit}` : (de ? 'Nicht verfügbar' : 'Unavailable')}; min ${number(g.min)} ${unit}; max ${number(g.max)} ${unit}`;
    return <figure style={{margin: '6px 0'}} data-testid="bw-sim-measurement-plot">
        <svg viewBox="0 0 292 102" role="img" aria-label={summary} style={{display: 'block', width: '100%'}}>
            <title>{summary}</title>
            <path d="M32 10 V76 H278" stroke="#64748b" fill="none" />
            <text x="1" y="12" fontSize="9">{number(g.high)}</text>
            <text x="1" y="76" fontSize="9">{number(g.low)}</text>
            <text x="32" y="9" fontSize="9">{unit}</text>
            <text x="32" y="88" fontSize="9">0</text>
            <text x="278" y="88" textAnchor="end" fontSize="9">{number((g.end - g.start) / 1000)} s</text>
            <text x="155" y="100" textAnchor="middle" fontSize="9">{de ? 'Simulationszeit seit Fensterbeginn' : 'Simulation time from window start'}</text>
            {g.segments.map((segment, i) => segment.length === 1 ? <circle key={i} cx={segment[0][0]} cy={segment[0][1]} r="2" fill="#0369a1" /> :
                <polyline key={i} points={segment.map(p => p.join(',')).join(' ')} fill="none" stroke="#0369a1" strokeWidth="1.5" />)}
        </svg>
        <figcaption style={{fontSize: 10}}>{summary}</figcaption>
    </figure>;
};
SimLabMeasurementPlot.propTypes = {points: PropTypes.array.isRequired, name: PropTypes.string.isRequired,
    unit: PropTypes.string.isRequired, locale: PropTypes.string.isRequired};
export default SimLabMeasurementPlot;
