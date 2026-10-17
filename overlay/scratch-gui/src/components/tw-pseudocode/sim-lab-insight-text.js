// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's words for what is in a model and what is wrong with it, for
// children, in English and German (the pane's locale table for the issues
// list, the port labels and the "Show how it moves" overlay; sim-lab-pane.jsx
// reads it). Each issue code the model reader, the compiler or the pane can
// produce (lib/bw-sim/model, lib/bw-sim/mech, lib/bw-sim/sim-session.js) has a
// sentence here; test/bw-sim-model-insight.test.mjs finds the codes in those
// sources and fails on one without a sentence in both languages.
//
// Placeholders: {parts} the parts the issue is about ("the SPIKE medium angular
// motor"), {line} the LDraw line it was found on.

export const INSIGHT_TEXT = {
    en: {
        issues: {
            'motor-without-port': '{parts} is not plugged into the hub yet: click here, then choose a port (A–F) on its label.',
            'sensor-without-port': '{parts} is not plugged into the hub yet: click here, then choose a port (A–F) on its label.',
            'no-motor': 'No motor is plugged into the hub, so the robot cannot move by itself. Give a motor a port (A–F).',
            'no-hub': 'There is no SPIKE hub in this model, so no program can run it. Add the hub from the parts list.',
            'falls-apart': 'This robot falls apart: some parts are not connected to the rest. Click here to see them, then fix them with pins or axles.',
            'empty-model': 'There is nothing to simulate yet: add some parts in Build.',
            'loose-part': '{parts}: not joined to the rest of the robot. Loose parts fall off: join them with a pin or an axle.',
            'gear-on-frame': '{parts} are stuck: one gear is fixed to the part that holds the other one, so they cannot turn. Put one gear on its own axle that turns.',
            'gear-frames-differ': '{parts} touch, but their axles sit in different parts, so they do not turn each other here. Hold both axles in the same beam.',
            'gear-not-on-hinge': '{parts} is not on an axle that can turn, so it cannot turn other gears.',
            'unsupported-gear': '{parts} do not work together in the Robot Lab yet (only round gears and bevel gears do).',
            'locked-hinges': '{parts}: these joints hold the parts in two different directions, so they cannot turn. They move as one piece.',
            'unknown-part': 'The Robot Lab does not know a part on line {line} yet, so it is left out.',
            'invalid-model': 'Something in the model is not right, so part of it is left out: {parts}',
            'bad-obstacle': 'One of the obstacles is not set up right and is left out.',
            'bad-port': 'The port on line {line} is not one of A–F, so it is ignored.',
            'bad-matrix': 'The part on line {line} is mirrored or stretched. Real bricks cannot be, so it is left out.',
            'unparsable': 'Line {line} of the file could not be read, so it is left out.',
            'loose-geometry': 'Line {line} is a loose drawing line, not a part, so it is left out.',
            'duplicate-id': '{parts} had the same name as another part and got a new one.',
            'bad-group': 'A group on line {line} is not written right, so it is left out.',
            'duplicate-group': 'A group on line {line} has the same name as another group, so it is left out.',
            'unknown-group': 'A part on line {line} belongs to a group that does not exist, so it is left ungrouped.',
            'project-model-unreadable': 'The robot saved in this project could not be read, so the standard robot is shown.'
        },
        fallbackIssue: 'Something about this model needs a look.',
        and: 'and', part: 'the part {id}',
        blockersTitle: 'Before you press Run:',
        showPorts: 'Show ports', showMotion: 'Show how it moves',
        showPortsHelp: 'Show each motor’s and sensor’s hub port next to it (? means not plugged in)',
        showMotionHelp: 'Colour the parts that move together, draw the turning axes (red: motors) and the gear pairs',
        issueHelp: 'Click to show these parts',
        portLabel: '{part} on port {port}: click to change the port', portLabelNone: '{part} is not plugged in: click to choose a port',
        portPick: 'Port for {part}', portNone: 'none', close: 'Close'
    },
    de: {
        issues: {
            'motor-without-port': '{parts} steckt noch nicht im Hub: hier klicken, dann an seinem Schild einen Port (A–F) wählen.',
            'sensor-without-port': '{parts} steckt noch nicht im Hub: hier klicken, dann an seinem Schild einen Port (A–F) wählen.',
            'no-motor': 'Kein Motor steckt im Hub, darum kann sich der Roboter nicht von selbst bewegen. Gib einem Motor einen Port (A–F).',
            'no-hub': 'In diesem Modell ist kein SPIKE-Hub, darum kann kein Programm es steuern. Füge den Hub aus der Teileliste hinzu.',
            'falls-apart': 'Dieser Roboter fällt auseinander: Einige Teile hängen nicht am Rest. Hier klicken zeigt sie, dann mit Pins oder Achsen befestigen.',
            'empty-model': 'Noch gibt es nichts zu simulieren: Füge beim Bauen Teile hinzu.',
            'loose-part': '{parts}: nicht mit dem Rest des Roboters verbunden. Lose Teile fallen ab: Befestige sie mit einem Pin oder einer Achse.',
            'gear-on-frame': '{parts} klemmen: Ein Zahnrad sitzt fest an dem Teil, das das andere hält, darum können sie sich nicht drehen. Setz ein Zahnrad auf eine eigene Achse, die sich dreht.',
            'gear-frames-differ': '{parts} berühren sich, aber ihre Achsen stecken in verschiedenen Teilen, darum drehen sie sich hier nicht gegenseitig. Halte beide Achsen im selben Balken.',
            'gear-not-on-hinge': '{parts} sitzt nicht auf einer Achse, die sich drehen kann, darum dreht es keine anderen Zahnräder.',
            'unsupported-gear': '{parts} funktionieren im Roboter-Labor noch nicht zusammen (nur runde Zahnräder und Kegelzahnräder).',
            'locked-hinges': '{parts}: Diese Gelenke halten die Teile in zwei verschiedene Richtungen, darum können sie sich nicht drehen. Sie bewegen sich als ein Stück.',
            'unknown-part': 'Das Roboter-Labor kennt ein Teil in Zeile {line} noch nicht, darum wird es weggelassen.',
            'invalid-model': 'Etwas im Modell stimmt nicht, darum wird ein Teil weggelassen: {parts}',
            'bad-obstacle': 'Eins der Hindernisse ist nicht richtig eingestellt und wird weggelassen.',
            'bad-port': 'Der Port in Zeile {line} ist keiner von A–F, darum wird er ignoriert.',
            'bad-matrix': 'Das Teil in Zeile {line} ist gespiegelt oder gestreckt. Echte Steine können das nicht, darum wird es weggelassen.',
            'unparsable': 'Zeile {line} der Datei konnte nicht gelesen werden, darum wird sie weggelassen.',
            'loose-geometry': 'Zeile {line} ist eine lose Zeichenlinie, kein Teil, darum wird sie weggelassen.',
            'duplicate-id': '{parts} hatte denselben Namen wie ein anderes Teil und hat einen neuen bekommen.',
            'bad-group': 'Eine Gruppe in Zeile {line} ist nicht richtig geschrieben, darum wird sie weggelassen.',
            'duplicate-group': 'Eine Gruppe in Zeile {line} hat denselben Namen wie eine andere Gruppe, darum wird sie weggelassen.',
            'unknown-group': 'Ein Teil in Zeile {line} gehört zu einer Gruppe, die es nicht gibt, darum bleibt es ohne Gruppe.',
            'project-model-unreadable': 'Der in diesem Projekt gespeicherte Roboter konnte nicht gelesen werden, darum wird der Standard-Roboter gezeigt.'
        },
        fallbackIssue: 'Etwas an diesem Modell solltest du dir ansehen.',
        and: 'und', part: 'das Teil {id}',
        blockersTitle: 'Bevor du Start drückst:',
        showPorts: 'Ports zeigen', showMotion: 'Zeigen, wie es sich bewegt',
        showPortsHelp: 'Zeigt neben jedem Motor und Sensor seinen Hub-Port (? heißt: nicht eingesteckt)',
        showMotionHelp: 'Färbt Teile, die sich zusammen bewegen, zeichnet die Drehachsen (rot: Motoren) und die Zahnradpaare',
        issueHelp: 'Klicken zeigt diese Teile',
        portLabel: '{part} an Port {port}: klicken ändert den Port', portLabelNone: '{part} steckt nicht im Hub: klicken, um einen Port zu wählen',
        portPick: 'Port für {part}', portNone: 'keiner', close: 'Schließen'
    }
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

/**
 * An issue in a child's words.
 * @param {object} text INSIGHT_TEXT[locale]
 * @param {{code: string, parts?: string[], line?: number}} issue
 * @param {(id: string) => string} nameOf a part id → its name in this language ("the SPIKE hub")
 */
export const issueSentence = (text, issue, nameOf) => {
    const names = (issue.parts || []).map(id => nameOf(id));
    const parts = names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} ${text.and} ${names[names.length - 1]}`;
    const template = text.issues[issue.code] || text.fallbackIssue;
    const sentence = fill(template, {parts, line: issue.line ?? ''});
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

export const fillText = fill;
