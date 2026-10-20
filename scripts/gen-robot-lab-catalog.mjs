#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFileSync, writeFileSync} from 'node:fs';
import {MODELS, prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
const root = new URL('../', import.meta.url);
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))));
// The topic and challenge describe an observable physical effect, not just the model's shape.
const lessons = {
    'driving-base': ['motion', 'Differential steering: vary the wheel speeds to change the turning radius.', 'Differenziallenkung: Ändere die Raddrehzahlen und damit den Kurvenradius.'],
    'line-follower': ['sensing', 'Feedback control: use reflected light to steer along a line.', 'Regelung: Nutze reflektiertes Licht, um einer Linie zu folgen.'],
    'wall-stopper': ['sensing', 'Stopping distance: compare the distance reading with the braking motion.', 'Anhalteweg: Vergleiche den Abstandsmesswert mit der Bremsbewegung.'],
    'colour-explorer': ['sensing', 'Use colour feedback and heading to reach a target on the floor.', 'Erreiche mit Farb- und Richtungsrückmeldung ein Ziel auf dem Boden.'],
    sumo: ['motion', 'Traction and turning: keep the robot within the ring.', 'Haftung und Lenken: Halte den Roboter im Ring.'],
    forklift: ['forces', 'A rack and pinion turns rotation into lift: measure height per motor turn.', 'Eine Zahnstange wandelt Drehung in Hub um: Miss den Hub je Motorumdrehung.'],
    'maze-runner': ['sensing', 'Navigate with distance and colour measurements.', 'Navigiere mit Abstands- und Farbmessungen.'],
    gearbox: ['gears', 'A sliding clutch selects a transmission ratio. Compare input and output turns.', 'Eine Schaltkupplung wählt die Übersetzung. Vergleiche An- und Abtriebsumdrehungen.'],
    differential: ['gears', 'Hold one output: the other takes twice the carrier speed.', 'Halte einen Abtrieb fest: Der andere dreht mit doppelter Korbdrehzahl.'],
    'chain-drive': ['chains', 'A chain couples separated shafts in the same direction with a tooth-count ratio.', 'Eine Kette koppelt getrennte Wellen gleichsinnig mit dem Zähnezahlverhältnis.'],
    'pneumatic-press': ['fluids', 'Pressure drives a cylinder; the valve reverses its motion.', 'Druck bewegt einen Zylinder; das Ventil kehrt die Bewegung um.'],
    'drawing-robot': ['motion', 'The trailing pen traces the geometry of motion and turning.', 'Der nachlaufende Stift zeichnet die Geometrie von Fahrt und Drehung.'],
    'chain-transmission': ['chains', '59 pieces, including a real 42-link chain. Three 16T input turns give two 24T output turns in the same direction.', '59 Teile mit einer echten Kette aus 42 Gliedern. Drei Antriebsumdrehungen am 16er ergeben zwei gleichsinnige am 24er.'],
    'flywheel-differential': ['inertia', 'Two stacks of three flywheels add rotational inertia. Brake one side and measure how the differential shares speed.', 'Zwei Stapel aus je drei Schwungrädern erhöhen die Rotationsträgheit. Bremse eine Seite und miss die Drehzahlverteilung im Differenzial.'],
    'survey-rover': ['forces', 'Gravity back-drives the sensor head unless the motor actively holds its position.', 'Die Schwerkraft verdreht den Sensorkopf, wenn der Motor seine Position nicht aktiv hält.'],
    excavator: ['forces', 'A slewing frame and three screw actuators: leverage, self-locking and end-of-travel clutches.', 'Drehgestell und drei Spindelantriebe: Hebelwirkung, Selbsthemmung und Rutschkupplungen am Hubende.'],
    'rcx-bumper-car': ['sensing', 'Contact feedback stops or reverses a moving robot.', 'Eine Kontaktrückmeldung stoppt den fahrenden Roboter oder kehrt ihn um.'],
    'rcx-line-follower': ['sensing', 'An RCX light sensor closes the steering feedback loop.', 'Ein RCX-Lichtsensor schließt den Regelkreis der Lenkung.'],
    'ev3-wall-stopper': ['sensing', 'Ultrasonic distance feedback controls the stopping point.', 'Eine Ultraschall-Abstandsrückmeldung bestimmt den Haltepunkt.'],
    'nxt-bumper-bot': ['sensing', 'A touch sensor gives contact feedback to the NXT controller.', 'Ein Tastsensor meldet dem NXT die Berührung.'],
    'motor-bench': ['inertia', 'A motor accelerates an axle and gear; compare running and braking.', 'Ein Motor beschleunigt Achse und Zahnrad; vergleiche Antrieb und Bremsung.'],
    'technic-hub-bench': ['inertia', 'Drive a motor and measure its encoder through a Technic hub.', 'Steuere einen Motor und miss seinen Drehgeber über einen Technic-Hub.'],
    'boost-rover': ['motion', 'Two built-in wheel motors produce straight motion and rotation.', 'Zwei eingebaute Radmotoren erzeugen Geradeausfahrt und Drehung.'],
    'wedo-milo': ['sensing', 'Distance feedback stops a one-motor rover.', 'Eine Abstandsrückmeldung stoppt einen Rover mit einem Motor.']
};
const output = {};
for (const entry of MODELS) {
    const key = entry.id || entry.file;
    const id = key.replace(/\.ldr$/, '');
    if (!lessons[id]) throw new Error(`Missing lesson: ${id}`);
    const {model, mechanism} = prepareModel(readFileSync(new URL(`overlay/scratch-gui/static/sim-lab/models/${entry.file}`, root), 'utf8'), catalog);
    const [topic, en, de] = lessons[id];
    output[key] = {pieces: model.parts.length, motors: mechanism.actuators.length,
        hubs: [...new Set(mechanism.hubs.map(h => h.profile))], topic, description: {en, de},
        author: 'Brickwright contributors', license: 'BSD-3-Clause'};
}
const text = '// SPDX-License-Identifier: BSD-3-Clause\n// Generated by scripts/gen-robot-lab-catalog.mjs; counts come from the actual compiled models.\n' +
    `export const MODEL_LESSONS = Object.freeze(${JSON.stringify(output, null, 4)});\n`;
const dest = new URL('overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js', root);
if (process.argv.includes('--check')) {
    if (readFileSync(dest, 'utf8') !== text) throw new Error('Robot Lab example metadata is stale; regenerate with scripts/gen-robot-lab-catalog.mjs');
} else writeFileSync(dest, text);
