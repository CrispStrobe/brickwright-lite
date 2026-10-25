// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {measurementDefinitions} from './schema.js';
import {jointBinding, ropeBinding} from './readings.js';
import {sha256Text} from './binding-digest.js';

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
    },
    'gearbox.ldr': {
        partsHash: 'd1ae20cd6e613950d155814895855bcd35f3dd943a5506fbbded0d5c874c6fed',
        title: ['Gearbox ratios', 'Getriebeübersetzungen'],
        help: ['Compare input and output turns within each settled clutch position; shifting changes the ratio.',
            'Vergleiche Eingangs- und Ausgangsdrehung bei eingerückter Kupplung; Schalten ändert die Übersetzung.'],
        readings: [
            ['jointAngle', ['base', 'inputAxle'], 'A', ['Input angle', 'Eingangswinkel']],
            ['jointAngle', ['base', 'outputAxle'], null, ['Output angle', 'Ausgangswinkel']],
            ['jointSpeed', ['base', 'outputAxle'], null, ['Output speed', 'Ausgangsgeschwindigkeit']]
        ]
    },
    'sky-courier.ldr': {
        partsHash: '7914301457bf1a10cd2d824fd222be91470e9de935e6e4b3e7c3fdeeb0a11d8e',
        title: ['Two-winch suspension', 'Aufhängung mit zwei Winden'],
        help: ['Compare both cord tensions with the payload weight. At rest their vertical components support the weight; angled tension magnitudes do not simply add to it.',
            'Vergleiche beide Seilspannungen mit dem Gewicht. Im Stillstand tragen ihre vertikalen Anteile die Last; schräge Spannungsbeträge lassen sich nicht einfach addieren.'],
        readings: [
            ['tension', ['A_drum', 'A_guide', 'payload_tie_spine'], null, ['Left cord tension', 'Linke Seilspannung']],
            ['tension', ['B_drum', 'B_guide', 'payload_tie_spine'], null, ['Right cord tension', 'Rechte Seilspannung']],
            ['weight', ['payload_tie_spine'], null, ['Configured payload weight', 'Konfiguriertes Lastgewicht']]
        ]
    },
    'snapgate.ldr': {
        partsHash: '13428f8d8fbcf2840a5366216394677519298cfbd4fa74342639e439dc67c93c',
        title: ['Spring memory', 'Federspeicher'],
        help: ['Compare spring travel and rocker angle at matching input positions after opposite approaches; the ideal spring and stops can retain either state.',
            'Vergleiche Federweg und Wippenwinkel bei gleicher Eingangsstellung nach entgegengesetzter Anfahrt; ideale Feder und Anschläge können beide Zustände halten.'],
        readings: [
            ['jointAngle', ['hub', 'input_wheel'], null, ['Input angle', 'Eingangswinkel']],
            ['jointAngle', ['hub', 'rocker'], null, ['Rocker angle', 'Wippenwinkel']],
            ['travel', ['spring_rod', 'spring_cylinder'], null, ['Spring stroke', 'Federweg'], 'spring']
        ]
    },
    'pneumatic-press.ldr': {
        partsHash: '66d6d991a916d54a8eae0e08186f15382432c921ecdb5351a4dd8256fe908be6',
        title: ['Pneumatic press', 'Pneumatikpresse'],
        help: ['Compare valve angle, cylinder travel and live gauge pressure. Ideal piston force is pressure difference times area; pressure changes as air is used.',
            'Vergleiche Ventilwinkel, Zylinderweg und aktuellen Überdruck. Ideale Kolbenkraft ist Druckdifferenz mal Fläche; der Druck ändert sich beim Luftverbrauch.'],
        readings: [
            ['jointAngle', ['base', 'valve'], 'A', ['Valve angle', 'Ventilwinkel']],
            ['travel', ['rod', 'cylinder'], null, ['Cylinder travel', 'Zylinderweg']],
            ['pressure', ['cylinder', 'rod', 'valve'], null, ['Supply gauge pressure', 'Versorgungsüberdruck']]
        ]
    }
};

/** Match authored members and exact joint roles; generated joint IDs are never preset selectors. */
export const teachingMeasurementPreset = (session, name, locale = 'en') => {
    const spec = Object.prototype.hasOwnProperty.call(examples, name) && examples[name];
    if (!spec) return null;
    const model = session.runModel || session.model, mechanism = session.mechanism;
    const ids = model.parts.map(p => p.id).sort();
    if (spec.parts ? JSON.stringify(ids) !== JSON.stringify(spec.parts.split(' ').sort()) :
        sha256Text(JSON.stringify(ids)) !== spec.partsHash) return null;
    const body = id => {
        const matches = mechanism.bodies.filter(b => b.parts?.includes(id));
        return matches.length === 1 ? matches[0].id : null;
    };
    const language = locale === 'de' ? 1 : 0, definitions = [];
    for (const [kind, targets, port, label, role] of spec.readings) {
        const d = {id: `lesson-${definitions.length}`, kind, label: label[language], visible: true};
        if (kind === 'weight') {
            if (!body(targets[0])) return null;
            d.targets = targets.slice();
        } else if (kind === 'pressure') {
            if (!body(targets[0])) return null;
            const matches = (mechanism.couplings || []).filter(c => (c.kind === 'pneumatic' || c.kind === 'pump') &&
                c.network?.id && JSON.stringify(c.parts) === JSON.stringify(targets));
            if (matches.length !== 1) return null;
            d.targets = [targets[0]];
        } else if (kind === 'tension') {
            const matches = (mechanism.couplings || []).filter(c => c.kind === 'rope' &&
                JSON.stringify(c.parts) === JSON.stringify(targets) && mechanism.joints.some(j => j.id === c.drumJoint && j.type === 'hinge'));
            if (matches.length !== 1) return null;
            d.rope = matches[0].id;
            d.binding = ropeBinding(matches[0]);
        } else {
            const [a, b] = targets.map(body);
            if (!a || !b || a === b) return null;
            const matches = mechanism.joints.filter(j => j.type === (kind === 'travel' ? 'slider' : 'hinge') &&
                ((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a)) &&
                (port ? j.motor?.port === port : !j.motor) && (!role || (role === 'spring' && !!j.spring)));
            if (matches.length !== 1) return null;
            d.joint = matches[0].id;
            d.binding = jointBinding(mechanism, matches[0]);
        }
        definitions.push(d);
    }
    return {title: spec.title[language], help: spec.help?.[language], definitions: measurementDefinitions(definitions)};
};
