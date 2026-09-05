/**
 * docs/generated/hosted-targets.json is the pinned snapshot of stc-compiler's
 * COMPILE/ASSEMBLE target lists that test/bw-matrix-conformance.test.mjs checks
 * the matrix's hosted facts against. It is derived by
 * scripts/gen-hosted-targets.mjs from a stc-compiler checkout; a stale snapshot
 * is a red build. Plan task T2.
 *
 * Freshness is checked WHEN IT CAN BE: when a stc-compiler checkout is present
 * (STC_COMPILER_DIR, or the box's usual path) the snapshot is regenerated from
 * it and compared; when it is not — as in CI — the test says so rather than
 * quietly passing, and the structural checks below still run.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

import {build, checkAgainst, output} from '../scripts/gen-hosted-targets.mjs';

const STC = process.env.STC_COMPILER_DIR || '/mnt/volume1/code/stc-compiler';
const havePython = () => { try { execFileSync('python3', ['--version'], {stdio: 'ignore'}); return true; } catch { return false; } };

test('the snapshot carries the structure the conformance gate reads', () => {
    const doc = JSON.parse(readFileSync(output, 'utf8'));
    assert.ok(doc.compile && Object.keys(doc.compile).length, 'compile block present');
    assert.ok(doc.assemble && Object.keys(doc.assemble).length, 'assemble block present');
    assert.match(doc.source.sha, /^[0-9a-f]{40}$/, 'source records the 40-char stc-compiler sha');
    assert.ok(doc.absent && doc.absent.compile, 'the hand-maintained absent notes are present');
    // Every hosted target is a plain lowercase id — the form the Code tab sends.
    for (const id of [...Object.values(doc.compile).flat(), ...Object.values(doc.assemble).flat()]) {
        assert.match(id, /^[a-z0-9]+$/, `hosted target id "${id}" is not a plain id`);
    }
});

test('the snapshot is current against the stc-compiler checkout, when one is present', (t) => {
    if (!existsSync(join(STC, 'app.py'))) {
        t.diagnostic(`no stc-compiler checkout at ${STC} — freshness NOT verified (set STC_COMPILER_DIR to check)`);
        return;
    }
    // Regenerate from the checkout and compare. If the owner has deployed a new
    // compile/assemble target since the snapshot, this fails BY the stale file,
    // and the conformance gate then names the matrix cell that is now wrong.
    assert.doesNotThrow(() => checkAgainst(STC),
        'hosted-targets.json is stale against the stc-compiler checkout — run scripts/gen-hosted-targets.mjs --dir <checkout>');
});

test('the generator refuses BY NAME when a target dict is gone, rather than guessing', (t) => {
    if (!havePython()) { t.diagnostic('no python3 — the dict parse (and this refusal) cannot be exercised'); return; }
    // A fake app.py missing EATER_TARGETS: the derivation must refuse, naming it.
    const dir = mkdtempSync(join(tmpdir(), 'stc-fake-'));
    writeFileSync(join(dir, 'app.py'),
        'TARGETS = {"stc12c5a60s2": {}}\nAVR_TARGETS = {"atmega328p": {}}\n'
        + 'ARM_TARGETS = {"rp2040": {}}\nASSEMBLE_TARGETS = {"z80": "z80"}\n');
    assert.throws(() => build(dir, '2026-09-05'), /EATER_TARGETS/,
        'a missing target dict was not refused by name');
});
