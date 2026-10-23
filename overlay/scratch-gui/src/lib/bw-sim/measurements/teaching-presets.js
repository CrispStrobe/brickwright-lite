// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {measurementDefinitions} from './schema.js';
import {jointBinding} from './readings.js';

const examples = {
    'crank-rocker.ldr': {
        parts: 'motor frame framePin1 framePin2 crank crankPin1 crankPin2 pinB coupler pinC rocker axleD hub hubPin-60 hubPin60',
        title: ['Crank and rocker', 'Kurbel und Schwinge'],
        readings: [
            ['jointAngle', ['frame', 'crank'], 'A', ['Input crank angle', 'Eingang: Kurbelwinkel']],
            ['jointAngle', ['rocker', 'frame'], null, ['Output rocker angle', 'Ausgang: Schwingenwinkel']],
            ['jointSpeed', ['rocker', 'frame'], null, ['Output rocker speed', 'Ausgang: Schwingengeschwindigkeit']]
        ]
    },
    'forklift.ldr': {
        parts: 'hub topBeam topPinFront topPinBack lift liftPin1 liftPin2 pinionAxle pinion rack carriageAxle upright forkArm forkBeam forkBeamPin1 forkBeamPin2 forkPin forkLeft forkRight slide guideHolder guideHolderPin guideStub guideTee guide',
        title: ['Forklift motion', 'Bewegung des Gabelstaplers'],
        readings: [
            ['jointAngle', ['guide', 'pinion'], 'C', ['Input pinion angle', 'Eingang: Ritzelwinkel']],
            ['travel', ['guide', 'rack'], null, ['Carriage travel', 'Weg des Hubwagens']],
            ['weight', ['rack'], null, ['Configured carriage weight', 'Konfiguriertes Wagengewicht']]
        ]
    }
};

/** Match authored members and exact joint roles; generated joint IDs are never preset selectors. */
export const teachingMeasurementPreset = (session, name, locale = 'en') => {
    const spec = Object.prototype.hasOwnProperty.call(examples, name) && examples[name];
    if (!spec) return null;
    const model = session.runModel || session.model, mechanism = session.mechanism;
    const ids = model.parts.map(p => p.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(spec.parts.split(' ').sort())) return null;
    const body = id => {
        const matches = mechanism.bodies.filter(b => b.parts?.includes(id));
        return matches.length === 1 ? matches[0].id : null;
    };
    const language = locale === 'de' ? 1 : 0, definitions = [];
    for (const [kind, targets, port, label] of spec.readings) {
        const d = {id: `lesson-${definitions.length}`, kind, label: label[language], visible: true};
        if (kind === 'weight') {
            if (!body(targets[0])) return null;
            d.targets = targets.slice();
        } else {
            const [a, b] = targets.map(body);
            if (!a || !b || a === b) return null;
            const matches = mechanism.joints.filter(j => j.type === (kind === 'travel' ? 'slider' : 'hinge') &&
                ((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a)) &&
                (port ? j.motor?.port === port : !j.motor));
            if (matches.length !== 1) return null;
            d.joint = matches[0].id;
            d.binding = jointBinding(mechanism, matches[0]);
        }
        definitions.push(d);
    }
    return {title: spec.title[language], definitions: measurementDefinitions(definitions)};
};
