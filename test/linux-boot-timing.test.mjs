import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareLinuxBootTimings} from '../scripts/lib/linux-boot-timing.mjs';

const sample = (fetch, boot) => ({fetchedSeconds: fetch, promptSeconds: fetch + boot});
const oracle = compare => {
    // Reproduce the rounded hosted red: transport, not boot, reversed the gate.
    const result = compare(sample(1.3, 0.2), sample(0.3, 2.5));
    assert.equal(result.basis, 'media-ready-to-prompt');
    assert.equal(result.thresholdRatio, 0.5);
    assert.ok(Math.abs(result.snapshotSeconds - 0.2) < 1e-12);
    assert.ok(Math.abs(result.coldSeconds - 2.5) < 1e-12);
    assert.equal(result.passes, true);
    // Fast snapshot transport cannot hide a slow actual snapshot boot.
    assert.equal(compare(sample(0, 1.1), sample(20, 2)).passes, false);
    assert.equal(compare(sample(0, 1), sample(0, 2)).passes, false);
    assert.equal(compare(sample(0, 0.999), sample(0, 2)).passes, true);
    for (const invalid of [null, {}, sample(-1, 2), sample(1, 0), sample(1, -0.1),
        sample(NaN, 1), sample(Infinity, 1)]) {
        assert.throws(() => compare(invalid, sample(0, 2)), /snapshot: invalid/);
        assert.throws(() => compare(sample(0, 1), invalid), /cold: invalid/);
    }
};

test('Linux boot comparison uses equal media-ready boundaries and strict half-time', () => {
    oracle(compareLinuxBootTimings);
});

test('the browser gate invokes the comparison and retains both raw timing receipts', () => {
    const source = readFileSync(new URL('../scripts/verify-cpm-system.mjs', import.meta.url), 'utf8');
    assert.match(source, /timing\.comparison = compareLinuxBootTimings\(timing\.snapshot, timing\.cold\)/);
    assert.match(source, /check\(passes,/);
    for (const name of ['snapshot', 'cold']) {
        assert.match(source, new RegExp(`timing\\.${name} = \\{fetchedSeconds: \\w+\\.fetched, promptSeconds: \\w+\\.prompt\\}`));
    }
    assert.match(source, /'timing\.json'\), JSON\.stringify\(timing/);
});

test('three isolated timing mutants fail executable boundary oracles', async t => {
    const source = readFileSync(new URL('../scripts/lib/linux-boot-timing.mjs', import.meta.url), 'utf8');
    for (const [name, anchor, replacement] of [
        ['transport masquerades as boot', 'return promptSeconds - fetchedSeconds;', 'return promptSeconds;'],
        ['half-time boundary becomes inclusive', 'snapshotSeconds < coldSeconds / 2', 'snapshotSeconds <= coldSeconds / 2'],
        ['invalid phase timings accepted', 'throw new Error(`${name}: invalid media-ready-to-prompt timing`);', '/* invalid timing silently accepted */']
    ]) {
        await t.test(name, async () => {
            assert.equal(source.split(anchor).length - 1, 1, 'mutation anchor is unique');
            const mutant = await import(`data:text/javascript;base64,${Buffer.from(source.replace(anchor, replacement)).toString('base64')}`);
            assert.throws(() => oracle(mutant.compareLinuxBootTimings), assert.AssertionError);
        });
    }
});
