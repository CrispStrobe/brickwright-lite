// "⚙ Make this a circuit" — the affordance, and the two ends of the handoff.
//
// The lowering itself is proven by truth table in fpga-pseudocode-expr.test.mjs.
// What is checked here is the part that decides whether a learner ever sees it,
// and the part that carries the model to the other tab:
//
//   - lowerableLines() finds the lines that ARE circuits and no others, because
//     an affordance offered on a line it cannot lower is a refusal with extra
//     steps — and the measured answer is that 0 of 282 shipped programs qualify.
//   - the Code tab gates on the BUILD FLAG and the per-user opt-in. The Code tab
//     is not flagged; without that gate a flag-off build would offer a handoff
//     to a tab that does not exist.
//   - the event names at the two ends AGREE. They are strings in two files, and
//     nothing else would notice them drifting apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {lowerableLines, conditionOf, oneBitInputsOf} from '../overlay/scratch-gui/src/lib/bw-fpga/pseudocode-expr.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const IMPORTER = 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx';
const FPGA_TAB = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx';

const PROGRAM = `DEVICE STC12C5A60S2
PIN a = P1.0 INPUT
PIN b = P1.1 INPUT
PIN ldr = P1.3 ANALOG
PIN y = P1.2 OUTPUT

WHEN flag clicked:
  IF a AND b THEN:
    turn on y
  IF ldr < 200 THEN:
    turn off y
  set q to a OR NOT b
`;

test('lowerableLines finds the lines that ARE circuits, and no others', () => {
    const found = lowerableLines(PROGRAM);
    assert.deepEqual(found.map(f => f.expr), ['a AND b', 'a OR NOT b'],
        'the analog comparison must not be offered, and both boolean lines must be');
    assert.deepEqual(found.map(f => f.lineNo), [8, 12], 'line numbers are 1-based and point at the source line');
});

test('the model handed over computes the line it came from', () => {
    // The affordance is a lie if the circuit is not the expression.
    const [andLine, orLine] = lowerableLines(PROGRAM);
    const t = (model, a, b, out) => (evalModel(model, {a, b}).outputs[out] ? 1 : 0);
    assert.deepEqual([t(andLine.model, 0, 0, 'y'), t(andLine.model, 0, 1, 'y'),
        t(andLine.model, 1, 0, 'y'), t(andLine.model, 1, 1, 'y')], [0, 0, 0, 1]);
    // `set q to …` names its output after the variable, so the circuit reads as the line does.
    assert.deepEqual([t(orLine.model, 0, 0, 'q'), t(orLine.model, 0, 1, 'q'),
        t(orLine.model, 1, 0, 'q'), t(orLine.model, 1, 1, 'q')], [1, 0, 1, 1]);
});

test('a program with no lowerable line offers nothing at all', () => {
    // Every shipped example is this case — measured, 0 of 282.
    assert.deepEqual(lowerableLines(`DEVICE X
PIN led = P1.0 OUTPUT
WHEN flag clicked:
  FOREVER:
    turn on led
    wait 0.5 seconds
`), []);
    assert.deepEqual(lowerableLines('IF hit >= 0 AND key < 0 THEN:'), []);
});

test('only INPUT pins are 1-bit inputs', () => {
    assert.deepEqual(oneBitInputsOf(PROGRAM), ['a', 'b']);
    assert.equal(conditionOf('  IF a AND b THEN:'), 'a AND b');
    assert.equal(conditionOf('  set q to a OR b'), 'a OR b');
    assert.equal(conditionOf('  turn on y'), null);
});

test('the Code tab gates the offer on the build flag AND the user opt-in', () => {
    const src = read(IMPORTER);
    const body = src.slice(src.indexOf('renderCircuitOffer ()'), src.indexOf('handoffCircuit ('));
    assert.ok(body.length > 100, 'renderCircuitOffer was not found — the rest of this test means nothing');
    assert.match(body, /process\.env\.BW_ENABLE_FPGA/,
        'without the build flag a flag-off build would offer a handoff to a tab that is not there');
    assert.match(body, /getFpgaEnabled\(\)/, 'the per-user opt-in gates the FPGA surface and must gate its handoff too');
    assert.match(body, /lowerableLines\(/, 'the offer must be decided by the same code that does the lowering');
});

test('BOTH ENDS OF THE HANDOFF NAME THE SAME EVENT', () => {
    // Two strings in two files. Nothing else would notice them drifting.
    const importer = read(IMPORTER);
    const tab = read(FPGA_TAB);
    assert.match(importer, /dispatchEvent\(new CustomEvent\('bw-fpga-seed-model'/);
    assert.match(tab, /addEventListener\('bw-fpga-seed-model'/);
    assert.match(tab, /removeEventListener\('bw-fpga-seed-model'/, 'the listener must be torn down');
    assert.match(importer, /'bw-activate-tab'/, 'handing a model over is useless without going to the tab');
});

test('the offer is translated, both locales, no bare strings', () => {
    const src = read(IMPORTER);
    for (const key of ['makeCircuit', 'makeCircuitTitle', 'makeCircuitWhy']) {
        const hits = [...src.matchAll(new RegExp(`^\\s+${key}:`, 'gm'))].length;
        assert.equal(hits, 2, `${key} must exist in exactly the en and de tables, found ${hits}`);
    }
    const body = src.slice(src.indexOf('renderCircuitOffer ()'), src.indexOf('handoffCircuit ('));
    assert.match(body, /L\.makeCircuit\b/, 'the label comes from the table');
    assert.match(body, /L\.makeCircuitWhy/, 'so does the explanation');
});

test('the seeded model is validated before it is trusted', () => {
    // The listener takes a model off a window event; anything on the page can
    // fire one. A shape check is cheap and the alternative is a render crash.
    const tab = read(FPGA_TAB);
    const block = tab.slice(tab.indexOf("const onSeed"), tab.indexOf("addEventListener('bw-fpga-seed-model'"));
    assert.match(block, /Array\.isArray\(model\.nodes\)/, 'a seed without nodes must not reach setSeed');
});
