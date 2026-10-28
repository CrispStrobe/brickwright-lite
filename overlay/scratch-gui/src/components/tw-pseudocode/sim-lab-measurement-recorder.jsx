// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import {compareMeasurementRuns, createMeasurementRecorder, measurementRunsToCsv, RECORDING_LIMIT} from '../../lib/bw-sim/measurements/recording.js';
import {CSV_BYTE_LIMIT} from '../../lib/bw-sim/measurements/experiments.js';

const words = locale => locale === 'de' ? {
    title: 'Messreihen', start: 'Aufzeichnung starten', stop: 'Aufzeichnung beenden', clear: 'Alle Messreihen löschen',
    run: 'Messreihe', active: 'Aufzeichnung läuft', stopped: 'Aufzeichnung beendet', replay: 'Während der Wiedergabe nicht verfügbar',
    limitReached: 'Die Aufzeichnung hat ihre Messpunkt- oder Simulationszeitgrenze erreicht.', samples: 'Messpunktgruppen',
    bound: 'Maximal 2 Messreihen mit je 600 Messpunkten oder 60 Sekunden und bis zu 4 Messungen. Zeit läuft in Simulationszeit.',
    noSelection: 'Wähle zuerst mindestens eine Messung für ein Zeitdiagramm aus.',
    changed: 'Aufzeichnung wegen Modell-, Messungs-, Sitzungs- oder Wiedergabewechsel beendet.',
    mismatch: 'Die zweite Messreihe braucht dasselbe Modell und dieselben Messungen mit denselben Bindungen.',
    shared: 'Gemeinsame Simulationszeiten', none: 'Keine exakt gemeinsamen Simulationszeiten; es wird nichts interpoliert.',
    time: 'Zeit (ms)', first: 'Messreihe 1', second: 'Messreihe 2', delta: 'Änderung (2 − 1)',
    min: 'Minimum', max: 'Maximum', unavailable: 'Nicht verfügbar', export: 'CSV herunterladen', import: 'CSV importieren', importHelp: 'Import fügt passende Messreihen hinzu. Vor dem Ersetzen vorhandene Messreihen löschen.', importFailed: 'CSV-Import abgelehnt', imported: 'CSV-Messreihen importiert', csvOrigin: 'Importierte CSV-Daten', simulationOrigin: 'Hier aufgezeichnet'
} : {
    title: 'Run recordings', start: 'Start recording', stop: 'Stop recording', clear: 'Clear recordings',
    run: 'Run', active: 'Recording', stopped: 'Recording stopped', replay: 'Unavailable during pose replay',
    limitReached: 'Recording reached its sample or simulated-time limit.', samples: 'sample sets',
    bound: 'Up to 2 runs, 600 sample sets or 60 seconds each, and 4 measurements. Time is simulated time.',
    noSelection: 'Select at least one measurement plot first.',
    changed: 'Recording stopped after a model, measurement, session or replay change.',
    mismatch: 'The second run must use the same model and measurements with the same bindings.',
    shared: 'Shared simulation times', none: 'No exact shared simulation times; no interpolation is used.',
    time: 'Time (ms)', first: 'Run 1', second: 'Run 2', delta: 'Change (2 − 1)',
    min: 'Minimum', max: 'Maximum', unavailable: 'Unavailable', export: 'Download CSV', import: 'Import CSV', importHelp: 'Import adds compatible runs. Clear existing recordings before replacing them.', importFailed: 'CSV import refused', imported: 'CSV runs imported', csvOrigin: 'Imported CSV data', simulationOrigin: 'Recorded here'
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
        this.state = {snapshot: this.recorder.snapshot(), importStatus: '', windowStart: '', windowDuration: '10'};
        this.importFile = React.createRef();
        this.importRevision = 0;
    }
    componentDidUpdate (previous) {
        if (previous.recorder !== this.props.recorder && this.props.recorder) {
            this.importRevision++;
            this.recorder.stop('panel-closed');
            this.recorder = this.props.recorder;
            this.setState({snapshot: this.recorder.snapshot()});
            return;
        }
        const keys = ['recorderRevision', 'modelContext', 'session', 'modelKey', 'definitions', 'selected', 'rows', 'sampleTime', 'replaying', 'paused'];
        if (keys.every(key => previous[key] === this.props[key])) return;
        const snapshot = this.recorder.update(this.recordingProps());
        if (JSON.stringify(snapshot) !== JSON.stringify(this.state.snapshot)) {
            const ended = this.state.snapshot.active && !snapshot.active;
            this.setState({snapshot}, () => { if (ended) this.props.onHistoryChanged?.(); });
        }
    }
    componentWillUnmount () {
        this.importRevision++;
        this.recorder.stop('panel-closed');
    }
    recordingProps () {
        return {...this.props, canonicalModelSha256: this.props.modelContext?.modelSha256, rawModelSha256: this.props.modelContext?.rawModelSha256};
    }
    start () {
        if (this.props.pairActive) return;
        this.importRevision++;
        this.recorder.start(this.recordingProps());
        this.setState({snapshot: this.recorder.update(this.recordingProps())});
    }
    startWindow () {
        if (this.props.pairActive) return;
        try {
            const startTimeMs = Number(this.state.windowStart) * 1000, durationMs = Number(this.state.windowDuration) * 1000;
            if (this.state.windowStart.trim() === '' || this.state.windowDuration.trim() === '') throw new Error('Choose a start time and duration');
            this.importRevision++;
            this.recorder.start({...this.recordingProps(), window: {schema: 'bw.sim-lab.recording-window.v1', startTimeMs, durationMs}});
            this.setState({snapshot: this.recorder.update(this.recordingProps()), importStatus: ''});
        } catch (error) { this.setState({importStatus: error.message}); }
    }
    stop () {
        this.setState({snapshot: this.recorder.stop('stopped')}, () => this.props.onHistoryChanged?.());
    }
    clear () {
        this.importRevision++;
        this.setState({snapshot: this.recorder.clear(), importStatus: ''}, () => this.props.onHistoryChanged?.());
    }
    exportCsv () {
        download(measurementRunsToCsv(this.state.snapshot.runs));
    }
    async importCsv (event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const revision = ++this.importRevision, session = this.props.session, modelKey = this.props.modelKey;
        const context = this.props.modelContext, definitions = JSON.stringify(this.props.definitions);
        const current = () => revision === this.importRevision && session === this.props.session && modelKey === this.props.modelKey &&
            context === this.props.modelContext && definitions === JSON.stringify(this.props.definitions) && !this.props.replaying;
        try {
            if (this.props.pairActive) throw new Error('Clear the explicit control pair before importing ordinary runs');
            if (this.props.recordingAllowed === false) throw new Error('Four model histories are retained; export or clear a recording first');
            if (!context || !Number.isFinite(file.size) || file.size > CSV_BYTE_LIMIT) throw new Error('CSV file is too large or no model is ready');
            const text = await file.text();
            if (!current()) return;
            const snapshot = this.recorder.importCsv(text, {...context, definitions: this.props.definitions});
            this.props.onRestoredSelection?.(snapshot.runs[0]?.definitions.map(d => d.id) || []);
            this.setState({snapshot, importStatus: words(this.props.locale).imported}, () => this.props.onHistoryChanged?.());
        } catch (error) {
            if (current()) this.setState({importStatus: `${words(this.props.locale).importFailed}: ${error.message}`});
        }
    }
    render () {
        const T = words(this.props.locale), snapshot = this.state.snapshot, runs = snapshot.runs;
        const comparison = snapshot.compatible ? compareMeasurementRuns(runs) : [];
        const hasExactSharedTimes = comparison.some(measurement => measurement.pairs.some(pair => pair.available));
        const selectedDefinitions = this.props.definitions.filter(d => this.props.selected.includes(d.id) && d.visible !== false).slice(0, 4);
        const status = this.props.replaying ? T.replay : snapshot.armed ? (this.props.locale === 'de' ? 'Wartet auf Simulationszeitfenster' : 'Armed for simulated-time window') : snapshot.active ? `${T.active} · ${snapshot.sampleCount}/${snapshot.sampleLimit}` :
            snapshot.stoppedReason === 'different-model-or-measurements' ? T.mismatch :
                ['sample-limit', 'time-limit'].includes(snapshot.stoppedReason) ? T.limitReached :
                snapshot.stoppedReason && snapshot.stoppedReason !== 'stopped' ? T.changed : '';
        return <section aria-label={T.title} data-testid="bw-sim-measurement-recorder" style={{borderTop: '1px solid #cbd5e1', marginTop: 8, paddingTop: 6}}>
            <strong>{T.title}</strong>
            <p>{T.bound}</p>
            {this.props.pairActive && <p role="status">{this.props.locale === 'de' ? 'Der ausdrückliche Modellvergleich belegt beide Messreihenplätze. Zum Aufzeichnen zuerst den Vergleich löschen.' : 'The explicit control pair occupies both run slots. Clear it before recording ordinary runs.'}</p>}
            <p>{T.importHelp}</p>
            {this.props.recordingAllowed === false && <p role="status">{this.props.locale === 'de' ? 'Vier Modell-Messreihen sind vorgemerkt. Eine exportieren oder löschen, bevor weitere aufgezeichnet werden.' : 'Four model histories are retained. Export or clear a recording before capturing another model.'}</p>}
            <input ref={this.importFile} type="file" accept=".csv,text/csv" style={{display: 'none'}} data-testid="bw-sim-measurement-record-import-file" onChange={event => this.importCsv(event)} />
            {this.state.importStatus && <p role="status" data-testid="bw-sim-measurement-record-import-status">{this.state.importStatus}</p>}
            {status && <p role="status" data-testid="bw-sim-measurement-recorder-status">{status}</p>}
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 5}}>
                {snapshot.active ? <button type="button" data-testid="bw-sim-measurement-record-stop" onClick={() => this.stop()}>{T.stop}</button> :
                    <button type="button" data-testid="bw-sim-measurement-record-start" disabled={this.props.pairActive || this.props.recordingAllowed === false || this.props.replaying || !this.props.modelKey || !selectedDefinitions.length || runs.length >= RECORDING_LIMIT}
                        onClick={() => this.start()}>{T.start}</button>}
                <button type="button" data-testid="bw-sim-measurement-record-import" disabled={this.props.pairActive || this.props.recordingAllowed === false || snapshot.active || this.props.replaying || !this.props.modelContext || runs.length >= RECORDING_LIMIT} onClick={() => this.importFile.current?.click()}>{T.import}</button>
                {runs.length > 0 && <button type="button" data-testid="bw-sim-measurement-record-export" onClick={() => this.exportCsv()}>{T.export}</button>}
                {runs.length > 0 && <button type="button" data-testid="bw-sim-measurement-record-clear" onClick={() => this.clear()}>{T.clear}</button>}
            </div>
            <fieldset disabled={this.props.pairActive || snapshot.active || this.props.replaying || this.props.recordingAllowed === false || runs.length >= RECORDING_LIMIT}>
                <legend>{this.props.locale === 'de' ? 'Zeitfenster für lange Läufe' : 'Window for long runs'}</legend>
                <label>{this.props.locale === 'de' ? 'Absolute Startzeit (s)' : 'Absolute start time (s)'} <input data-testid="bw-sim-window-start" type="number" min="0" step="0.1" value={this.state.windowStart} onChange={e => this.setState({windowStart: e.target.value})} /></label>
                <label>{this.props.locale === 'de' ? 'Dauer (s, höchstens 60)' : 'Duration (s, at most 60)'} <input data-testid="bw-sim-window-duration" type="number" min="0.1" max="60" step="0.1" value={this.state.windowDuration} onChange={e => this.setState({windowDuration: e.target.value})} /></label>
                <button type="button" data-testid="bw-sim-window-arm" disabled={!selectedDefinitions.length} onClick={() => this.startWindow()}>{this.props.locale === 'de' ? 'Zeitfenster vormerken' : 'Arm window'}</button>
                <p>{this.props.locale === 'de' ? 'Keine Daten vor Start. Verpasste Fenster werden nicht verschoben; Speichern oder Modellwechsel bricht ab.' : 'No pre-start buffer. Missed windows are not shifted; saving or changing models cancels arming.'}</p>
            </fieldset>
            <ul data-testid="bw-sim-measurement-record-runs" style={{paddingLeft: 18}}>
                {runs.map((run, index) => <li key={run.id}>{T.run} {index + 1}: {run.samples.length} {T.samples}{run.window ? ` · ${run.window.startTimeMs / 1000}s / ${run.window.durationMs / 1000}s` : ''}{run.origin === 'csv' ? ` · ${T.csvOrigin}` : run.origin === 'simulation' ? ` · ${T.simulationOrigin}` : ''}</li>)}
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
    pairActive: PropTypes.bool,
    locale: PropTypes.string.isRequired, session: PropTypes.object, modelKey: PropTypes.string.isRequired,
    definitions: PropTypes.array.isRequired, selected: PropTypes.array.isRequired, rows: PropTypes.array.isRequired,
    modelContext: PropTypes.object, recorderRevision: PropTypes.number, recordingAllowed: PropTypes.bool, onHistoryChanged: PropTypes.func, onRestoredSelection: PropTypes.func, sampleTime: PropTypes.number, replaying: PropTypes.bool, paused: PropTypes.bool, recorder: PropTypes.object
};
