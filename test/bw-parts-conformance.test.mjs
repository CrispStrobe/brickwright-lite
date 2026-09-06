/**
 * The part-profile registry (plan P1) kept honest against the code.
 *
 * lib/bw-parts/profiles.js is a reviewed table; this is what stops it drifting
 * from bw-board's device registry and the sb3-creator emitter. Four checks:
 *   (1) every bw-board device id has a profile or a named refusal — red by name
 *       for any that does not, so a new part cannot land uncatalogued.
 *   (2) verbs and the emitter agree both ways: every verb a profile lists exists
 *       in the emitter, and every hardware verb the emitter has is catalogued.
 *   (3) the verb×family matrix is what the emitter says — the stored families
 *       equal the ones re-derived from the emitter text, so removing an emitter
 *       branch reddens the cell it fed. The attribution rule and its anchors are
 *       in scripts/gen-part-profiles.mjs; the anchors are re-asserted here.
 *   (4) the generated doc is current (T3).
 *
 * The one judgement in the lane is the attribution rule; it lives in the
 * generator header, and check (3) is the thing that binds it to the emitter.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    VERBS, VERB_FAMILIES, FAMILY, PROGRAMMABLE, REFUSED, REFUSED_DOCUMENTED,
    SECTIONS, REASON
} from '../overlay/scratch-gui/src/lib/bw-parts/profiles.js';
import {registerAllDevices} from '../overlay/scratch-gui/src/lib/bw-board/register-all.js';
import {registeredKinds} from '../overlay/scratch-gui/src/lib/bw-board/devices.js';
import {deriveVerbFamilies, buildPartProfiles, checkPartProfiles} from '../scripts/gen-part-profiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const EMITTER = join(repo, 'overlay/scratch-gui/src/lib/sb3-creator.js');
const DEVICES = join(repo, 'overlay/scratch-gui/src/lib/bw-board/devices.js');
const DOC = join(repo, 'docs/generated/PART-PROFILES.md');

/**
 * BUILTIN_KINDS is not exported by devices.js; read it from source. The array
 * is BRACKET-MATCHED rather than captured with a lazy `[\s\S]*?…\]` (which stops
 * at the first `]` and is the TRUNCATED-CAPTURE shape gate-shapes forbids).
 */
function builtinKinds () {
    const s = readFileSync(DEVICES, 'utf8');
    const open = s.indexOf('[', s.indexOf('const BUILTIN_KINDS = new Set('));
    let depth = 0;
    let close = open;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '[') depth++;
        else if (s[i] === ']') { depth--; if (depth === 0) { close = i; break; } }
    }
    const body = s.slice(open + 1, close).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    return [...body.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}

const profileIds = () => new Set([
    ...PROGRAMMABLE.map((p) => p.id),
    ...Object.values(REFUSED).flat(),
    ...Object.values(REFUSED_DOCUMENTED).flat()
]);

test('(1) every bw-board device id has a profile or a named refusal', () => {
    registerAllDevices();
    const bwIds = new Set([...registeredKinds(), ...builtinKinds(), ...SECTIONS.documented]);
    const covered = profileIds();
    const missing = [...bwIds].filter((id) => !covered.has(id)).sort();
    assert.deepEqual(missing, [],
        'these bw-board part ids have no row in lib/bw-parts/profiles.js — a part that bw-board '
        + 'registers but the registry does not catalogue is exactly the silent gap P1 closes. Add '
        + 'each to PROGRAMMABLE (with its verbs) or to a REFUSED category:\n  ' + missing.join('\n  '));
    // and no row for an id bw-board does not know
    const extra = [...covered].filter((id) => !bwIds.has(id)).sort();
    assert.deepEqual(extra, [],
        'these ids have a profile row but are not bw-board device kinds (nor builtin/documented):\n  '
        + extra.join('\n  '));
});

test('(1b) every id is catalogued exactly once, and every refusal reason is in the vocabulary', () => {
    const rows = [
        ...PROGRAMMABLE.map((p) => p.id),
        ...Object.values(REFUSED).flat(),
        ...Object.values(REFUSED_DOCUMENTED).flat()
    ];
    const seen = new Set();
    const dup = rows.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    assert.deepEqual([...new Set(dup)], [], `these ids appear in more than one place: ${dup.join(', ')}`);
    const reasons = new Set(Object.values(REASON));
    const used = [...Object.keys(REFUSED), ...Object.keys(REFUSED_DOCUMENTED)];
    for (const r of used) assert.ok(reasons.has(r), `refusal reason "${r}" is not in the REASON vocabulary`);
});

test('(2) profile verbs and emitter verbs agree in both directions', () => {
    const emitterVerbs = new Set(Object.keys(deriveVerbFamilies(readFileSync(EMITTER, 'utf8'))));
    // every verb a profile lists exists in the emitter
    for (const p of PROGRAMMABLE) {
        for (const v of p.verbs) {
            assert.ok(emitterVerbs.has(v),
                `part "${p.id}" lists verb "${v}", which the emitter does not implement. `
                + 'Either the emitter dropped it or the profile is wrong.');
        }
    }
    // the canonical VERBS list equals the emitter's hardware verbs
    assert.deepEqual([...VERBS].sort(), [...emitterVerbs].sort(),
        'VERBS in profiles.js does not equal the set of hardware verbs the emitter implements. '
        + 'A verb the emitter gained or lost must move this list (and VERB_FAMILIES) with it.');
    // every catalogued verb is used by at least one programmable part (no dead verb)
    const used = new Set(PROGRAMMABLE.flatMap((p) => p.verbs));
    const dead = [...VERBS].filter((v) => v !== 'pin' && !used.has(v)).sort();
    assert.deepEqual(dead, [],
        'these emitter verbs drive no catalogued part — either a part is missing its verb, or the '
        + 'verb is genuinely unreachable from any part:\n  ' + dead.join('\n  '));
});

test('(3) the stored verb×family matrix is exactly what the emitter branches say', () => {
    const derived = deriveVerbFamilies(readFileSync(EMITTER, 'utf8'));
    // both directions, per verb, so removing an emitter branch reddens its cell
    assert.deepEqual(
        Object.fromEntries(VERBS.map((v) => [v, VERB_FAMILIES[v]])),
        Object.fromEntries(VERBS.map((v) => [v, derived[v]])),
        'VERB_FAMILIES no longer matches what the emitter branches produce. A family was added to '
        + 'or removed from an emitter verb; run `npm run gen:part-profiles` and review the diff — '
        + 'do not hand-edit the table to silence this.');
    // the anchors that fix the attribution rule
    assert.deepEqual(derived.shiftOut, ['8051', 'avr', '6502', 'arm'],
        'shift_out must be implemented for four families (8051, avr, 6502, arm — not z80)');
    assert.deepEqual(derived.pin, ['8051', 'avr', '6502', 'z80', 'arm'],
        'the pin primitives must be implemented for all five families');
    assert.deepEqual(derived.adc, ['8051', 'avr', 'arm'],
        'adc must be three families (8051, avr, arm): its flag is in the shared procedures_call '
        + 'case, which is NOT credited because that case is not dedicated to one verb');
    // 8051 is the base dialect: present for every verb
    for (const v of VERBS) assert.ok(VERB_FAMILIES[v].includes('8051'), `verb "${v}" is missing the 8051 base dialect`);
    // only the five emitter families are stored (rp2040/i8086 are doc-render)
    const allowed = new Set(Object.values(FAMILY));
    for (const v of VERBS) for (const f of VERB_FAMILIES[v]) {
        assert.ok(allowed.has(f), `verb "${v}" stores family "${f}", which is not one of the five emitter families`);
    }
});

test('(4) the generated PART-PROFILES.md is current', () => {
    assert.doesNotThrow(checkPartProfiles);
    assert.equal(readFileSync(DOC, 'utf8'), buildPartProfiles());
});
