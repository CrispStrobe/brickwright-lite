// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
const number = value => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : '—';
const SimLabMeasurementPrecision = ({locale, session, definitions, enabled, replaying, onToggle}) => {
    const de = locale === 'de', analysis = session?.measurementPrecision;
    return <section data-testid="bw-sim-measurement-precision" aria-label={de ? 'Zeitschritt-Auswertung' : 'Fixed-step analysis'}>
        <h4>{de ? 'Periode, Phase und Arbeit' : 'Period, phase and work'}</h4>
        <p>{de ? 'Wähle Gelenkmessungen für Diagramme, dann starte die Auswertung. Periode: aufsteigende Winkelnulldurchgänge. Phase: Verzögerung zum ersten gewählten Drehgelenk. Arbeit: vorzeichenbehaftete Summe aus Motorleistung × Zeitschritt seit Start.' :
            'Select joint measurement plots, then start analysis. Period uses rising angle-zero crossings. Phase is lag relative to the first selected hinge. Work is the signed sum of motor power × fixed step since starting.'}</p>
        <button type="button" disabled={replaying} onClick={onToggle} data-testid="bw-sim-measurement-precision-toggle">{enabled ? (de ? 'Auswertung beenden' : 'Stop analysis') : (de ? 'Auswertung starten' : 'Start analysis')}</button>
        {enabled && !replaying && <>
            {analysis?.gap && <p role="status">{de ? 'Beobachtungslücke: Gesamtarbeit nicht verfügbar. Neu starten für eine vollständige Auswertung.' : 'Observation gap: total work unavailable. Restart for a complete analysis.'}</p>}
            {!analysis?.rows.length && <p>{de ? 'Zuerst ein Gelenkdiagramm wählen.' : 'Select a joint plot first.'}</p>}
            <table><thead><tr><th>{de ? 'Messung' : 'Measurement'}</th><th>{de ? 'Periode (s)' : 'Period (s)'}</th><th>{de ? 'Phasenverzögerung (°)' : 'Phase lag (°)'}</th><th>{de ? 'Motorarbeit (J)' : 'Motor work (J)'}</th></tr></thead>
                <tbody>{analysis?.rows.map(row => <tr key={row.joint}><th>{definitions.find(d => d.joint === row.joint)?.label || row.joint}</th><td>{number(row.periodSeconds)}</td><td>{number(row.phaseDegrees)}</td><td>{number(row.workJ)}</td></tr>)}</tbody></table>
            <p>{de ? 'Auswertung akzeptierter Simulationsschritte; keine physikalische Kalibrierung oder Genauigkeit unterhalb des Zeitschritts.' : 'Analysis of accepted simulation steps; no physical calibration or substep accuracy claim.'}</p>
        </>}
    </section>;
};
SimLabMeasurementPrecision.propTypes = {locale: PropTypes.string, session: PropTypes.object, definitions: PropTypes.array.isRequired,
    enabled: PropTypes.bool, replaying: PropTypes.bool, onToggle: PropTypes.func};
export default SimLabMeasurementPrecision;
