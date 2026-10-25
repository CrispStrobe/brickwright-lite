// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import {compareMeasurementRuns, createMeasurementRecorder, measurementRunsToCsv, RECORDING_LIMIT} from '../../lib/bw-sim/measurements/recording.js';

const words = locale => locale === 'de' ? {
    title: 'Messreihen', start: 'Aufzeichnung starten', stop: 'Aufzeichnung beenden', clear: 'Alle Messreihen löschen',
    run: 'Messreihe', active: 'Aufzeichnung läuft', stopped: 'Aufzeichnung beendet', replay: 'Während der Wiedergabe nicht verfügbar',
    limitReached: 'Die Messreihe hat 600 Messpunkte erreicht.',
    bound: 'Maximal 2 Messreihen mit je 600 Messpunkten oder 60 Sekunden und bis zu 4 Messungen. Zeit läuft in Simulationszeit.',
    noSelection: 'Wähle zuerst mindestens eine Messung für ein Zeitdiagramm aus.',
    changed: 'Aufzeichnung wegen Modell-, Messungs-, Sitzungs- oder Wiedergabewechsel beendet.',
    mismatch: 'Die zweite Messreihe braucht dasselbe Modell und dieselben Messungen mit denselben Bindungen.',
    shared: 'Gemeinsame Simulationszeiten', none: 'Keine exakt gemeinsamen Simulationszeiten; es wird nichts interpoliert.',
    time: 'Zeit (ms)', first: 'Messreihe 1', second: 'Messreihe 2', delta: 'Änderung (2 − 1)',
    min: 'Minimum', max: 'Maximum', unavailable: 'Nicht verfügbar', export: 'CSV herunterladen'
} : {
    title: 'Run recordings', start: 'Start recording', stop: 'Stop recording', clear: 'Clear recordings',
    run: 'Run', active: 'Recording', stopped: 'Recording stopped', replay: 'Unavailable during pose replay',
    limitReached: 'The run reached its 600 sample limit.',
    bound: 'Up to 2 runs, 600 sample sets or 60 seconds each, and 4 measurements. Time is simulated time.',
    noSelection: 'Select at least one measurement plot first.',
    changed: 'Recording stopped after a model, measurement, session or replay change.',
    mismatch: 'The second run must use the same model and measurements with the same bindings.',
    shared: 'Shared simulation times', none: 'No exact shared simulation times; no interpolation is used.',
    time: 'Time (ms)', first: 'Run 1', second: 'Run 2', delta: 'Change (2 − 1)',
    min: 'Minimum', max: 'Maximum', unavailable: 'Unavailable', export: 'Download CSV'
};

const number = value => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : '—';
const download = csv => {
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'robot-lab-measurement-runs.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default class SimLabMeasurementRecorder extends React.Component {
    constructor (props) {
        super(props);
        this.recorder = props.recorder || createMeasurementRecorder();
        this.state = {snapshot: this.recorder.snapshot()};
    }
    componentDidUpdate (previous) {
        if (previous.recorder !== this.props.recorder && this.props.recorder) {
            this.recorder.stop('panel-closed');
            this.recorder = this.props.recorder;
            this.setState({snapshot: this.recorder.snapshot()});
            return;
        }
        const keys = ['session', 'modelKey', 'definitions', 'selected', 'rows', 'sampleTime', 'replaying', 'paused'];
        if (keys.every(key => previous[key] === this.props[key])) return;
        const snapshot = this.recorder.update(this.props);
        if (JSON.stringify(snapshot) !== JSON.stringify(this.state.snapshot)) this.setState({snapshot});
    }
    componentWillUnmount () {
        this.recorder.stop('panel-closed');
    }
    start () {
        this.recorder.start(this.props);
        this.setState({snapshot: this.recorder.update(this.props)});
    }
    stop () {
        this.setState({snapshot: this.recorder.stop('stopped')});
    }
    clear () {
        this.setState({snapshot: this.recorder.clear()});
    }
    exportCsv () {
        download(measurementRunsToCsv(this.state.snapshot.runs));
    }
    render () {
        const T = words(this.props.locale), snapshot = this.state.snapshot, runs = snapshot.runs;
        const comparison = snapshot.compatible ? compareMeasurementRuns(runs) : [];
        const hasExactSharedTimes = comparison.some(measurement => measurement.pairs.some(pair => pair.available));
        const selectedDefinitions = this.props.definitions.filter(d => this.props.selected.includes(d.id) && d.visible !== false).slice(0, 4);
        const status = this.props.replaying ? T.replay : snapshot.active ? `${T.active} · ${snapshot.sampleCount}/${snapshot.sampleLimit}` :
            snapshot.stoppedReason === 'different-model-or-measurements' ? T.mismatch :
                snapshot.stoppedReason === 'sample-limit' ? T.limitReached :
                snapshot.stoppedReason && snapshot.stoppedReason !== 'stopped' ? T.changed : '';
        return <section aria-label={T.title} data-testid="bw-sim-measurement-recorder" style={{borderTop: '1px solid #cbd5e1', marginTop: 8, paddingTop: 6}}>
            <strong>{T.title}</strong>
            <p>{T.bound}</p>
            {status && <p role="status" data-testid="bw-sim-measurement-recorder-status">{status}</p>}
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 5}}>
                {snapshot.active ? <button type="button" data-testid="bw-sim-measurement-record-stop" onClick={() => this.stop()}>{T.stop}</button> :
                    <button type="button" data-testid="bw-sim-measurement-record-start" disabled={this.props.replaying || !this.props.modelKey || !selectedDefinitions.length || runs.length >= RECORDING_LIMIT}
                        onClick={() => this.start()}>{T.start}</button>}
                {runs.length > 0 && <button type="button" data-testid="bw-sim-measurement-record-export" onClick={() => this.exportCsv()}>{T.export}</button>}
                {runs.length > 0 && <button type="button" data-testid="bw-sim-measurement-record-clear" onClick={() => this.clear()}>{T.clear}</button>}
            </div>
            <ul data-testid="bw-sim-measurement-record-runs" style={{paddingLeft: 18}}>
                {runs.map((run, index) => <li key={run.id}>{T.run} {index + 1}: {run.samples.length} sample sets</li>)}
            </ul>
            {snapshot.compatible && <div data-testid="bw-sim-measurement-record-comparison">
                <h4>{T.shared}</h4>
                {!hasExactSharedTimes && <p role="status">{T.none}</p>}
                {comparison.map(measurement => <section key={measurement.id} aria-label={measurement.label}>
                    <strong>{measurement.label} · {measurement.unit}</strong>
                    <p>{T.first}: {T.min} {number(measurement.range[0].min)} · {T.max} {number(measurement.range[0].max)}; {T.second}: {T.min} {number(measurement.range[1].min)} · {T.max} {number(measurement.range[1].max)}</p>
                    <table><caption>{measurement.label} {T.shared.toLowerCase()}</caption>
                        <thead><tr><th scope="col">{T.time}</th><th scope="col">{T.first}</th><th scope="col">{T.second}</th><th scope="col">{T.delta}</th></tr></thead>
                        <tbody>{measurement.pairs.map(pair => <tr key={pair.elapsedMs}>
                            <th scope="row">{pair.elapsedMs}</th><td>{pair.available ? number(pair.a) : T.unavailable}</td>
                            <td>{pair.available ? number(pair.b) : T.unavailable}</td><td>{pair.available ? number(pair.delta) : '—'}</td>
                        </tr>)}</tbody>
                    </table>
                </section>)}
            </div>}
        </section>;
    }
}

SimLabMeasurementRecorder.propTypes = {
    locale: PropTypes.string.isRequired, session: PropTypes.object, modelKey: PropTypes.string.isRequired,
    definitions: PropTypes.array.isRequired, selected: PropTypes.array.isRequired, rows: PropTypes.array.isRequired,
    sampleTime: PropTypes.number, replaying: PropTypes.bool, paused: PropTypes.bool, recorder: PropTypes.object
};
