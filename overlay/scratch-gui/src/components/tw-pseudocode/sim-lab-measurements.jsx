// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import SimLabMeasurementPlot from './sim-lab-measurement-plot.jsx';
import SimLabMeasurementRecorder from './sim-lab-measurement-recorder.jsx';
import SimLabControlPair from './sim-lab-control-pair.jsx';
import SimLabMeasurementPrecision from './sim-lab-measurement-precision.jsx';
import SimLabPhysicsInspector from './sim-lab-physics-inspector.jsx';
import {createMeasurementHistory, PLOT_LIMIT} from '../../lib/bw-sim/measurements/history.js';
import {MEASUREMENT_KINDS, MEASUREMENT_LIMIT} from '../../lib/bw-sim/measurements/schema.js';
import {measurementText, jointBinding, ropeBinding} from '../../lib/bw-sim/measurements/readings.js';
import {roleMeasurementPacks} from '../../lib/bw-sim/measurements/role-presets.js';
import {jointTargetContext} from '../../lib/bw-sim/measurements/target-context.js';

const rolePackCache = new WeakMap();
const packsFor = (session, locale) => {
    if (!session) return [];
    let cached = rolePackCache.get(session);
    if (!cached || cached.locale !== locale) {
        cached = {locale, packs: roleMeasurementPacks(session, locale)};
        rolePackCache.set(session, cached);
    }
    return cached.packs;
};

export const measurementWords = locale => locale === 'de' ? {
    title: 'Messungen', close: 'Schließen', add: 'Messung hinzufügen', edit: 'Bearbeiten', save: 'Änderungen speichern', cancel: 'Abbrechen', remove: 'Entfernen', presets: 'Auf empfohlene Messungen zurücksetzen',
    pick: 'Im Modell wählen', picking: 'Teil im Modell anklicken. Esc bricht ab.', preview: 'Vorschau', highlight: 'Ziele hervorheben', limits: 'Grenzen der Simulation',
    show: 'Im Modell anzeigen', label: 'Name', kind: 'Messgröße', target: 'Teil', joint: 'Gelenk', rope: 'Seil', world: 'Boden',
    missing: 'Ziel fehlt im Modell', unavailable: 'Nicht verfügbar', coincident: 'Winkel braucht drei verschiedene Punkte',
    chooseTarget: 'Wähle ein gültiges Ziel aus.', chooseBinding: 'Wähle ein Gelenk oder Seil ausdrücklich aus, um die aktuelle Verbindung zu bestätigen.',
    staleEdit: 'Modell oder Messung wurde geändert. Änderungen nicht gespeichert. Abbrechen und erneut bearbeiten.',
    replay: 'Live-Messungen sind während der Positionswiedergabe ausgeblendet.', empty: 'Füge eine Messung hinzu oder wähle die empfohlenen Messungen.',
    help: 'Teile wählen ihre starre Baugruppe für Masse und Bewegung. Geschwindigkeit gilt am Schwerpunkt. Abstand und Winkel messen Teilursprünge (A–B–C: Scheitel B).',
    vectors: 'Pfeile: Geschwindigkeit × 0,1 s; Kräfte 20 mm/N.',
    kinds: {passiveTorque: 'Passives Reibmoment', motorForce: 'Schieber-Motorkraft', limitForce: 'Schieber-Anschlagkraft', sliderPower: 'Schieber-Motorleistung', screwSlips: 'Spindel-Schlupfereignisse', screwLoad: 'Gefilterte Spindel-Stützlast', contact: 'Kontakt vorhanden (0/1)', modelMass: 'Modellmasse', mass: 'Masse der Baugruppe', weight: 'Berechnete Gewichtskraft', speed: 'Geschwindigkeit der Baugruppe', angularSpeed: 'Drehgeschwindigkeit der Baugruppe', acceleration: 'Abgetastete Beschleunigung', pressure: 'Pneumatik-Überdruck',
        distance: 'Abstand A–B', angle: 'Winkel A–B–C', jointAngle: 'Gelenkwinkel', jointSpeed: 'Gelenkdrehzahl', motorTorque: 'Motor-Drehmoment', limitTorque: 'Gelenkanschlag-Drehmoment', motorPower: 'Mechanische Motorleistung', travel: 'Schieberweg', tension: 'Seilspannung', normalLoad: 'Rad-Normallast'},
    sources: {'jolt-passive-friction-impulse': 'Passiver Reibimpuls / Zeitschritt', 'jolt-slider-motor-impulse': 'Schieber-Motorimpuls / Zeitschritt', 'jolt-slider-limit-impulse': 'Schieber-Anschlagimpuls / Zeitschritt', 'jolt-slider-motor-power': 'Motorkraft × zugehörige Schiebergeschwindigkeit', 'screw-slip-count': 'Kumulierte Spindel-Schlupfereignisse', 'screw-filtered-support-load': 'Gefilterter Betrag der vorherigen Stützlast', 'jolt-contact-presence': 'Aktueller nativer Körperkontakt; kein Kraftbetrag', 'configured-model-mass': 'Konfigurierte Modell-Baugruppen ohne Umgebung', 'configured-mass': 'Konfigurierte Masse', 'configured-weight': 'Konfigurierte Masse × Schwerkraft', 'jolt-com-velocity': 'Jolt: Schwerpunktgeschwindigkeit',
        'sampled-jolt-com-acceleration': 'Schwerpunkt-Geschwindigkeitsdifferenz / Simulationszeit', 'jolt-air-network-gauge-pressure': 'Pneumatikmodell: verbundener Netzwerk-Überdruck',
        'jolt-motor-impulse': 'Jolt: Motorimpuls / Zeitschritt', 'jolt-limit-impulse': 'Jolt: Anschlagimpuls / Zeitschritt', 'jolt-motor-power': 'Jolt: Motor-Drehmoment × zugehörige Drehzahl',
        'jolt-angular-velocity': 'Jolt: Winkelgeschwindigkeit', 'part-origins': 'Teilursprünge', 'jolt-joint': 'Jolt: Gelenkkoordinate',
        'rope-constraint': 'Seil-Zwangsimpuls / Zeitschritt', 'rolling-load-estimate': 'Normallast-Schätzung des Rollmodells'}
} : {
    title: 'Measurements', close: 'Close', add: 'Add measurement', edit: 'Edit', save: 'Save changes', cancel: 'Cancel', remove: 'Remove', presets: 'Reset to recommended measurements',
    pick: 'Pick in model', picking: 'Click a part in the model. Esc cancels.', preview: 'Preview', highlight: 'Highlight targets', limits: 'Simulation limits',
    show: 'Show in model', label: 'Name', kind: 'Quantity', target: 'Part', joint: 'Joint', rope: 'Rope', world: 'Ground',
    missing: 'Target missing from model', unavailable: 'Unavailable', coincident: 'Angle needs three distinct points',
    chooseTarget: 'Choose a valid target.', chooseBinding: 'Choose a joint or rope explicitly to confirm its current binding.',
    staleEdit: 'The model or measurement changed. Changes were not saved. Cancel and edit again.',
    replay: 'Live measurements are hidden during pose replay.', empty: 'Add a measurement or choose the recommended measurements.',
    help: 'Parts select their rigid assembly for mass and motion. Speed is at its centre of mass. Distance and angle use part origins (A–B–C: vertex B).',
    vectors: 'Arrows: velocity × 0.1 s; forces 20 mm/N.',
    kinds: {passiveTorque: 'Passive friction torque', motorForce: 'Slider motor force', limitForce: 'Slider limit force', sliderPower: 'Slider motor power', screwSlips: 'Screw slip events', screwLoad: 'Filtered screw supporting load', contact: 'Contact presence (0/1)', modelMass: 'Model mass', mass: 'Assembly mass', weight: 'Calculated weight', speed: 'Assembly speed', angularSpeed: 'Assembly angular speed', acceleration: 'Sampled acceleration', pressure: 'Pneumatic gauge pressure',
        distance: 'Distance A–B', angle: 'Angle A–B–C', jointAngle: 'Joint angle', jointSpeed: 'Joint angular speed', motorTorque: 'Motor torque', limitTorque: 'Joint limit torque', motorPower: 'Mechanical motor power', travel: 'Slider travel', tension: 'Rope tension', normalLoad: 'Wheel normal load'},
    sources: {'jolt-passive-friction-impulse': 'Passive friction impulse / fixed step', 'jolt-slider-motor-impulse': 'Slider motor impulse / fixed step', 'jolt-slider-limit-impulse': 'Slider limit impulse / fixed step', 'jolt-slider-motor-power': 'Motor force × matching slider velocity', 'screw-slip-count': 'Cumulative screw slip events', 'screw-filtered-support-load': 'Filtered previous-step absolute supporting load', 'jolt-contact-presence': 'Current native body contact; no force magnitude', 'configured-model-mass': 'Configured model assemblies, excluding scenery', 'configured-mass': 'Configured mass', 'configured-weight': 'Configured mass × gravity', 'jolt-com-velocity': 'Jolt centre-of-mass velocity',
        'sampled-jolt-com-acceleration': 'COM velocity difference / simulated time', 'jolt-air-network-gauge-pressure': 'Pneumatic model: connected network gauge pressure',
        'jolt-motor-impulse': 'Jolt motor impulse / fixed step', 'jolt-limit-impulse': 'Jolt local limit impulse / fixed step', 'jolt-motor-power': 'Jolt motor torque × matching relative speed',
        'jolt-angular-velocity': 'Jolt angular velocity', 'part-origins': 'Part origins', 'jolt-joint': 'Jolt joint coordinate',
        'rope-constraint': 'Rope constraint impulse / step', 'rolling-load-estimate': 'Rolling-model normal load estimate'}
};

/** A compact editor; selectors use authored part IDs, never JavaScript expressions. */
class SimLabMeasurements extends React.Component {
    constructor (props) {
        super(props);
        this.state = {rolePackId: '', kind: 'distance', label: '', targets: ['', '', ''], joint: '', rope: '', plots: (props.initialPlots || []).slice(0, PLOT_LIMIT), editor: null, editorStatus: '', picking: null};
        this.history = createMeasurementHistory();
        this.form = React.createRef();
        this.nameInput = React.createRef();
        this.returnFocus = null;
    }
    componentDidMount () { this.syncPreview(); }
    componentWillUnmount () {
        this.pickRequest = null;
        this.props.onPickTarget?.(null);
        this.props.onPreview?.(null);
    }
    componentDidUpdate (previous) {
        if (previous.session !== this.props.session && this.state.rolePackId) this.setState({rolePackId: ''});
        if (previous.session !== this.props.session || previous.mechanism !== this.props.mechanism) this.previewActive = false;
        if (previous.session !== this.props.session || previous.mechanism !== this.props.mechanism ||
            this.props.replaying || previous.definitions !== this.props.definitions) this.cancelPicking();
        this.syncPreview();
        const editor = this.state.editor;
        if (!editor) return;
        const propsChanged = previous.definitions !== this.props.definitions || previous.session !== this.props.session || previous.mechanism !== this.props.mechanism;
        const modelChanged = editor.model !== this.currentModel();
        let nextEditor = editor;
        if (previous.locale !== this.props.locale && editor.automaticLabel) {
            nextEditor = {...editor, label: measurementWords(this.props.locale).kinds[editor.kind]};
        }
        const stale = (propsChanged || modelChanged) &&
            (editor.session !== this.props.session || editor.mechanism !== this.props.mechanism || modelChanged || !this.currentDefinitionMatches(editor));
        const update = {};
        if (nextEditor !== editor) update.editor = nextEditor;
        if (stale && this.state.editorStatus !== 'staleEdit') update.editorStatus = 'staleEdit';
        if (Object.keys(update).length) this.setState(update);
    }
    cancelPicking () {
        if (!this.pickRequest) return;
        this.pickRequest = null;
        this.props.onPickTarget?.(null);
        if (this.state.picking !== null) this.setState({picking: null});
    }
    requestTarget (index) {
        this.cancelPicking();
        if (!this.props.onPickTarget || this.props.replaying) return;
        const request = {index, session: this.props.session, model: this.currentModel(), mechanism: this.props.mechanism,
            definitions: this.props.definitions, editor: this.state.editor, kind: this.state.editor?.kind || this.state.kind};
        this.pickRequest = request;
        this.setState({picking: index});
        this.props.onPickTarget(id => {
            if (this.pickRequest !== request) return;
            this.pickRequest = null;
            this.setState({picking: null});
            if (!id || request.session !== this.props.session || request.model !== this.currentModel() ||
                request.mechanism !== this.props.mechanism || request.definitions !== this.props.definitions ||
                request.editor !== this.state.editor || request.kind !== (this.state.editor?.kind || this.state.kind) ||
                this.props.replaying || !this.props.parts.some(p => p.id === id) ||
                request.editor && !this.currentDefinitionMatches(request.editor)) return;
            this.changeTarget(index, id);
        });
    }
    previewDefinition () {
        if ((!this.previewActive && !this.state.editor) || this.props.replaying) return null;
        const editor = this.state.editor, kind = editor?.kind || this.state.kind, spec = MEASUREMENT_KINDS[kind];
        if (editor && (editor.model !== this.currentModel() || editor.session !== this.props.session ||
            editor.mechanism !== this.props.mechanism || !this.currentDefinitionMatches(editor))) return null;
        const raw = editor?.targets || this.state.targets;
        const targets = Array.from({length: spec.targets || 0}, (_, i) => raw[i] || (!editor && this.props.parts[Math.min(i, this.props.parts.length - 1)]?.id) || '');
        if (targets.some(id => !this.props.parts.some(p => p.id === id))) return null;
        const joint = spec.joint && this.props.mechanism.joints.find(j => j.type === spec.joint && j.id === (editor?.joint || this.state.joint));
        const rope = spec.rope && (this.props.mechanism.couplings || []).find(r => r.kind === 'rope' && r.id === (editor?.rope || this.state.rope));
        if (spec.joint && !joint || spec.rope && !rope) return null;
        const binding = joint ? jointBinding(this.props.mechanism, joint) : rope ? ropeBinding(rope) : '';
        if (editor && binding && editor.selectedBinding !== binding) return null;
        return {id: 'measurement-preview', kind, label: measurementWords(this.props.locale).preview, visible: true,
            ...(spec.targets ? {targets} : {}), ...(joint ? {joint: joint.id, binding} : {}), ...(rope ? {rope: rope.id, binding} : {})};
    }
    syncPreview () {
        const definition = this.previewDefinition(), key = JSON.stringify(definition);
        if (this.previewKey !== key || this.previewSession !== this.props.session) {
            this.previewKey = key; this.previewSession = this.props.session;
            this.props.onPreview?.(definition);
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
        this.cancelPicking();
        this.previewActive = true;
        const T = measurementWords(this.props.locale);
        const spec = MEASUREMENT_KINDS[definition.kind];
        const joint = spec.joint && this.props.mechanism.joints.find(j => j.id === definition.joint && j.type === spec.joint);
        const rope = spec.rope && (this.props.mechanism.couplings || []).find(r => r.id === definition.rope && r.kind === 'rope');
        const jointDigest = joint && jointBinding(this.props.mechanism, joint);
        const ropeDigest = rope && ropeBinding(rope);
        const jointValid = Boolean(joint && definition.binding === jointDigest);
        const ropeValid = Boolean(rope && definition.binding === ropeDigest);
        const automaticLabel = definition.label === definition.kind;
        const displayLabel = automaticLabel ? T.kinds[definition.kind] : definition.label;
        this.returnFocus = event?.currentTarget || null;
        this.setState({editor: {id: definition.id,
            snapshot: JSON.stringify([definition.id, definition.kind, definition.label, definition.targets, definition.joint, definition.rope, definition.binding]),
            session: this.props.session, mechanism: this.props.mechanism, model: this.currentModel(), automaticLabel,
            kind: definition.kind, label: displayLabel, targets: [...(definition.targets || [])],
            joint: jointValid ? joint.id : '', rope: ropeValid ? rope.id : '', selectedBinding: jointValid ? jointDigest : ropeValid ? ropeDigest : '',
            status: !jointValid && spec.joint || !ropeValid && spec.rope ? 'chooseBinding' : ''}, editorStatus: ''}, () => {
            this.form.current?.scrollIntoView?.({block: 'nearest'});
            this.nameInput.current?.focus?.();
        });
    }
    cancelEdit (afterCancel) {
        this.cancelPicking();
        this.previewActive = false;
        this.props.onPreview?.(null);
        this.previewKey = undefined;
        if (!this.state.editor) {
            afterCancel?.();
            return;
        }
        this.setState({editor: null, editorStatus: ''}, () => {
            this.returnFocus?.focus?.();
            afterCancel?.();
        });
    }
    changeKind (kind) {
        this.cancelPicking(); this.previewActive = true;
        const oldSpec = MEASUREMENT_KINDS[this.state.editor?.kind || this.state.kind], nextSpec = MEASUREMENT_KINDS[kind];
        const currentTargets = this.state.editor?.targets || this.state.targets;
        const targets = Array.from({length: nextSpec.targets || 0}, (_, i) => currentTargets[i] || '');
        const joint = oldSpec.joint === nextSpec.joint ? (this.state.editor?.joint || this.state.joint) : '';
        const rope = oldSpec.rope === nextSpec.rope ? (this.state.editor?.rope || this.state.rope) : '';
        if (this.state.editor) {
            const editor = {...this.state.editor, kind, targets, joint, rope,
                label: this.state.editor.automaticLabel ? measurementWords(this.props.locale).kinds[kind] : this.state.editor.label,
                selectedBinding: joint === this.state.editor.joint ? this.state.editor.selectedBinding : rope === this.state.editor.rope ? this.state.editor.selectedBinding : '',
                status: nextSpec.joint && !joint || nextSpec.rope && !rope ? 'chooseBinding' : ''};
            this.setState({editor, editorStatus: ''});
        } else this.setState({kind, targets, joint, rope});
    }
    changeTarget (index, value) {
        this.cancelPicking(); this.previewActive = true;
        this.props.onHighlight?.([value]);
        if (this.state.editor) {
            const targets = this.state.editor.targets.slice(); targets[index] = value;
            this.setState({editor: {...this.state.editor, targets}, editorStatus: ''});
        } else {
            const targets = this.state.targets.slice(); targets[index] = value;
            this.setState({targets});
        }
    }
    changeLabel (value) {
        if (this.state.editor) this.setState({editor: {...this.state.editor, label: value, automaticLabel: false}, editorStatus: ''});
        else this.setState({label: value});
    }
    changeBinding (kind, id) {
        this.cancelPicking(); this.previewActive = true;
        const editor = this.state.editor;
        const mechanism = this.props.mechanism;
        const selected = kind === 'joint' ? mechanism.joints.find(j => j.id === id && j.type === MEASUREMENT_KINDS[editor?.kind || this.state.kind].joint) : (mechanism.couplings || []).find(r => r.id === id && r.kind === 'rope');
        const binding = selected ? kind === 'joint' ? jointBinding(mechanism, selected) : ropeBinding(selected) : '';
        if (editor) this.setState({editor: {...editor, [kind]: id, selectedBinding: binding, status: binding ? '' : 'chooseBinding'}, editorStatus: ''});
        else this.setState({[kind]: id});
    }
    submitMeasurement (event) {
        event.preventDefault();
        this.cancelPicking();
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
            ? (editor.automaticLabel ? kind : labelInput.trim() || kind)
            : labelInput.trim() || T.kinds[kind];
        const updated = {id: editor?.id || '', kind, label,
            ...(spec.targets ? {targets} : {}), ...(spec.joint ? {joint: joint.id, binding} : {}), ...(spec.rope ? {rope: rope.id, binding} : {})};
        this.previewActive = false;
        this.props.onPreview?.(null);
        this.previewKey = undefined;
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
        const preview = this.previewDefinition();
        const previewRow = preview && this.props.readPreview?.(preview);
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
                                    this.setState({plots}, () => { this.props.onPlotSelection?.(plots); this.props.onSample?.(); });
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
                    </select>
                        <button type="button" data-testid={`bw-sim-measurement-pick-${i}`} disabled={!this.props.onPickTarget || replaying}
                            onClick={() => this.requestTarget(i)}>{T.pick} {'ABC'[i]}</button>
                    </label>)}
                    {this.state.picking !== null && <p role="status" data-testid="bw-sim-measurement-picking">{T.picking}
                        <button type="button" onClick={() => this.cancelPicking()}>{T.cancel}</button></p>}
                    {spec.joint && <label>{T.joint} <select data-testid="bw-sim-lab-measurement-joint" style={input} value={editor ? editor.joint : joint?.id || ''} onChange={e => this.changeBinding('joint', e.target.value)}>
                        {editor && !editor.joint && <option value="">{T.chooseBinding}</option>}
                        {joints.map(j => <option key={j.id} value={j.id}>{j.motor?.port || j.id} · {jointTargetContext(j, mechanism, T.world)}</option>)}
                    </select></label>}
                    {spec.rope && <label>{T.rope} <select data-testid="bw-sim-lab-measurement-rope" style={input} value={editor ? editor.rope : rope?.id || ''} onChange={e => this.changeBinding('rope', e.target.value)}>
                        {editor && !editor.rope && <option value="">{T.chooseBinding}</option>}
                        {ropes.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
                    </select></label>}
                    <label>{T.label} <input ref={this.nameInput} style={input} maxLength={80} value={editor ? editor.label : this.state.label}
                        onChange={e => this.changeLabel(e.target.value)} /></label>
                    {preview && <div data-testid="bw-sim-measurement-preview"><output>{T.preview}: {previewRow ? measurementText(previewRow) : '—'}</output>
                        {preview.targets?.length > 0 && <button type="button" onClick={() => this.props.onHighlight?.(preview.targets)}>{T.highlight}</button>}</div>}
                    {editorStatus && <p role="status" data-testid="bw-sim-lab-measurement-editor-status">{T[editorStatus]}</p>}
                    {editor ? <div style={{display: 'flex', gap: 6}}>
                        <button type="submit" data-testid="bw-sim-lab-measurement-save">{T.save}</button>
                        <button type="button" data-testid="bw-sim-lab-measurement-cancel" onClick={() => this.cancelEdit()}>{T.cancel}</button>
                    </div> : <button type="submit" disabled={!valid || definitions.length >= MEASUREMENT_LIMIT} data-testid="bw-sim-lab-measurement-add">{T.add}</button>}
                </form>
                {this.props.session && <SimLabPhysicsInspector locale={locale} session={this.props.session} replaying={replaying} onHighlight={this.props.onHighlight} />}
                <SimLabMeasurementPrecision locale={locale} session={this.props.session} definitions={definitions}
                    options={this.props.precisionOptions} onOptions={this.props.onPrecisionOptions} enabled={this.props.precisionEnabled} replaying={replaying} onToggle={this.props.onPrecisionToggle} />
                <SimLabControlPair locale={locale} context={this.props.modelContext && {...this.props.modelContext, definitions}}
                    histories={this.props.histories || []} pair={this.props.controlPair} disabled={replaying || Boolean(this.props.recorder?.snapshot().active)}
                    onPair={this.props.onControlPair} onClear={this.props.onClearControlPair} />
                <SimLabMeasurementRecorder pairActive={Boolean(this.props.controlPair)} locale={locale} recorder={this.props.recorder} session={this.props.session} modelKey={this.props.modelKey || ''}
                    modelContext={this.props.modelContext} recorderRevision={this.props.recorderRevision} recordingAllowed={this.props.recordingAllowed} onHistoryChanged={this.props.onHistoryChanged} onRestoredSelection={ids => this.setState({plots: ids.slice(0, PLOT_LIMIT)}, () => this.props.onPlotSelection?.(ids))}
                    definitions={definitions} selected={selected} rows={rows} sampleTime={this.props.sampleTime}
                    replaying={replaying} paused={this.props.paused} />
                <p style={{fontSize: 10}}>{de ? 'Bis zu 4 Diagramme mit je 128 echten Simulationszeitwerten. Lücken bedeuten: nicht verfügbar.' : 'Up to 4 plots, each with 128 actual simulation-time samples. Gaps mean unavailable.'}</p>
                {packsFor(this.props.session, locale).length > 0 && <fieldset data-testid="bw-sim-role-packs" disabled={replaying}>
                    <legend>{de ? 'Messpakete für dieses Modell' : 'Measurement packs for this model'}</legend>
                    <select aria-label={de ? 'Messpaket' : 'Measurement pack'} data-testid="bw-sim-role-pack-choice" value={this.state.rolePackId} onChange={e => this.setState({rolePackId: e.target.value})}>
                        <option value="">{de ? 'Rolle ausdrücklich wählen' : 'Choose a role explicitly'}</option>
                        {packsFor(this.props.session, locale).map(pack => <option key={pack.id} value={pack.id}>{pack.title}</option>)}
                    </select>
                    <button type="button" data-testid="bw-sim-role-pack-apply" disabled={!packsFor(this.props.session, locale).some(pack => pack.id === this.state.rolePackId)} onClick={() => {
                        const pack = packsFor(this.props.session, locale).find(p => p.id === this.state.rolePackId);
                        if (pack) this.cancelEdit(() => onChange(pack.definitions));
                    }}>{de ? 'Aktuelle Messungen durch Paket ersetzen' : 'Replace current measurements with pack'}</button>
                    <p>{packsFor(this.props.session, locale).find(pack => pack.id === this.state.rolePackId)?.help}</p>
                    <p>{de ? 'Strukturelle Rollen mit Modellbindungen; keine Bestätigung eines mechanischen Gesetzes. Die angewendeten Messungen werden mit dem Projekt gespeichert.' : 'Structural roles bound to this model; no mechanical-law qualification. Applied definitions are saved with the project.'}</p>
                </fieldset>}
                {this.props.teachingPreset && <button type="button" data-testid="bw-sim-measurement-teaching-preset"
                            onClick={() => this.cancelEdit(() => onChange(this.props.teachingPreset.definitions))} style={{marginTop: 6}}>
                    {de ? 'Lektionsmessungen anwenden' : 'Apply lesson measurements'}: {this.props.teachingPreset.title}</button>}
                {this.props.teachingPreset?.help && <p data-testid="bw-sim-measurement-lesson-relation">{this.props.teachingPreset.help}</p>}
                <details><summary>{T.limits}</summary><p>{de ?
                    'Massen und Materialwerte sind Modellannahmen. Radlast ist geschätzt; allgemeine Kontaktkräfte werden nicht gemessen. Motor-Drehmoment und -Leistung stammen aus dem letzten Solver-Schritt; passive Reibung ist davon getrennt. Solver-Massengrenzen beeinflussen den Auslauf von Kettenfahrzeugen. Lenkgeometrie und Reifenschlupf sind vereinfacht.' :
                    'Masses and material coefficients are model assumptions. Wheel load is estimated; general contact forces are not measured. Motor torque and power come from the last solver step; passive friction is separate. Solver mass floors affect tracked-vehicle coasting. Steering geometry and tyre slip are simplified.'}</p></details>
                <button type="button" onClick={() => this.cancelEdit(onPresets)} style={{marginTop: 6}}>{T.presets}</button>
            </section>
        );
    }
}
SimLabMeasurements.propTypes = {
    controlPair: PropTypes.object, histories: PropTypes.array, onControlPair: PropTypes.func, onClearControlPair: PropTypes.func,
    precisionOptions: PropTypes.object, onPrecisionOptions: PropTypes.func,
    precisionEnabled: PropTypes.bool, onPrecisionToggle: PropTypes.func,
    locale: PropTypes.string.isRequired, definitions: PropTypes.array.isRequired, rows: PropTypes.array.isRequired,
    parts: PropTypes.array.isRequired, mechanism: PropTypes.object.isRequired, shown: PropTypes.bool.isRequired, replaying: PropTypes.bool.isRequired,
    onPickTarget: PropTypes.func, onHighlight: PropTypes.func, onPreview: PropTypes.func, readPreview: PropTypes.func, modelKey: PropTypes.string,
    onPlotSelection: PropTypes.func, modelContext: PropTypes.object, recorderRevision: PropTypes.number, recordingAllowed: PropTypes.bool, onHistoryChanged: PropTypes.func, initialPlots: PropTypes.array, recorder: PropTypes.object, session: PropTypes.object, sampleTime: PropTypes.number, paused: PropTypes.bool, teachingPreset: PropTypes.object, onSample: PropTypes.func,
    onChange: PropTypes.func.isRequired, onShown: PropTypes.func.isRequired, onPresets: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired
};
export default SimLabMeasurements;
