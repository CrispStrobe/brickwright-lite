// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's words for a program the SPIKE firmware route cannot run, in
// English and German (sim-lab-pane.jsx reads it). The firmware-program compiler
// (lib/spike-arena/firmware-program.js) refuses with a FirmwareProgramError whose
// `code` says what the firmware cannot do and whose `block` is the refused block as
// the pseudocode line it reads as; every code has a sentence here, in both
// languages — test/bw-sim-renode-lockstep-program.test.mjs finds the codes in the
// compiler's source and fails on one without.
//
// Placeholders: {block} the block ("move forward 10 cm"), {at} " (at “block”)" or
// nothing, and the error's params ({count} {name} {min} {max} {ports} {sensor}
// {unit} {limit} {opcode}).

export const FIRMWARE_TEXT = {
    en: {
        refused: 'The SPIKE firmware cannot run this program. {reason} Change the program, or choose the SPIKE blocks route.',
        at: ' (at “{block}”)',
        sensors: {distance: 'distance', force: 'force', color: 'colour'},
        units: {degrees: 'degrees', rotations: 'rotations', cm: 'centimetres', in: 'inches'},
        reasons: {
            'script-count': 'It needs exactly one script that starts with “when green flag clicked” (this project has {count}).',
            'no-green-flag': 'Its script must start with “when green flag clicked”.',
            'unsupported-block': 'The firmware has no form for the block “{block}”.',
            'unsupported-input': 'The firmware has no form for {opcode} in “{block}”.',
            'too-long': 'The program is longer than the firmware’s {limit} instructions{at}.',
            'not-literal': '“{block}”: the firmware needs a plain number or word in {name}, not a reporter block.',
            'range': '“{block}”: {name} must be a number from {min} to {max}.',
            'ports': '“{block}”: the firmware drives motors on ports {ports} only.',
            'direction': '“{block}”: the direction must be forward or backward.',
            'no-sensors': '“{block}”: with six motors the hub has no sensor to wait for.',
            'sensor-port': '“{block}”: the firmware reads the {sensor} sensor on port {ports} only.',
            'cyclic': 'The script’s blocks are joined in a circle the firmware cannot follow.',
            'repeat-integer': '“{block}”: the firmware repeats a whole number of times only.',
            'after-forever': '“{block}”: the firmware cannot run blocks after a forever loop.',
            'speed-in-loop': '“{block}”: the firmware needs speed settings before any loop that waits for a sensor or runs forever.',
            'movement-motors': '“{block}”: the firmware drives with motors A and B only.',
            'brake-only': '“{block}”: the firmware stops a motor with brake only.',
            'two-motor-position': '“{block}”: the firmware cannot turn two motors together by {unit} — it moves one motor at a time and waits for it. Use seconds instead (move forward … seconds).',
            'unit': '“{block}”: the firmware moves a motor for seconds, degrees or rotations, not {unit}.',
            'zero-speed': '“{block}”: set a motor speed other than 0 before this move.',
            'other': '{message}'
        }
    },
    de: {
        refused: 'Die SPIKE-Firmware kann dieses Programm nicht ausführen. {reason} Ändere das Programm oder wähle den Weg SPIKE-Blöcke.',
        at: ' (bei „{block}“)',
        sensors: {distance: 'Abstands', force: 'Kraft', color: 'Farb'},
        units: {degrees: 'Grad', rotations: 'Umdrehungen', cm: 'Zentimeter', in: 'Zoll'},
        reasons: {
            'script-count': 'Es braucht genau ein Skript, das mit „Wenn die grüne Flagge angeklickt“ beginnt (dieses Projekt hat {count}).',
            'no-green-flag': 'Sein Skript muss mit „Wenn die grüne Flagge angeklickt“ beginnen.',
            'unsupported-block': 'Für den Block „{block}“ hat die Firmware keine Form.',
            'unsupported-input': 'Für {opcode} in „{block}“ hat die Firmware keine Form.',
            'too-long': 'Das Programm ist länger als die {limit} Befehle der Firmware{at}.',
            'not-literal': '„{block}“: Die Firmware braucht bei {name} eine feste Zahl oder ein festes Wort, keinen Werteblock.',
            'range': '„{block}“: {name} muss eine Zahl von {min} bis {max} sein.',
            'ports': '„{block}“: Die Firmware steuert nur Motoren an den Anschlüssen {ports}.',
            'direction': '„{block}“: Die Richtung muss vorwärts oder rückwärts sein.',
            'no-sensors': '„{block}“: Mit sechs Motoren hat der Hub keinen Sensor, auf den er warten kann.',
            'sensor-port': '„{block}“: Die Firmware liest den {sensor}sensor nur an Anschluss {ports}.',
            'cyclic': 'Die Blöcke des Skripts sind im Kreis verbunden; dem kann die Firmware nicht folgen.',
            'repeat-integer': '„{block}“: Die Firmware wiederholt nur ganze Male.',
            'after-forever': '„{block}“: Nach einer Fortlaufend-Schleife kann die Firmware keine Blöcke mehr ausführen.',
            'speed-in-loop': '„{block}“: Die Firmware braucht Geschwindigkeiten vor jeder Schleife, die auf einen Sensor wartet oder fortlaufend läuft.',
            'movement-motors': '„{block}“: Die Firmware fährt nur mit den Motoren A und B.',
            'brake-only': '„{block}“: Die Firmware hält einen Motor nur mit Bremsen an.',
            'two-motor-position': '„{block}“: Die Firmware kann zwei Motoren nicht gemeinsam um {unit} drehen – sie bewegt einen Motor nach dem anderen und wartet jeweils. Nimm stattdessen Sekunden (move forward … seconds).',
            'unit': '„{block}“: Die Firmware bewegt einen Motor für Sekunden, Grad oder Umdrehungen, nicht {unit}.',
            'zero-speed': '„{block}“: Stelle vor dieser Bewegung eine Motorgeschwindigkeit ungleich 0 ein.',
            'other': '{message}'
        }
    }
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

/**
 * The pane's sentence for a program the firmware route refuses: which block, and why.
 * @param {string} locale 'en' | 'de'
 * @param {Error} error a FirmwareProgramError (or any other compiler error: its message)
 */
export const firmwareRefusalSentence = (locale, error) => {
    const text = FIRMWARE_TEXT[locale] || FIRMWARE_TEXT.en;
    const params = {...(error?.params || {})};
    let code = error?.code in text.reasons ? error.code : 'other';
    // A refused reporter or menu inside a statement: name both.
    if (code === 'unsupported-block' && params.opcode && params.opcode !== error.opcode) code = 'unsupported-input';
    if (params.sensor) params.sensor = text.sensors[params.sensor] || params.sensor;
    if (params.unit) params.unit = text.units[params.unit] || params.unit;
    const values = {...params, block: error?.block || '', message: error?.message || String(error),
        at: error?.block ? fill(text.at, {block: error.block}) : ''};
    return fill(text.refused, {reason: fill(text.reasons[code], values)});
};
