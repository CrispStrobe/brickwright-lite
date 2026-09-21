/**
 * docs/EXAMPLE-CORPUS-FINDINGS.md must not state a closed finding as current.
 *
 * THE DEFECT THIS HOLDS. That document says of itself: "this file is a
 * snapshot of a live measurement, not a survey someone did once." On
 * 2026-09-21 it named examples under four present-tense
 * `## Finding N — <count> examples …` headings, and every one of the four had
 * been closed — three of them by ratchets that were EMPTY, one by a metadata
 * fix the document's own last paragraph asked for. Thirteen of Finding 2's
 * entries came off on 2026-08-23, the very date in the document's header.
 *
 * Nothing noticed, because the ratchets and the prose are two records of one
 * fact with no link between them. A ratchet that empties is self-reporting;
 * the sentence describing it is not.
 *
 * WHAT THIS ASSERTS. For each finding held by a ratchet: the ratchet is empty
 * if and only if the finding carries a CLOSED status line. Both directions
 * matter — a stale CLOSED line over a ratchet that has regrown would be the
 * same defect pointing the other way, and that is the direction a future
 * regression takes.
 *
 * The heading keeps the count that was FOUND, deliberately. Rewriting
 * "Finding 2 — 19 examples" to "0 examples" would erase the finding rather
 * than close it; the status line carries the current state instead. Separating
 * what a document RECORDS from what still REPRODUCES is the whole point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/EXAMPLE-CORPUS-FINDINGS.md');

/** Findings whose current state is held by a named ratchet in a test file. */
const HELD_BY = [
    {finding: 'Finding 1', file: 'test/example-vm-execution.test.mjs', ratchet: 'KNOWN_MISSING_OPCODES'},
    {finding: 'Finding 2', file: 'test/example-execution.test.mjs', ratchet: 'KNOWN_BROKEN'},
    {finding: 'Finding 3', file: 'test/example-vm-execution.test.mjs', ratchet: 'KNOWN_INERT'},
];

/**
 * Is `const <name> = new Set([...])` (or Map) empty?
 *
 * Reads the balanced bracket region rather than a fixed window: a `slice(0, N)`
 * here would read into the NEXT declaration once a list grew, and report a
 * populated ratchet as empty — the WINDOWED-SEARCH shape scripts/audit-gate-shapes.mjs
 * exists to find. An ENTRY is a line whose first non-space character opens a
 * string or a tuple; everything else in these regions is a `//` comment.
 */
export function ratchetIsEmpty (source, name) {
    const decl = new RegExp(`const\\s+${name}\\s*=\\s*new\\s+(?:Set|Map)\\(\\[`);
    const m = decl.exec(source);
    if (!m) return null;                       // not found — the caller must fail, not skip
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < source.length; i++) {
        if (source[i] === '[') depth++;
        else if (source[i] === ']') { depth--; if (depth === 0) break; }
    }
    const body = source.slice(m.index + m[0].length, i);
    return !body.split('\n').some((l) => /^\s*['"[]/.test(l));
}

const doc = readFileSync(DOC, 'utf8');

/** The status line for a finding, or null. */
const statusOf = (finding) => {
    const at = doc.indexOf(`## ${finding} —`);
    if (at === -1) return null;
    const next = doc.indexOf('\n## ', at + 1);
    const section = doc.slice(at, next === -1 ? doc.length : next);
    const m = /\*\*STATUS [0-9]{4}-[0-9]{2}-[0-9]{2}: (CLOSED|OPEN)\.\*\*/.exec(section);
    return m ? m[1] : null;
};

test('every ratchet-held finding names its ratchet, and the two agree', () => {
    for (const {finding, file, ratchet} of HELD_BY) {
        const source = readFileSync(path.join(ROOT, file), 'utf8');
        const empty = ratchetIsEmpty(source, ratchet);
        assert.notEqual(empty, null,
            `${ratchet} not found in ${file} — it was renamed or removed, and this gate has been `
            + 'comparing the document against nothing');
        const status = statusOf(finding);
        assert.ok(status, `${finding} carries no "STATUS <date>: CLOSED|OPEN" line in ${path.basename(DOC)}`);
        assert.equal(status === 'CLOSED', empty,
            `${finding} says ${status} but ${ratchet} in ${file} is ${empty ? 'EMPTY' : 'POPULATED'}. `
            + 'A finding and the ratchet that holds it are two records of one fact; when they '
            + 'disagree, the document is telling a reader something the gate does not.');
        // The section must still name the ratchet, or a reader cannot check it.
        const at = doc.indexOf(`## ${finding} —`);
        const next = doc.indexOf('\n## ', at + 1);
        assert.ok(doc.slice(at, next === -1 ? doc.length : next).includes(ratchet),
            `${finding} does not name ${ratchet}, so its status cannot be checked by hand`);
    }
});

test('Finding 4 is closed because the metadata it complains about was fixed', () => {
    const idx = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/examples/index.json'), 'utf8'));
    const rows = Array.isArray(idx) ? idx : idx.examples || [];
    const named = ['eater6502-bench', 'eater6502-vdp-hello'];
    const full = rows.filter((e) => {
        const id = e.id || (e.files?.program || '').split('/')[0];
        return named.includes(id) && e.kind === 'full';
    }).map((e) => e.id);
    const status = statusOf('Finding 4');
    assert.ok(status, 'Finding 4 carries no STATUS line');
    assert.equal(status === 'CLOSED', full.length === 0,
        `Finding 4 says ${status} but ${full.length} of its examples are still declared kind "full"`);
});

test('the document still says it is a live measurement, which is what makes staleness a defect', () => {
    // If this sentence goes, the findings become an archive and these checks
    // are measuring the wrong thing — so the premise is asserted, not assumed.
    assert.match(doc, /snapshot of a live measurement/,
        'the document no longer claims to be current; re-read whether these gates still apply');
});
