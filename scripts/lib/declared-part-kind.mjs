/**
 * What kind of part does a pin's DECLARED NAME assert?
 *
 * The seating generator (bw-circuit-ui `model/infer-seated.js`) chooses a part
 * from the pin's DIRECTION alone — analog becomes a potentiometer, input a
 * button, output an LED — and uses the declared name only as a label. So
 * `PIN ldr = P1.3 ANALOG` is drawn as a potentiometer, and the picture
 * contradicts the word the learner wrote.
 *
 * This module says what a name asserts, and NOTHING about wiring. It is
 * deliberately conservative: a name that asserts nothing returns null, and the
 * generator's default stands. Two rules, in order:
 *
 *   1. DERIVED. A name token that IS a footprint kind wins outright. This needs
 *      no table and grows by itself as upstream adds kinds.
 *   2. A SMALL, STATED synonym table for the words learners actually write.
 *      Every entry here is a word, not a judgement about circuits.
 *
 * A name is never a contradiction of a kind it already matches: `declName`
 * "piezo" on a `piezo` part is consistent, and an earlier version of this
 * measurement called twelve of those a defect because it applied the synonym
 * table before checking for agreement.
 */

// Synonyms only — never a kind that already exists under its own name.
export const NAME_SYNONYMS = {
    light: 'ldr', photo: 'ldr', lux: 'ldr', photocell: 'ldr',
    buzz: 'buzzer', beep: 'buzzer', speaker: 'buzzer', spk: 'buzzer',
    fan: 'dc_motor', pump: 'dc_motor',
    thermistor: 'ntc'
};

/** Longest token first, so `photocell` is not decided by `photo`. */
const byLength = (a, b) => b.length - a.length;

export const declaredPartKind = (declName, kinds) => {
    const name = String(declName || '').toLowerCase();
    if (!name) return null;
    const known = kinds instanceof Set ? kinds : new Set(kinds || []);
    for (const kind of [...known].sort(byLength)) {
        if (kind.length >= 3 && name.includes(kind)) return kind;
    }
    for (const word of Object.keys(NAME_SYNONYMS).sort(byLength)) {
        if (name.includes(word)) return NAME_SYNONYMS[word];
    }
    return null;
};

/** null when the name asserts nothing, or asserts what the part already is. */
export const contradiction = (declName, kind, kinds) => {
    const want = declaredPartKind(declName, kinds);
    return want && want !== kind ? want : null;
};
