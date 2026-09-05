/**
 * scripts/check-hosted-live.mjs compares the committed hosted-targets.json
 * against the LIVE stc-compiler /health target lists and REPORTS drift without
 * failing. This drives the pure comparison with a FIXTURE /health body — never
 * the live service — so it is deterministic and offline, and mutation-proves
 * that a fabricated live target is reported. Plan T2, the live half.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {compare, renderSummary} from '../scripts/check-hosted-live.mjs';

const snapshot = JSON.parse(readFileSync(
    path.join(import.meta.dirname, '../docs/generated/hosted-targets.json'), 'utf8'));

// A /health body that AGREES with the snapshot on every list /health reports.
const asDict = names => Object.fromEntries(names.map(n => [n, `${n} — description`]));
const agreeingHealth = () => ({
    ok: true,
    version: 'abc1234',
    targets: asDict(snapshot.compile['8051']),
    avr_targets: asDict(snapshot.compile.avr),
    arm_targets: asDict(snapshot.compile.arm),
    assemble_targets: Object.values(snapshot.assemble).flat()
});

test('an agreeing /health produces no drift rows (and 6502 is noted un-compared)', () => {
    const rows = compare(snapshot, agreeingHealth());
    const drift = rows.filter(r => !r.note && (r.onlySnapshot.length || r.onlyLive.length));
    assert.deepEqual(drift, [], `unexpected drift: ${JSON.stringify(drift)}`);
    assert.ok(rows.some(r => r.family === '6502' && r.note), 'the un-reported 6502 compile family must be noted, not treated as empty');
});

test('a target only LIVE (a new deploy) is reported as such', () => {
    const health = agreeingHealth();
    health.targets = {...health.targets, stc_new_chip: 'a chip the snapshot lacks'};
    const rows = compare(snapshot, health);
    const row = rows.find(r => r.scope === 'compile' && r.family === '8051');
    assert.ok(row.onlyLive.includes('stc_new_chip'), 'a fabricated live target was not reported as only-live');
    assert.match(renderSummary({url: 'x', snapshotSha: 'deadbeef', liveVersion: 'abc', rows}), /stc_new_chip/,
        'the summary does not name the new live target');
});

test('a target only in the snapshot (deploy behind, or bundle absent) is reported', () => {
    const health = agreeingHealth();
    health.avr_targets = {};                       // an avr-less deployment reports an empty list
    const rows = compare(snapshot, health);
    const row = rows.find(r => r.scope === 'compile' && r.family === 'avr');
    assert.deepEqual(row.onlyLive, [], 'nothing should be only-live here');
    assert.ok(row.onlySnapshot.length && row.onlySnapshot.every(t => snapshot.compile.avr.includes(t)),
        'the avr targets present in the snapshot but absent live were not reported');
});

test('a network failure is reported as "could not compare", never as agreement', () => {
    const md = renderSummary({error: 'timed out after 15000 ms'});
    assert.match(md, /Could not compare/i);
    assert.match(md, /neither agreement nor disagreement/i);
    assert.ok(!/matches the snapshot/.test(md), 'a failed fetch must not read as agreement');
});
