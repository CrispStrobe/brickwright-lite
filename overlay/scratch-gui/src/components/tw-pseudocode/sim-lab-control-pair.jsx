// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import {createControlPair, compareControlPair} from '../../lib/bw-sim/measurements/control-pairs.js';
import {EXPERIMENT_SCHEMA, RECORDING_TRACE_LIMIT} from '../../lib/bw-sim/measurements/experiments.js';

const h = React.createElement;
const roles = ['baseline', 'control'];
const fieldStyle = {maxWidth: '100%', minWidth: 0};
const hashStyle = {overflowWrap: 'anywhere', fontSize: 10};
const number = value => Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : '—';
const emptyMapping = () => ({baselineId: '', controlId: ''});
const emptyDraft = () => ({baseline: '', control: '', baselineSignature: '', controlSignature: '', mappings: [emptyMapping()], error: ''});
const words = locale => locale === 'de' ? {
    title: 'Expliziter Modellvergleich', baseline: 'Ausgangsmodell', control: 'Kontrollmodell', chooseRun: 'Messreihe ausdrücklich wählen',
    chooseMeasurement: 'Messung ausdrücklich zuordnen', add: 'Zuordnung hinzufügen', remove: 'Zuordnung entfernen', apply: 'Modellvergleich anwenden', clear: 'Modellvergleich löschen',
    replace: 'Anwenden ersetzt die zwei normalen Messreihenplätze dieses Modells. Beide ursprünglichen Modellidentitäten und Bindungen bleiben erhalten.',
    rule: 'Wähle zwei unterschiedliche Modelle; eines muss das aktuelle Modell sein. Ordne Messungen ausdrücklich zu. Es gibt keine automatische Zuordnung, Vorzeichenkorrektur oder Interpolation.',
    busy: 'Während Aufzeichnung oder Wiedergabe kann der Vergleich nicht geändert werden.',
    stale: 'Die gewählte Messreihe wurde geändert oder entfernt. Bitte erneut wählen.',
    invalidHistory: 'Einige gespeicherte Messreihen sind nicht auswählbar oder haben mehrdeutige Identitäten.',
    currentChanged: 'Das aktuelle Modell wurde geändert. Wähle die Messreihen erneut.',
    failed: 'Modellvergleich abgelehnt', direction: 'Differenz = Kontrollmodell − Ausgangsmodell',
    exact: 'Nur exakt gemeinsame verstrichene Simulationszeiten; Lücken bleiben nicht verfügbar.', none: 'Keine exakt gemeinsamen Simulationszeiten.',
    time: 'Verstrichene Zeit (ms)', delta: 'Differenz', unavailable: 'Nicht verfügbar', binding: 'Gespeicherte Definition und Bindung',
    canonical: 'Kanonische Modell-SHA256', original: 'Ursprüngliche Modell-SHA256', raw: 'SHA256 des geöffneten Modelltexts',
    origin: 'Herkunft', simulation: 'Simulation', csv: 'CSV-Import', unknown: 'Historische Herkunft nicht angegeben', run: 'Messreihe'
} : {
    title: 'Explicit model control comparison', baseline: 'Baseline model', control: 'Control model', chooseRun: 'Explicitly choose a run',
    chooseMeasurement: 'Explicitly map a measurement', add: 'Add mapping', remove: 'Remove mapping', apply: 'Apply control pair', clear: 'Clear control pair',
    replace: 'Applying replaces this model’s two ordinary recording slots. Both original model identities and bindings are retained.',
    rule: 'Choose two different models, including the current model. Explicitly map measurements. No automatic matching, sign correction or interpolation is applied.',
    busy: 'Comparison editing is disabled during recording or replay.',
    stale: 'The selected history changed or disappeared. Choose its run again.',
    invalidHistory: 'Some saved histories are unavailable or have ambiguous identities.', currentChanged: 'The current model changed. Choose the runs again.',
    failed: 'Control comparison refused', direction: 'Difference = control − baseline',
    exact: 'Only exact shared elapsed simulation times are compared; unavailable values remain gaps.', none: 'No exact shared simulation times.',
    time: 'Elapsed time (ms)', delta: 'Difference', unavailable: 'Unavailable', binding: 'Retained definition and binding',
    canonical: 'Canonical model SHA256', original: 'Original model SHA256', raw: 'Opened model text SHA256',
    origin: 'Origin', simulation: 'Simulation', csv: 'CSV import', unknown: 'Historical origin unspecified', run: 'Run'
};

/** Standalone editor: onPair/onClear own persistence and ordinary-recorder replacement. */
export default class SimLabControlPair extends React.Component {
    constructor (props) {
        super(props);
        this.state = emptyDraft();
        this.comparisonCache = null;
    }
    componentDidUpdate (previous) {
        if (previous.context?.modelSha256 !== this.props.context?.modelSha256) {
            this.setState({...emptyDraft(), error: words(this.props.locale).currentChanged});
        }
    }
    options () {
        const byKey = new Map(), ambiguous = new Set();
        let invalid = false;
        for (const history of this.props.histories || []) {
            if (!history || typeof history.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(history.modelSha256) ||
                history.packet?.schema !== EXPERIMENT_SCHEMA || history.packet.modelSha256 !== history.modelSha256 ||
                !Array.isArray(history.packet.runs)) { invalid = true; continue; }
            for (const run of history.packet.runs) {
                if (!run || typeof run.id !== 'string' || !Array.isArray(run.definitions)) { invalid = true; continue; }
                const key = `${history.modelSha256}:${run.id}`;
                if (byKey.has(key)) { ambiguous.add(key); invalid = true; continue; }
                byKey.set(key, {key, history, run, signature: JSON.stringify({modelSha256: history.modelSha256, run})});
            }
        }
        return {byKey, ambiguous, invalid};
    }
    chooseRun (role, key) {
        if (this.props.disabled || !roles.includes(role)) return;
        const options = this.options(), selected = options.byKey.get(key);
        if (!selected || options.ambiguous.has(key)) {
            this.setState({[role]: '', [`${role}Signature`]: '', mappings: [emptyMapping()], error: ''});
            return;
        }
        this.setState({[role]: key, [`${role}Signature`]: selected.signature, mappings: [emptyMapping()], error: ''});
    }
    mapMeasurement (index, role, id) {
        if (this.props.disabled || !roles.includes(role)) return;
        this.setState(state => ({mappings: state.mappings.map((mapping, n) => n === index ? {...mapping, [`${role}Id`]: id} : mapping), error: ''}));
    }
    addMapping () {
        if (this.props.disabled) return;
        this.setState(state => state.mappings.length >= RECORDING_TRACE_LIMIT ? null : {mappings: [...state.mappings, emptyMapping()], error: ''});
    }
    removeMapping (index) {
        if (this.props.disabled) return;
        this.setState(state => ({mappings: state.mappings.filter((_, n) => n !== index), error: ''}));
    }
    apply () {
        if (this.props.disabled) return;
        const T = words(this.props.locale), options = this.options();
        try {
            const selected = Object.fromEntries(roles.map(role => {
                const option = options.byKey.get(this.state[role]);
                if (!option || options.ambiguous.has(option.key) || option.signature !== this.state[`${role}Signature`]) throw new Error(T.stale);
                return [role, option];
            }));
            const context = this.props.context;
            const side = role => ({packet: selected[role].history.packet, runId: selected[role].run.id,
                context: selected[role].history.modelSha256 === context?.modelSha256 ? context : {modelSha256: selected[role].history.modelSha256}});
            const packet = createControlPair({baseline: side('baseline'), control: side('control'),
                mappings: this.state.mappings, modelSha256: context?.modelSha256});
            this.props.onPair(packet);
            this.setState({error: ''});
        } catch (error) { this.setState({error: `${T.failed}: ${error.message}`}); }
    }
    clear () {
        if (this.props.disabled || !this.props.pair) return;
        this.props.onClear();
        this.setState(emptyDraft());
    }
    comparison () {
        const pair = this.props.pair, context = this.props.context;
        if (!pair) return {results: []};
        const signature = JSON.stringify(context);
        if (this.comparisonCache?.pair === pair && this.comparisonCache.signature === signature) return this.comparisonCache.value;
        let value;
        try { value = {results: compareControlPair(pair, context)}; }
        catch (error) { value = {results: [], error: error.message}; }
        this.comparisonCache = {pair, signature, value};
        return value;
    }
    render () {
        const T = words(this.props.locale), options = this.options(), chosen = roles.map(role => options.byKey.get(this.state[role]));
        const ready = !this.props.disabled && chosen.every(Boolean) &&
            chosen.every((option, index) => !options.ambiguous.has(option.key) && option.signature === this.state[`${roles[index]}Signature`]) &&
            chosen[0].history.modelSha256 !== chosen[1].history.modelSha256 &&
            chosen.some(option => option.history.modelSha256 === this.props.context?.modelSha256) &&
            this.state.mappings.length > 0 && this.state.mappings.every(mapping => mapping.baselineId && mapping.controlId);
        const comparison = this.comparison();
        const description = (role, value) => h('div', {key: role, style: hashStyle},
            h('strong', null, T[role]),
            h('p', null, `${T.canonical}: ${value.canonicalModelSha256}`),
            h('p', null, `${T.original}: ${value.modelSha256}`),
            value.rawModelSha256 && h('p', null, `${T.raw}: ${value.rawModelSha256}`),
            h('p', null, `${T.run}: ${value.runId} · ${T.origin}: ${T[value.origin] || T.unknown}`));
        return h('section', {'data-testid': 'bw-sim-control-pair', 'aria-label': T.title, style: {borderTop: '1px solid #cbd5e1', marginTop: 8, paddingTop: 6}},
            h('strong', null, T.title), h('p', null, T.replace), h('p', null, T.rule),
            this.props.disabled && h('p', {role: 'status'}, T.busy),
            options.invalid && h('p', {role: 'status'}, T.invalidHistory),
            ...roles.map(role => h('label', {key: role, style: {display: 'block'}}, T[role], ' ',
                h('select', {'data-testid': `bw-sim-control-pair-${role}`, value: this.state[role], disabled: this.props.disabled, style: fieldStyle,
                    onChange: event => this.chooseRun(role, event.target.value)},
                h('option', {value: ''}, T.chooseRun), ...[...options.byKey.values()].map(option => h('option', {key: option.key, value: option.key,
                    disabled: options.ambiguous.has(option.key)}, `${T[role]} · ${option.history.modelSha256} · ${option.run.id}`))))),
            ...this.state.mappings.map((mapping, index) => h('fieldset', {key: index, disabled: this.props.disabled, style: {minWidth: 0}},
                h('legend', null, `${index + 1}`),
                ...roles.map((role, side) => h('label', {key: role, style: {display: 'block'}}, T[role], ' ',
                    h('select', {'data-testid': `bw-sim-control-pair-${role}-measurement-${index}`, value: mapping[`${role}Id`],
                        disabled: this.props.disabled || !chosen[side], style: fieldStyle, onChange: event => this.mapMeasurement(index, role, event.target.value)},
                    h('option', {value: ''}, T.chooseMeasurement), ...(chosen[side]?.run.definitions || []).map(definition => h('option', {
                        key: definition.id, value: definition.id}, `${definition.label} · ${definition.id} · ${definition.kind}`))))),
                h('button', {type: 'button', 'data-testid': `bw-sim-control-pair-remove-${index}`, disabled: this.props.disabled,
                    onClick: () => this.removeMapping(index)}, T.remove))),
            h('button', {type: 'button', 'data-testid': 'bw-sim-control-pair-add', disabled: this.props.disabled || this.state.mappings.length >= RECORDING_TRACE_LIMIT,
                onClick: () => this.addMapping()}, T.add),
            h('button', {type: 'button', 'data-testid': 'bw-sim-control-pair-apply', disabled: !ready, onClick: () => this.apply()}, T.apply),
            h('button', {type: 'button', 'data-testid': 'bw-sim-control-pair-clear', disabled: this.props.disabled || !this.props.pair, onClick: () => this.clear()}, T.clear),
            this.state.error && h('p', {role: 'status'}, this.state.error),
            comparison.error && h('p', {role: 'status'}, `${T.failed}: ${comparison.error}`),
            comparison.results.length > 0 && h('div', {'data-testid': 'bw-sim-control-pair-comparison'},
                h('p', null, T.direction), h('p', null, T.exact),
                ...roles.map(role => description(role, comparison.results[0][role])),
                ...comparison.results.map(result => h('section', {key: result.id, 'aria-label': result.label},
                    h('strong', null, `${result.label} · ${result.kind} · ${result.unit} · ${result.source || T.unknown}`),
                    ...roles.map(role => h('details', {key: role}, h('summary', null, `${T[role]}: ${T.binding}`),
                        h('pre', {style: {...hashStyle, whiteSpace: 'pre-wrap'}}, JSON.stringify(result[role].definition)))),
                    !result.pairs.length && h('p', {role: 'status'}, T.none),
                    h('table', null, h('caption', null, result.label),
                        h('thead', null, h('tr', null, ...[T.time, T.baseline, T.control, T.delta].map(label => h('th', {key: label, scope: 'col'}, label)))),
                        h('tbody', null, ...result.pairs.map(pair => h('tr', {key: pair.elapsedMs},
                            h('th', {scope: 'row'}, number(pair.elapsedMs)),
                            h('td', {title: pair.baselineReason || ''}, pair.a === null ? T.unavailable : number(pair.a)),
                            h('td', {title: pair.controlReason || ''}, pair.b === null ? T.unavailable : number(pair.b)),
                            h('td', {title: pair.reason || ''}, pair.available ? number(pair.delta) : T.unavailable)))))))));
    }
}
SimLabControlPair.propTypes = {
    locale: PropTypes.string.isRequired, context: PropTypes.object, histories: PropTypes.array.isRequired,
    pair: PropTypes.object, disabled: PropTypes.bool, onPair: PropTypes.func.isRequired, onClear: PropTypes.func.isRequired
};
