/**
 * Check C — a number a lesson teaches must be one its bench produces.
 *
 * The whole-catalog run comes back with zero unmatched quantities, and a
 * zero has to be earned. Two things are asserted here so it can be believed:
 *
 *   1. COVERAGE. "0 unmatched" is meaningless without "out of N examined": a
 *      scanner whose extractor silently matched nothing would report exactly
 *      the same clean result. The extractor is tested against a sentence whose
 *      answer is known, and the corpus run is asserted to have examined a
 *      non-trivial number of quantities.
 *   2. MUTATION. Injecting a value no bench produces must make it red across
 *      the catalog.
 *
 * The coverage number is small on purpose and is worth knowing: only 13 of the
 * 79 lessons quote an electrical quantity in their English prose at all. This
 * check therefore protects a narrow seam well and says nothing about the other
 * 66 — which is a fact about how the curriculum is written, not a gap in the
 * check, and it is the reason Check B carries the weight.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {claimsIn, checkLesson} from '../scripts/lesson-numeric-contract.mjs';
import {loadCatalog} from '../scripts/detect-lesson-defects.mjs';

test('the extractor finds electrical quantities and ignores everything else', () => {
    const claims = claimsIn(
        'For 10 kΩ and 100 µF, τ is 1 s and 63.2% of 5 V is 3.16 V. ' +
        'A 10-bit ADC over 1023 counts gives 4.9 mV per count, and 470 ohm drops 2.3 V at 4.9 mA.');
    const found = claims.map(c => c.raw);
    // Every electrical quantity, including the one whose unit is a non-word
    // character: `Ω\b` needs the NEXT character to be a word character, so a
    // trailing \b silently dropped every "10 kΩ and ..." in the corpus.
    assert.deepEqual(found,
        ['10 kΩ', '100 µF', '1 s', '5 V', '3.16 V', '4.9 mV', '470 ohm', '2.3 V', '4.9 mA']);
    // and nothing dimensionless: 63.2%, 10-bit, 1023 counts are claims about
    // arithmetic and about a converter, not about any bench.
    assert.ok(!found.some(f => /%|bit|count/.test(f)));
    // Tolerance follows the precision of the quote, not a flat percentage.
    assert.equal(claims.find(c => c.raw === '4.9 mV').quantum, 0.5 * 1e-1 * 1e-3);
});

test('the whole catalog matches, and enough was examined for that to mean something', async () => {
    let examined = 0;
    let unmatched = 0;
    let quoting = 0;
    const skipped = {};
    for (const lesson of loadCatalog()) {
        const result = await checkLesson(lesson);
        if (result.skipped) { skipped[result.skipped] = (skipped[result.skipped] || 0) + 1; continue; }
        examined += result.examined.length;
        if (result.examined.length) quoting++;
        unmatched += result.unmatched.length;
        for (const finding of result.unmatched) {
            assert.fail(`${finding.lesson} quotes ${finding.quoted} in ${finding.where}, which ` +
                `${finding.example} does not produce; nearest measured: ` +
                `${(finding.nearest || []).map(v => Number(v).toPrecision(4)).join(', ')}`);
        }
    }
    assert.equal(unmatched, 0);
    assert.ok(examined >= 40, `only ${examined} quantities examined — the extractor has gone quiet`);
    assert.ok(quoting >= 10, `only ${quoting} lessons quote a quantity — the catalog or the extractor changed`);
    // Skips are counted and asserted, not ignored — but only the part that is
    // deterministic. Nine program-only lessons have no bench, and that is a
    // property of the catalog. How many machine benches outrun the 15 s
    // measurement budget is a property of the machine the test runs on, so it
    // is bounded rather than pinned: pinning it made this gate fail on a loaded
    // box, which is a flaky gate, which is a gate people learn to ignore.
    assert.equal(skipped['no-circuit'], 9, 'nine program-only lessons have no bench');
    assert.ok((skipped['measurement-truncated'] || 0) <= 4,
        `${skipped['measurement-truncated']} benches outran the budget — raise it or check the box`);
    assert.deepEqual(Object.keys(skipped).filter(k =>
        !['no-circuit', 'measurement-truncated'].includes(k)), [],
        'an unexpected skip reason appeared; a skip is not a pass');
});

test('MUTATION: a value the bench cannot produce is caught', async () => {
    const lesson = structuredClone(loadCatalog().find(l => l.id === 'electricity-ohms-law'));
    lesson.copy.en.objective += ' The supply here is 137 V.';
    const result = await checkLesson(lesson);
    assert.ok(result.unmatched.some(f => f.quoted === '137 V'),
        'the check did not notice a 137 V supply on a 5 V bench — it is not checking');
    // and the real numbers in the same lesson still match
    assert.equal(result.unmatched.length, 1);
});
