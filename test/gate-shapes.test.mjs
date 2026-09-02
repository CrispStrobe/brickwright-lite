/**
 * The population of gate-shape suspects must not grow while it is being triaged.
 *
 * `scripts/audit-gate-shapes.mjs` finds four shapes that each let a defect reach main on
 * 2026-09-02. Its hits are SUSPECTS, not verdicts — most need a human to decide whether the
 * captured region can really contain its terminator, or whether an appearance assertion ought
 * to have a matching absence one. Triaging 58 of them is not a thing to do in one pass.
 *
 * What can be enforced today is that the number does not increase. A ratchet is honest about
 * the debt while making it impossible to add more silently — and unlike the gates this sweep
 * exists to find, this one CAN fail: lowering the baseline after real triage is a deliberate
 * edit, and adding a new suspect is a red test.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

// Measured 2026-09-02. LOWER these as suspects are triaged; never raise one to make a push
// green. A new suspect is a new place a gate can stop biting without saying so.
const BASELINE = {
    'EVENT-AS-STATE': 12,
    'SEGMENT-MATCH': 1,
    'TRUNCATED-CAPTURE': 8,
    'WINDOWED-SEARCH': 37
};

test('no new gate-shape suspects', () => {
    const raw = execFileSync(process.execPath,
        [path.join(root, 'scripts/audit-gate-shapes.mjs'), '--json'],
        {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    const {counts} = JSON.parse(raw);
    for (const [kind, allowed] of Object.entries(BASELINE)) {
        const found = counts[kind] || 0;
        assert.ok(found <= allowed,
            `${kind}: ${found} suspects, baseline ${allowed}. A gate whose capture can be ` +
            'truncated, whose scope is a fixed character window, whose membership test sees only ' +
            'the last path segment, or which proves a thing appears but never that it leaves, ' +
            'stops biting silently. Fix it, or state why it is safe and raise the baseline in ' +
            'the same commit.');
    }
    for (const kind of Object.keys(counts)) {
        assert.ok(kind in BASELINE, `unrecognised suspect kind ${kind} — add it to the baseline`);
    }
});
