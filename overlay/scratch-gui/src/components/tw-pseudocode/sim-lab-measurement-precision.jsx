// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
const number = value => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : '—';
// Keep incomplete number edits local; analysis only receives a committed value.
export class PrecisionThresholdInput extends React.Component {
    constructor (props) {
        super(props);
        this.state = {draft: String(props.value)};
        this.dirty = false;
        this.commit = this.commit.bind(this);
        this.keyDown = this.keyDown.bind(this);
    }

    componentDidUpdate (previous) {
        if (previous.value !== this.props.value || (!previous.disabled && this.props.disabled)) {
            this.dirty = false;
            this.setState({draft: String(this.props.value)});
        }
    }

    commit () {
        if (!this.dirty) return;
        this.dirty = false;
        const {value, disabled, onCommit} = this.props;
        const parsed = this.state.draft.trim() === '' ? NaN : Number(this.state.draft);
        const valid = !disabled && Number.isFinite(parsed) && Math.abs(parsed) <= 1e9;
        this.setState({draft: String(valid ? parsed : value)});
        if (valid && parsed !== value) onCommit(parsed);
    }

    keyDown (event) {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        const input = event.currentTarget;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
            this.dirty = false;
            this.setState({draft: String(this.props.value)}, () => input.blur());
        } else {
            // Blur commits once, before a subsequent analysis-toggle click.
            input.blur();
        }
    }

    render () {
        return <input type="number" step="any" min={-1e9} max={1e9} data-testid="bw-sim-precision-threshold"
            value={this.state.draft} disabled={this.props.disabled}
            onChange={event => { if (!this.props.disabled) { this.dirty = true; this.setState({draft: event.target.value}); } }}
            onBlur={this.commit} onKeyDown={this.keyDown} />;
    }
}
PrecisionThresholdInput.propTypes = {value: PropTypes.number.isRequired, disabled: PropTypes.bool, onCommit: PropTypes.func.isRequired};
const SimLabMeasurementPrecision = ({locale, session, definitions, enabled, replaying, onToggle, options = {mode: 'oscillation', thresholdDegrees: 0}, onOptions}) => {
    const thresholdInput = React.useRef(null);
    const de = locale === 'de', analysis = session?.measurementPrecision;
    return <section data-testid="bw-sim-measurement-precision" aria-label={de ? 'Zeitschritt-Auswertung' : 'Fixed-step analysis'}>
        <h4>{de ? 'Periode, Phase und Arbeit' : 'Period, phase and work'}</h4>
        <p>{de ? 'Wähle Gelenkmessungen für Diagramme, dann starte die Auswertung. Periode: aufsteigende Schwellendurchgänge oder volle Umdrehungen. Phase: Verzögerung zum ersten gewählten Drehgelenk. Arbeit: vorzeichenbehaftete Summe aus Motorleistung × Zeitschritt seit Start.' :
            'Select joint measurement plots, then start analysis. Period uses rising threshold crossings or full rotations. Phase is lag relative to the first selected hinge. Work is the signed sum of motor power × fixed step since starting.'}</p>
        <label>{de ? 'Periodenmodus' : 'Period mode'} <select data-testid="bw-sim-precision-mode" value={options.mode} disabled={enabled || replaying} onChange={e => onOptions?.({...options, mode: e.target.value})}>
            <option value="oscillation">{de ? 'Aufsteigende Durchgänge' : 'Rising crossings'}</option><option value="rotation">{de ? 'Volle Umdrehungen' : 'Full rotations'}</option>
        </select></label>
        <label>{de ? 'Winkelschwelle (°)' : 'Angle threshold (°)'} <PrecisionThresholdInput ref={thresholdInput} value={options.thresholdDegrees}
            disabled={enabled || replaying} onCommit={value => onOptions?.({...options, thresholdDegrees: value})} /></label>
        <button type="button" disabled={replaying} onClick={() => { thresholdInput.current?.commit(); onToggle?.(); }} data-testid="bw-sim-measurement-precision-toggle">{enabled ? (de ? 'Auswertung beenden' : 'Stop analysis') : (de ? 'Auswertung starten' : 'Start analysis')}</button>
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
    options: PropTypes.object, onOptions: PropTypes.func, enabled: PropTypes.bool, replaying: PropTypes.bool, onToggle: PropTypes.func};
export default SimLabMeasurementPrecision;
