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
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

// Measured 2026-09-02. LOWER these as suspects are triaged; never raise one to make a push
// green. A new suspect is a new place a gate can stop biting without saying so.
const BASELINE = {
    // 11 -> 0 on 2026-09-02. Three were generators (gen-/make-/sync-), which the rule no longer
    // asks: a generator invoking the developer's cargo is intended behaviour. The rest were
    // triaged at their sites and every one FAILS CLOSED on absence. What that does NOT settle is
    // version identity — a different sdcc or simavr is still a different verdict — and nothing
    // here pins one. See docs/GATES-THAT-CANNOT-FAIL.md.
    // 0 -> 3 on 2026-09-04. All three are `git` from PATH in
    // test/vendor-source-guard.test.mjs, triaged in a comment at that site: the
    // subject under test IS git's ancestry answer, a stub would assert the
    // test's opinion of git instead of git's behaviour, and absence FAILS
    // CLOSED (execFileSync throws ENOENT, rig() does not catch, every test in
    // the file goes red). Verified, not assumed. Unpinned: git's version.
    'AMBIENT-BINDING': 3,
    // 12 -> 0 on 2026-09-02. The rule now ignores an appearance that is immediately followed by
    // a click/fill/count/evaluate — synchronisation before the real assertion, and the correct
    // way to write a browser gate. The five that survived that narrowing were each triaged at
    // their site: in every one, absence FAILS. What none of them assert is DISAPPEARANCE, which
    // is a different property; where a contract includes it (a dialog that must close) it still
    // needs writing.
    'EVENT-AS-STATE': 0,
    // Added 2026-09-02, from triaging EVENT-AS-STATE: an awaited precondition inside a try whose
    // catch is empty or comment-only. Four instances, all bounded by a downstream hard assertion
    // and marked with the assertion that bounds them.
    'SWALLOWED-PRECONDITION': 0,
    // 1 -> 0 on 2026-09-02: the single hit was triaged and kept, marked at the site. The
    // widening is real but bounded to one dot-prefixed spelling whose receiver is a per-game
    // variable name; a SECOND entry of that form is what should be refused.
    'SEGMENT-MATCH': 0,
    // 8 -> 0 on 2026-09-02. Seven were converted to bracket-matched regions via
    // test/helpers/js-scope.mjs (balancedAfter / balancedFrom); the eighth is this suite's own
    // demonstration of the shape and is marked at the site.
    'TRUNCATED-CAPTURE': 0,
    // 37 -> 0 on 2026-09-02: three real conversions to brace-matched scopes, and 34 that were
    // never defects. The rule asked whether an assertion sat within 200 characters of the slice;
    // it now asks whether the slice's RESULT reaches a predicate. Truncating a failure MESSAGE
    // is good practice and made up the bulk of the old count.
    'WINDOWED-SEARCH': 0
};

// The detector must still bite. Each fixture is a shape the rules exist to catch, or a sound
// idiom they must leave alone; without these, tightening a rule to silence false positives is
// indistinguishable from deleting it.
const scan = source => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gate-shapes-'));
    // Named for the convention the AMBIENT-BINDING rule keys on, so all six rules are reachable
    // from a fixture. With every class at zero, these tests are the only thing standing between
    // this detector and a dead one.
    writeFileSync(path.join(dir, 'verify-fixture.mjs'), source);
    const raw = execFileSync(process.execPath,
        [path.join(root, 'scripts/audit-gate-shapes.mjs'), '--json', '--root', dir],
        {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    rmSync(dir, {recursive: true, force: true});
    return JSON.parse(raw).findings.map(f => f.kind);
};

test('a window whose result reaches a predicate is still caught', () => {
    assert.deepEqual(scan("assert.match(body.slice(0, 600), /guard/);"), ['WINDOWED-SEARCH']);  // gate-shapes-allow: the fixture IS the shape
    assert.deepEqual(scan("if (/guard/.test(body.slice(0, 600))) ok();"), ['WINDOWED-SEARCH']);  // gate-shapes-allow: the fixture IS the shape
    assert.deepEqual(scan("const hit = body.slice(0, 600).includes('guard');"), ['WINDOWED-SEARCH']);  // gate-shapes-allow: the fixture IS the shape
});

test('a window that only shortens a failure message is not a suspect', () => {
    // The 34 that were never defects. `check(label, predicate, evidence)`: the third argument
    // is prose for a human, and truncating it is the right thing to do.
    assert.deepEqual(scan("check('the engines are offered', labels.length > 1, labels.join(' | ').slice(0, 160));"), []);
    assert.deepEqual(scan("assert.ok(vars.includes('count'), `missing: ${JSON.stringify(vars.slice(0, 80))}`);"), []);
});

test('truncating a diff against an empty expectation cannot change a verdict', () => {
    assert.deepEqual(scan("assert.deepEqual(degraded.slice(0, 10), [], 'none may degrade');"), []);
});

test('selecting a row of a structure is a domain, not a window', () => {
    assert.deepEqual(scan("assert.ok([...level.cells.slice(0, 32)].every(c => c === 0), 'the sky is empty');"), []);
});

test('a deliberate demonstration may be marked, and the marker must be honoured', () => {
    const demo = "assert.match(src.slice(0, 200), /call/); // gate-shapes-allow\n";
    assert.deepEqual(scan(demo), []);
    assert.deepEqual(scan(demo.replace(' // gate-shapes-allow', '')), ['WINDOWED-SEARCH'],
        'removing the marker must bring the finding back, or the marker is a blanket silence');
});

test('a discarded precondition failure is caught', () => {
    // gate-shapes-allow: the fixture IS the shape (ninth time this detector has found itself)
    const swallowed = "try { await el.waitFor({state: 'visible'}); await el.fill('x'); } catch { }";
    assert.deepEqual(scan(swallowed), ['SWALLOWED-PRECONDITION']);
    assert.deepEqual(scan(swallowed.replace('catch { }', 'catch { skipped = true; }')), [],
        'a handler that RECORDS the failure is doing its job');
    assert.deepEqual(scan(swallowed.replace('catch { }', 'catch (e) { throw e; }')), []);
});

test('an appearance used to synchronise is not an appearance assertion', () => {
    // The correct way to write a browser gate, and 7 of the original 12 hits.
    // gate-shapes-allow
    assert.deepEqual(scan("await panel.waitFor({state: 'visible'});\nawait panel.click();"), []);
    assert.deepEqual(scan("await panel.waitFor({state: 'visible'});\nconst n = await panel.count();"), []);
    // Standing alone, with nothing in the file proving the thing ever leaves, it is a suspect.
    // gate-shapes-allow
    assert.deepEqual(scan("await panel.waitFor({state: 'visible'});\nreport('done');"), ['EVENT-AS-STATE']);
});

test('every rule still fires — all six, from one fixture', () => {
    const kinds = new Set(scan([
        "assert.match(body.slice(0, 600), /guard/);",          // gate-shapes-allow
        // gate-shapes-allow
        "const seg = name.split('::').pop();\nif (allow.has(seg)) ok();",
        // gate-shapes-allow
        "const cap = src.match(/LIST = \\[([\\s\\S]*?)\\]/);",
        // gate-shapes-allow
        // gate-shapes-allow
        "execFileSync('sdcc', ['--version']);",
        // gate-shapes-allow
        "try { await el.waitFor({state: 'visible'}); } catch { }",
        // gate-shapes-allow
        "await panel.waitFor({state: 'visible'});\nreport('done');"
    ].join('\n')));
    assert.deepEqual([...kinds].sort(), ['AMBIENT-BINDING', 'EVENT-AS-STATE', 'SEGMENT-MATCH',
        'SWALLOWED-PRECONDITION', 'TRUNCATED-CAPTURE', 'WINDOWED-SEARCH'],
        'a rule that fires on nothing is indistinguishable from a rule that is correct, and ' +
        'every baseline in this file is now zero');
});

test('AMBIENT-BINDING fires on a path that is READ, not on one merely mentioned', () => {
    // The narrowing of 2026-09-05 must not have deleted the rule. Both halves
    // proved from one fixture, because a rule that stopped firing and a rule
    // that stopped false-firing look identical from the count alone.
    // gate-shapes-allow
    const read = "const src = readFileSync('../../../bw-board/src/i8086.js', 'utf8');";
    assert.deepEqual(scan(read), ['AMBIENT-BINDING'],
        'a sibling checkout that is actually READ is the hazard this rule exists for');

    // gate-shapes-allow
    const needle = "assert.ok(!before.includes('../../lib/bw-board/m6502-extract.js'));";
    assert.deepEqual(scan(needle), [],
        'a module specifier used as a SEARCH NEEDLE reaches nothing -- this fired 9 times ' +
        'on a correct test and left main red');

    // An ABSOLUTE machine path stays flagged however it is used: it is
    // machine-specific whether or not this particular line opens it.
    // gate-shapes-allow
    assert.deepEqual(scan("const p = '/mnt/volume1/code/bw-board/src/i8086.js';"), ['AMBIENT-BINDING']);
});

test('no new gate-shape suspects', () => {
    const raw = execFileSync(process.execPath,
        [path.join(root, 'scripts/audit-gate-shapes.mjs'), '--json'],
        {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    const {counts, roots, scanned} = JSON.parse(raw);

    // ASSERT THE SCOPE, not just the count. A baseline of 3 is a statement
    // about the set that was walked, and until 2026-09-05 nothing checked
    // which set that was -- so narrowing the scan to one directory, or
    // breaking the directory walk outright, would have made this test GREENER
    // rather than red. The number and the set it counted over have to be
    // asserted together or the number means nothing.
    //
    // The scope is deliberately test/ + scripts/ and NOT the whole repo:
    // measured, --root . adds 15 SEGMENT-MATCH hits in overlay/ and packages/,
    // and reading them showed every one is `split('.').pop()` taking a file
    // extension or a deliberate basename compare. `.pop()` on a split is a
    // truncated membership test in a GATE and an ordinary extraction in
    // source. Widening the scan would add fifteen false positives and teach
    // everyone to ignore the tool.
    assert.deepEqual(roots, ['test', 'scripts'],
        'the audit scope changed. The baselines below are counts over test/ + scripts/; ' +
        'a different scope makes them meaningless rather than merely wrong.');
    assert.ok(scanned > 300,
        `the audit walked only ${scanned} files. It walked 379 on 2026-09-05, and a ` +
        'collapsed walk yields few findings, which reads as a clean repo.');
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
