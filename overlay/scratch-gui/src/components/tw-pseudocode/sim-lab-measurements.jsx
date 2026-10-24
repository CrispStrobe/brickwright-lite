// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import SimLabMeasurementPlot from './sim-lab-measurement-plot.jsx';
import {createMeasurementHistory, PLOT_LIMIT} from '../../lib/bw-sim/measurements/history.js';
import {MEASUREMENT_KINDS, MEASUREMENT_LIMIT} from '../../lib/bw-sim/measurements/schema.js';
import {measurementText, jointBinding, ropeBinding} from '../../lib/bw-sim/measurements/readings.js';
import {jointTargetContext} from '../../lib/bw-sim/measurements/target-context.js';

export const measurementWords = locale => locale === 'de' ? {
    title: 'Messungen', close: 'Schließen', add: 'Messung hinzufügen', edit: 'Bearbeiten', save: 'Änderungen speichern', cancel: 'Abbrechen', remove: 'Entfernen', presets: 'Auf empfohlene Messungen zurücksetzen',
    show: 'Im Modell anzeigen', label: 'Name', kind: 'Messgröße', target: 'Teil', joint: 'Gelenk', rope: 'Seil', world: 'Boden',
    missing: 'Ziel fehlt im Modell', unavailable: 'Nicht verfügbar', coincident: 'Winkel braucht drei verschiedene Punkte',
    chooseTarget: 'Wähle ein gültiges Ziel aus.', chooseBinding: 'Wähle ein Gelenk oder Seil ausdrücklich aus, um die aktuelle Verbindung zu bestätigen.',
    staleEdit: 'Modell oder Messung wurde geändert. Änderungen nicht gespeichert. Abbrechen und erneut bearbeiten.',
    replay: 'Live-Messungen sind während der Positionswiedergabe ausgeblendet.', empty: 'Füge eine Messung hinzu oder wähle die empfohlenen Messungen.',
    help: 'Teile wählen ihre starre Baugruppe für Masse und Bewegung. Geschwindigkeit gilt am Schwerpunkt. Abstand und Winkel messen Teilursprünge (A–B–C: Scheitel B).',
    vectors: 'Pfeile: Geschwindigkeit × 0,1 s; Kräfte 20 mm/N.',
    kinds: {modelMass: 'Modellmasse', mass: 'Masse der Baugruppe', weight: 'Berechnete Gewichtskraft', speed: 'Geschwindigkeit der Baugruppe', angularSpeed: 'Drehgeschwindigkeit der Baugruppe',
        distance: 'Abstand A–B', angle: 'Winkel A–B–C', jointAngle: 'Gelenkwinkel', jointSpeed: 'Gelenkdrehzahl', travel: 'Schieberweg', tension: 'Seilspannung', normalLoad: 'Rad-Normallast'},
    sources: {'configured-model-mass': 'Konfigurierte Modell-Baugruppen ohne Umgebung', 'configured-mass': 'Konfigurierte Masse', 'configured-weight': 'Konfigurierte Masse × Schwerkraft', 'jolt-com-velocity': 'Jolt: Schwerpunktgeschwindigkeit',
        'jolt-angular-velocity': 'Jolt: Winkelgeschwindigkeit', 'part-origins': 'Teilursprünge', 'jolt-joint': 'Jolt: Gelenkkoordinate',
        'rope-constraint': 'Seil-Zwangsimpuls / Zeitschritt', 'rolling-load-estimate': 'Normallast-Schätzung des Rollmodells'}
} : {
    title: 'Measurements', close: 'Close', add: 'Add measurement', edit: 'Edit', save: 'Save changes', cancel: 'Cancel', remove: 'Remove', presets: 'Reset to recommended measurements',
    show: 'Show in model', label: 'Name', kind: 'Quantity', target: 'Part', joint: 'Joint', rope: 'Rope', world: 'Ground',
    missing: 'Target missing from model', unavailable: 'Unavailable', coincident: 'Angle needs three distinct points',
    chooseTarget: 'Choose a valid target.', chooseBinding: 'Choose a joint or rope explicitly to confirm its current binding.',
    staleEdit: 'The model or measurement changed. Changes were not saved. Cancel and edit again.',
    replay: 'Live measurements are hidden during pose replay.', empty: 'Add a measurement or choose the recommended measurements.',
    help: 'Parts select their rigid assembly for mass and motion. Speed is at its centre of mass. Distance and angle use part origins (A–B–C: vertex B).',
    vectors: 'Arrows: velocity × 0.1 s; forces 20 mm/N.',
    kinds: {modelMass: 'Model mass', mass: 'Assembly mass', weight: 'Calculated weight', speed: 'Assembly speed', angularSpeed: 'Assembly angular speed',
        distance: 'Distance A–B', angle: 'Angle A–B–C', jointAngle: 'Joint angle', jointSpeed: 'Joint angular speed', travel: 'Slider travel', tension: 'Rope tension', normalLoad: 'Wheel normal load'},
    sources: {'configured-model-mass': 'Configured model assemblies, excluding scenery', 'configured-mass': 'Configured mass', 'configured-weight': 'Configured mass × gravity', 'jolt-com-velocity': 'Jolt centre-of-mass velocity',
        'jolt-angular-velocity': 'Jolt angular velocity', 'part-origins': 'Part origins', 'jolt-joint': 'Jolt joint coordinate',
        'rope-constraint': 'Rope constraint impulse / step', 'rolling-load-estimate': 'Rolling-model normal load estimate'}
};

/** A compact editor; selectors use authored part IDs, never JavaScript expressions. */
class SimLabMeasurements extends React.Component {
    constructor (props) {
        super(props);
        this.state = {kind: 'distance', label: '', targets: ['', '', ''], joint: '', rope: '', plots: [], editor: null, editorStatus: ''};
        this.history = createMeasurementHistory();
        this.form = React.createRef();
        this.nameInput = React.createRef();
        this.returnFocus = null;
    }
    componentDidUpdate (previous) {
        const editor = this.state.editor;
        if (!editor) return;
        const propsChanged = previous.definitions !== this.props.definitions || previous.session !== this.props.session || previous.mechanism !== this.props.mechanism;
        if (!propsChanged && editor.model === this.currentModel()) return;
        if (editor.session !== this.props.session || editor.mechanism !== this.props.mechanism || editor.model !== this.currentModel() || !this.currentDefinitionMatches(editor)) {
            if (this.state.editorStatus !== 'staleEdit') this.setState({editorStatus: 'staleEdit'});
        }
    }
    currentDefinitionMatches (editor) {
        const current = this.props.definitions.find(d => d.id === editor.id);
        return Boolean(current && JSON.stringify([current.id, current.kind, current.label, current.targets, current.joint, current.rope, current.binding]) === editor.snapshot);
    }
    currentModel () {
        return this.props.session?.runModel || this.props.session?.model || this.props.mechanism;
    }
    beginEdit (definition, event) {
        const T = measurementWords(this.props.locale);
        const spec = MEASUREMENT_KINDS[definition.kind];
        const joint = spec.joint && this.props.mechanism.joints.find(j => j.id === definition.joint && j.type === spec.joint);
        const rope = spec.rope && (this.props.mechanism.couplings || []).find(r => r.id === definition.rope && r.kind === 'rope');
        const jointDigest = joint && jointBinding(this.props.mechanism, joint);
        const ropeDigest = rope && ropeBinding(rope);
        const jointValid = Boolean(joint && definition.binding === jointDigest);
        const ropeValid = Boolean(rope && definition.binding === ropeDigest);
        const displayLabel = definition.label === definition.kind ? T.kinds[definition.kind] : definition.label;
        this.returnFocus = event?.currentTarget || null;
        this.setState({editor: {id: definition.id,
            snapshot: JSON.stringify([definition.id, definition.kind, definition.label, definition.targets, definition.joint, definition.rope, definition.binding]),
            session: this.props.session, mechanism: this.props.mechanism, model: this.currentModel(), originalLabel: definition.label, initialDisplayLabel: displayLabel,
            kind: definition.kind, label: displayLabel, targets: [...(definition.targets || [])],
            joint: jointValid ? joint.id : '', rope: ropeValid ? rope.id : '', selectedBinding: jointValid ? jointDigest : ropeValid ? ropeDigest : '',
            status: !jointValid && spec.joint || !ropeValid && spec.rope ? 'chooseBinding' : ''}, editorStatus: ''}, () => {
            this.form.current?.scrollIntoView?.({block: 'nearest'});
            this.nameInput.current?.focus?.();
        });
    }
    cancelEdit (afterCancel) {
        const wasEditing = Boolean(this.state.editor);
        this.setState({editor: null, editorStatus: ''}, () => {
            if (wasEditing) this.returnFocus?.focus?.();
            afterCancel?.();
        });
    }
    changeKind (kind) {
        const oldSpec = MEASUREMENT_KINDS[this.state.editor?.kind || this.state.kind], nextSpec = MEASUREMENT_KINDS[kind];
        const currentTargets = this.state.editor?.targets || this.state.targets;
        const targets = Array.from({length: nextSpec.targets || 0}, (_, i) => currentTargets[i] || '');
        const joint = oldSpec.joint === nextSpec.joint ? (this.state.editor?.joint || this.state.joint) : '';
        const rope = oldSpec.rope === nextSpec.rope ? (this.state.editor?.rope || this.state.rope) : '';
        if (this.state.editor) {
            const editor = {...this.state.editor, kind, targets, joint, rope,
                selectedBinding: joint === this.state.editor.joint ? this.state.editor.selectedBinding : rope === this.state.editor.rope ? this.state.editor.selectedBinding : '',
                status: nextSpec.joint && !joint || nextSpec.rope && !rope ? 'chooseBinding' : ''};
            this.setState({editor, editorStatus: ''});
        } else this.setState({kind, targets, joint, rope});
    }
    changeTarget (index, value) {
        if (this.state.editor) {
            const targets = this.state.editor.targets.slice(); targets[index] = value;
            this.setState({editor: {...this.state.editor, targets}, editorStatus: ''});
        } else {
            const targets = this.state.targets.slice(); targets[index] = value;
            this.setState({targets});
        }
    }
    changeBinding (kind, id) {
        const editor = this.state.editor;
        const mechanism = this.props.mechanism;
        const selected = kind === 'joint' ? mechanism.joints.find(j => j.id === id && j.type === MEASUREMENT_KINDS[editor?.kind || this.state.kind].joint) : (mechanism.couplings || []).find(r => r.id === id && r.kind === 'rope');
        const binding = selected ? kind === 'joint' ? jointBinding(mechanism, selected) : ropeBinding(selected) : '';
        if (editor) this.setState({editor: {...editor, [kind]: id, selectedBinding: binding, status: binding ? '' : 'chooseBinding'}, editorStatus: ''});
        else this.setState({[kind]: id});
    }
    submitMeasurement (event) {
        event.preventDefault();
        const editor = this.state.editor;
        const T = measurementWords(this.props.locale);
        const kind = editor ? editor.kind : this.state.kind;
        const spec = MEASUREMENT_KINDS[kind];
        const mechanism = this.props.mechanism;
        const targets = editor ? editor.targets.slice(0, spec.targets || 0) : this.state.targets.slice(0, spec.targets || 0).map((id, i) => id || this.props.parts[Math.min(i, this.props.parts.length - 1)]?.id || '');
        if (editor && (editor.session !== this.props.session || editor.mechanism !== mechanism || editor.model !== this.currentModel() || !this.currentDefinitionMatches(editor))) {
            this.setState({editorStatus: 'staleEdit'}); return;
        }
        let joint = null, rope = null, binding = '';
        if (spec.joint) {
            joint = mechanism.joints.find(j => j.id === (editor ? editor.joint : this.state.joint) && j.type === spec.joint) || (!editor && mechanism.joints.find(j => j.type === spec.joint));
            if (joint) binding = jointBinding(mechanism, joint);
        } else if (spec.rope) {
            rope = (mechanism.couplings || []).find(r => r.id === (editor ? editor.rope : this.state.rope) && r.kind === 'rope') || (!editor && (mechanism.couplings || []).find(r => r.kind === 'rope'));
            if (rope) binding = ropeBinding(rope);
        }
        const validTargets = !spec.targets || targets.length === spec.targets && targets.every(id => this.props.parts.some(part => part.id === id));
        const selectedBinding = !spec.joint && !spec.rope || Boolean(binding && (!editor || editor.selectedBinding === binding));
        if (editor && binding && !selectedBinding) {
            this.setState({editor: {...editor, ...(spec.joint ? {joint: ''} : {rope: ''}), selectedBinding: '', status: 'chooseBinding'}, editorStatus: 'chooseBinding'});
            return;
        }
        if (!validTargets || spec.joint && !joint || spec.rope && !rope || !selectedBinding || (!editor && this.props.definitions.length >= MEASUREMENT_LIMIT)) {
            if (editor) this.setState({editorStatus: !validTargets ? 'chooseTarget' : 'chooseBinding'});
            return;
        }
        const labelInput = editor ? editor.label : this.state.label;
        const label = editor
            ? (labelInput === editor.initialDisplayLabel && kind === this.props.definitions.find(d => d.id === editor.id)?.kind ? editor.originalLabel : labelInput.trim() || kind)
            : labelInput.trim() || T.kinds[kind];
        const updated = {id: editor?.id || '', kind, label,
            ...(spec.targets ? {targets} : {}), ...(spec.joint ? {joint: joint.id, binding} : {}), ...(spec.rope ? {rope: rope.id, binding} : {})};
        if (editor) {
            const current = this.props.definitions.find(d => d.id === editor.id);
            this.props.onChange(this.props.definitions.map(d => d.id === editor.id ? {...updated, visible: current.visible !== false} : d));
            this.setState({editor: null, editorStatus: ''}, () => this.returnFocus?.focus?.());
        } else {
            let n = 1; while (this.props.definitions.some(d => d.id === `custom-${n}`)) n++;
            this.props.onChange([...this.props.definitions, {...updated, id: `custom-${n}`, visible: true}]);
            this.setState({label: ''});
        }
    }
    render () {
        const {locale, definitions, rows, parts, mechanism, shown, replaying, onChange, onShown, onPresets, onClose} = this.props;
        const T = measurementWords(locale), editor = this.state.editor, kind = editor ? editor.kind : this.state.kind, spec = MEASUREMENT_KINDS[kind];
        const de = locale === 'de';
        const selected = this.state.plots.filter(id => definitions.some(d => d.id === id && d.visible !== false)).slice(0, PLOT_LIMIT);
        const histories = this.history.update({session: this.props.session || mechanism, definitions, selected, rows,
            time: this.props.sampleTime, replaying, paused: this.props.paused});
        const joints = mechanism.joints.filter(j => j.type === spec.joint);
        const ropes = (mechanism.couplings || []).filter(c => c.kind === 'rope');
        const rawTargets = editor ? editor.targets : this.state.targets;
        const targets = Array.from({length: spec.targets || 0}, (_, i) => editor ? (rawTargets[i] || '') : (rawTargets[i] || parts[Math.min(i, parts.length - 1)]?.id || ''));
        const joint = joints.find(j => j.id === (editor ? editor.joint : this.state.joint)) || (!editor && joints[0]);
        const rope = ropes.find(r => r.id === (editor ? editor.rope : this.state.rope)) || (!editor && ropes[0]);
        const valid = (!spec.targets || targets.every(id => id && parts.some(part => part.id === id))) && (!spec.joint || joint) && (!spec.rope || rope);
        const editorStatus = this.state.editorStatus || editor?.status;
        const input = {maxWidth: '100%', minWidth: 0, boxSizing: 'border-box'};
        return (
            <section data-testid="bw-sim-lab-measurements-panel" aria-label={T.title}
                style={{position: 'absolute', top: 8, left: 8, zIndex: 7, width: 340, maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)',
                    overflow: 'auto', background: 'rgba(255,255,255,0.97)', border: '1px solid #94a3b8', borderRadius: 8, padding: 10, boxSizing: 'border-box', fontSize: 12, color: '#164e63'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><strong>{T.title}</strong>
                    <button type="button" onClick={onClose} aria-label={T.close}>×</button></div>
                <label><input type="checkbox" checked={shown} onChange={e => onShown(e.target.checked)} data-testid="bw-sim-lab-measurements-shown" />{T.show}</label>
                <p>{T.help}</p><p>{T.vectors}</p>
                {replaying && <p role="status">{T.replay}</p>}
                {!definitions.length && <p>{T.empty}</p>}
                <ul style={{listStyle: 'none', padding: 0}}>
                    {definitions.map(d => {
                        const row = rows.find(r => r.id === d.id);
                        const name = d.label === d.kind ? T.kinds[d.kind] : d.label;
                        const reason = row?.reason === 'missing-target' ? T.missing : row?.reason === 'coincident-points' ? T.coincident : T.unavailable;
                        const selectedJoint = d.joint && mechanism.joints.find(j => j.id === d.joint);
                        const target = d.targets ? d.targets.join(' → ') : selectedJoint ? `${d.joint} · ${jointTargetContext(selectedJoint, mechanism, T.world)}` : d.joint || d.rope;
                        return <li key={d.id} data-testid={`bw-sim-lab-measurement-${d.id}`} style={{borderTop: '1px solid #e2e8f0', padding: '5px 0'}}>
                            <label><input type="checkbox" checked={d.visible !== false} aria-label={`${T.show}: ${name}`}
                                onChange={e => onChange(definitions.map(m => m.id === d.id ? {...m, visible: e.target.checked} : m))} />{name}</label>
                            <output style={{marginLeft: 8}}>{replaying ? '—' : row ? measurementText(row) : '—'}</output>
                            <button type="button" aria-label={`${T.edit}: ${name}`} data-testid={`bw-sim-lab-measurement-edit-${d.id}`}
                                onClick={e => this.beginEdit(d, e)}>{T.edit}</button>
                            <button type="button" style={{float: 'right'}} aria-label={`${T.remove}: ${name}`}
                                onClick={() => {
                                    if (editor?.id === d.id) this.cancelEdit();
                                    onChange(definitions.filter(m => m.id !== d.id));
                                }}>×</button>
                            <small title={(d.targets || [d.joint || d.rope]).join(" → ")} style={{display: 'block'}}>{T.kinds[d.kind]} · {replaying ? T.replay : row?.available ? T.sources[row.source] : reason}</small>
                            {target && <small style={{display: 'block'}}>{target}</small>}
                            <label style={{display: 'block'}}><input type="checkbox" data-testid={`bw-sim-measurement-plot-toggle-${d.id}`}
                                checked={selected.includes(d.id)} disabled={d.visible === false || (!selected.includes(d.id) && selected.length >= PLOT_LIMIT)}
                                onChange={e => {
                                    const plots = e.target.checked ? [...selected, d.id] : selected.filter(id => id !== d.id);
                                    this.setState({plots}, () => this.props.onSample?.());
                                }} />{de ? 'Zeitdiagramm' : 'Time plot'}</label>
                            {!replaying && selected.includes(d.id) && <SimLabMeasurementPlot points={histories.get(d.id) || []}
                                name={name} unit={MEASUREMENT_KINDS[d.kind].unit} locale={locale} />}
                        </li>;
                    })}
                </ul>
                <form ref={this.form} data-testid="bw-sim-lab-measurement-editor" onSubmit={e => this.submitMeasurement(e)} style={{display: 'grid', gap: 6}}>
                    <label>{T.kind} <select data-testid="bw-sim-lab-measurement-kind" style={input} value={kind} onChange={e => this.changeKind(e.target.value)}>
                        {Object.keys(MEASUREMENT_KINDS).map(k => <option key={k} value={k}>{T.kinds[k]}</option>)}
                    </select></label>
                    {targets.map((id, i) => <label key={i}>{T.target} {'ABC'[i]} <select style={input} data-testid={`bw-sim-lab-measurement-target-${i}`}
                        value={id} onChange={e => this.changeTarget(i, e.target.value)}>
                        {editor && !id && <option value="">{T.chooseTarget}</option>}
                        {editor && id && !parts.some(part => part.id === id) && <option value={id}>{T.missing}: {id}</option>}
                        {parts.map(p => <option key={p.id} value={p.id}>{p.id} · {p.label}</option>)}
                    </select></label>)}
                    {spec.joint && <label>{T.joint} <select data-testid="bw-sim-lab-measurement-joint" style={input} value={editor ? editor.joint : joint?.id || ''} onChange={e => this.changeBinding('joint', e.target.value)}>
                        {editor && !editor.joint && <option value="">{T.chooseBinding}</option>}
                        {joints.map(j => <option key={j.id} value={j.id}>{j.motor?.port || j.id} · {jointTargetContext(j, mechanism, T.world)}</option>)}
                    </select></label>}
                    {spec.rope && <label>{T.rope} <select data-testid="bw-sim-lab-measurement-rope" style={input} value={editor ? editor.rope : rope?.id || ''} onChange={e => this.changeBinding('rope', e.target.value)}>
                        {editor && !editor.rope && <option value="">{T.chooseBinding}</option>}
                        {ropes.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
                    </select></label>}
                    <label>{T.label} <input ref={this.nameInput} style={input} maxLength={80} value={editor ? editor.label : this.state.label}
                        onChange={e => editor ? this.setState({editor: {...editor, label: e.target.value}, editorStatus: ''}) : this.setState({label: e.target.value})} /></label>
                    {editorStatus && <p role="status" data-testid="bw-sim-lab-measurement-editor-status">{T[editorStatus]}</p>}
                    {editor ? <div style={{display: 'flex', gap: 6}}>
                        <button type="submit" data-testid="bw-sim-lab-measurement-save">{T.save}</button>
                        <button type="button" data-testid="bw-sim-lab-measurement-cancel" onClick={() => this.cancelEdit()}>{T.cancel}</button>
                    </div> : <button type="submit" disabled={!valid || definitions.length >= MEASUREMENT_LIMIT} data-testid="bw-sim-lab-measurement-add">{T.add}</button>}
                </form>
                <p style={{fontSize: 10}}>{de ? 'Bis zu 4 Diagramme mit je 128 echten Simulationszeitwerten. Lücken bedeuten: nicht verfügbar.' : 'Up to 4 plots, each with 128 actual simulation-time samples. Gaps mean unavailable.'}</p>
                {this.props.teachingPreset && <button type="button" data-testid="bw-sim-measurement-teaching-preset"
                            onClick={() => this.cancelEdit(() => onChange(this.props.teachingPreset.definitions))} style={{marginTop: 6}}>
                    {de ? 'Lektionsmessungen anwenden' : 'Apply lesson measurements'}: {this.props.teachingPreset.title}</button>}
                <button type="button" onClick={() => this.cancelEdit(onPresets)} style={{marginTop: 6}}>{T.presets}</button>
            </section>
        );
    }
}
SimLabMeasurements.propTypes = {
    locale: PropTypes.string.isRequired, definitions: PropTypes.array.isRequired, rows: PropTypes.array.isRequired,
    parts: PropTypes.array.isRequired, mechanism: PropTypes.object.isRequired, shown: PropTypes.bool.isRequired, replaying: PropTypes.bool.isRequired,
    session: PropTypes.object, sampleTime: PropTypes.number, paused: PropTypes.bool, teachingPreset: PropTypes.object, onSample: PropTypes.func,
    onChange: PropTypes.func.isRequired, onShown: PropTypes.func.isRequired, onPresets: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired
};
export default SimLabMeasurements;
