/**
 * A seated part must not contradict the name its pin was declared under.
 *
 * U1-4, measured 2026-09-07. The owner reported that 03-night-light seats a
 * potentiometer where the program declares an LDR. The cause is upstream, in
 * bw-circuit-ui's `model/infer-seated.js`: it chooses a part from the pin's
 * DIRECTION alone (analog -> potentiometer, input -> button, output -> LED)
 * and uses the declared name only as a label.
 *
 * WHY THIS GATE LIVES HERE AND THE FIX DOES NOT. Both things the fix would
 * touch are VENDORED into this repo and owned upstream:
 *   - `model/infer-seated.js` is in bw-circuit-ui's vendor manifest.
 *   - the per-example `circuit.<device>.json` benches are synced from sb3-creator.
 * `sync-bw-circuit-ui.mjs` refuses to sync when a vendored file carries local
 * edits, and says why: those patches belong upstream first. Editing either
 * here would either redden the vendor gates or set up the 930000d incident
 * again, where a later sync discarded weeks of lite-local work. So lite's
 * honest contribution is to MEASURE the vendored data and hold the number, so
 * a regression is loud and an upstream fix is visible the moment it lands.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {contradiction, declaredPartKind} from '../scripts/lib/declared-part-kind.mjs';

const EXAMPLES = 'overlay/scratch-gui/examples';
const kinds = new Set([...readFileSync(
    'overlay/scratch-gui/src/lib/bw-circuit-ui/model/footprints.js', 'utf8')
    .matchAll(/^ {2}([a-z_0-9]+)\s*:\s*\{/gm)].map(m => m[1]));

/**
 * KNOWN, UPSTREAM-OWNED, AND COUNTED. Every entry is a part whose picture
 * contradicts its pin's name in the vendored benches. The count is exact so a
 * new one cannot hide behind a category, and so an upstream fix REDDENS this
 * gate (fewer than recorded) rather than passing silently — a fix that nobody
 * notices is how a corpus quietly rots back.
 */
const RECORDED = {
    '03-night-light': {declName: 'ldr', kind: 'potentiometer', want: 'ldr', count: 10},
    '16-ldr-bargraph': {declName: 'ldr', kind: 'potentiometer', want: 'ldr', count: 10}
};

const scan = () => {
    const found = [];
    for (const ex of readdirSync(EXAMPLES)) {
        const dir = join(EXAMPLES, ex);
        if (!statSync(dir).isDirectory()) continue;
        for (const file of readdirSync(dir).filter(f => /^circuit(-flat)?\..*\.json$/.test(f))) {
            let bench;
            try {
                bench = JSON.parse(readFileSync(join(dir, file), 'utf8'));
            } catch {
                continue;
            }
            for (const part of bench.parts || []) {
                if (!part.declName) continue;
                const want = contradiction(part.declName, part.kind, kinds);
                if (want) found.push({ex, file, declName: part.declName, kind: part.kind, want});
            }
        }
    }
    return found;
};

test('the footprint library and the example corpus are both actually there', () => {
    assert.ok(kinds.size > 50, `parsed only ${kinds.size} footprint kinds`);
    assert.ok(kinds.has('ldr') && kinds.has('buzzer') && kinds.has('dc_motor'),
        'the kinds a declared name would assert are missing from the library');
    const benches = readdirSync(EXAMPLES).filter(ex => statSync(join(EXAMPLES, ex)).isDirectory())
        .flatMap(ex => readdirSync(join(EXAMPLES, ex))
            .filter(f => /^circuit(-flat)?\..*\.json$/.test(f)));
    assert.ok(benches.length > 500, `only ${benches.length} bench files — the scan would prove nothing`);
});

test('a declared name asserts a kind only when it really names one', () => {
    // DERIVED: the name IS a kind.
    assert.equal(declaredPartKind('ldr', kinds), 'ldr');
    assert.equal(declaredPartKind('buzzer', kinds), 'buzzer');
    // SYNONYM: a word learners write for a kind.
    assert.equal(declaredPartKind('speaker', kinds), 'buzzer');
    assert.equal(declaredPartKind('lightsense', kinds), 'ldr');
    // ASSERTS NOTHING: the generator's default must stand.
    assert.equal(declaredPartKind('led1', kinds), 'led');
    assert.equal(declaredPartKind('btn', kinds), null);
    assert.equal(declaredPartKind('sensor', kinds), null,
        'a bare "sensor" names no part — guessing one would invent a circuit');
    assert.equal(declaredPartKind('heater', kinds), null,
        'there is no heater footprint; the default stands and is said so');
});

test('agreement is never a contradiction', () => {
    // The first measurement of this defect called TWELVE parts wrong because it
    // applied the synonym table before checking whether the part already WAS
    // what the name said. `piezo` on a piezo is agreement, not a defect.
    assert.equal(contradiction('piezo', 'piezo', kinds), null);
    assert.equal(contradiction('ldr', 'ldr', kinds), null);
    assert.equal(contradiction('led1', 'led', kinds), null);
    // And the real one still reports.
    assert.equal(contradiction('ldr', 'potentiometer', kinds), 'ldr');
});

test('no seated part contradicts its declared name, beyond what is recorded', () => {
    const found = scan();
    const byExample = {};
    for (const row of found) (byExample[row.ex] ||= []).push(row);

    const unexpected = found.filter(row => {
        const known = RECORDED[row.ex];
        return !known || known.declName !== row.declName || known.kind !== row.kind;
    });
    assert.deepEqual(unexpected, [],
        `a seated part contradicts its pin's declared name:\n${
            unexpected.map(r => `  ${r.ex}/${r.file}: ${r.declName} drawn as ${r.kind}, name says ${r.want}`)
                .join('\n')}`);

    for (const [ex, known] of Object.entries(RECORDED)) {
        const n = (byExample[ex] || []).length;
        assert.equal(n, known.count,
            `${ex}: recorded ${known.count} ${known.declName}-as-${known.kind} part(s), found ${n}. ` +
            'If upstream fixed this, LOWER the count here and say so; if it spread, that is a regression.');
    }
    assert.equal(found.length, Object.values(RECORDED).reduce((sum, r) => sum + r.count, 0));
});

test('MUTATION: the scan reports a contradiction it is not told to expect', () => {
    // Prove the gate can fail for its own reason. A bench that draws a buzzer as
    // an LED is exactly what the direction-only rule produces for
    // `PIN buzzer = P1.0 OUTPUT`, and nothing in RECORDED covers it.
    const injected = {declName: 'buzzer', kind: 'led'};
    const want = contradiction(injected.declName, injected.kind, kinds);
    assert.equal(want, 'buzzer', 'the rule failed to notice a buzzer drawn as an LED');

    const known = RECORDED['some-example'];
    assert.equal(known, undefined);
    assert.throws(() => {
        const unexpected = [{ex: 'some-example', file: 'circuit.uno.json', ...injected, want}]
            .filter(row => !RECORDED[row.ex]);
        assert.deepEqual(unexpected, []);
    }, /buzzer|deepEqual|Expected/, 'an unrecorded contradiction did not fail the assertion');
});
