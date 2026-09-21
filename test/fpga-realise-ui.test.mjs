// The UI wiring for board-graded challenges.
//
// The FPGA surface is behind a build-time flag that is off in every shipped
// build, so webpack never reads these files and nothing else would tell us the
// wiring broke. Following test/fpga-surface-flag.test.mjs, this reads the source
// and holds it to the contract: a realise challenge must be graded against the
// LIVE CIRCUIT, must not wipe the learner's canvas, and must be legible as a
// board challenge in the panel.
//
// Source-reading tests only prove the wiring is present, never that it runs —
// that is what test/fpga-grade-realised.test.mjs and
// test/fpga-realise-challenges.test.mjs do on the real solver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(resolve(here, '..', p), 'utf8');

const BUILDER = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx';
const PANEL = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-challenges.jsx';
const LIVE = 'overlay/scratch-gui/src/lib/bw-fpga/live-circuit.js';

test('Check routes a realise challenge at the LIVE circuit, not at the canvas model', () => {
    const ui = read(BUILDER);
    assert.match(ui, /import \{grade, gradeRealisedCircuit\}/, 'both graders are imported');
    assert.match(ui, /import \{withLiveCircuit\}/, 'and the way to reach the live board');
    assert.match(ui, /if \(isRealise\(c\)\) \{[\s\S]*?withLiveCircuit\(/,
        'a realise challenge goes to the live circuit');
    assert.match(ui, /gradeRealisedCircuit\(circuit, c\)/, 'and is graded by driving that circuit');
    // The canvas grader must still be what a normal challenge gets.
    assert.match(ui, /recordResult\(c\.id, grade\(reactFlowToModel\(nodes, edges\), c\)\)/,
        'a canvas challenge is still graded on the model');
});

test('selecting a realise challenge does NOT wipe the learner\'s canvas', () => {
    // Scaffolding io nodes would destroy their work and point them at the wrong
    // surface — the gate is built in the Circuit tab, not here.
    const ui = read(BUILDER);
    assert.match(ui, /if \(isRealise\(c\)\) return;[\s\S]*?idRef\.current \+= 1;/,
        'the realise early-return comes BEFORE the canvas is rebuilt');
    assert.match(ui, /setNodes\(\[\.\.\.ins, \.\.\.outs\]\)/, 'a canvas challenge still gets its scaffold');
});

test('a board pass banks progress exactly like a canvas pass', () => {
    const ui = read(BUILDER);
    assert.match(ui, /const recordResult = /, 'one place records a verdict');
    assert.match(ui, /saveProgress\(next\)/, 'and persists the unlock');
    assert.match(ui, /recordResult\(c\.id, gradeRealisedCircuit/, 'the board result goes through it too');
});

test('the panel renders a board result with the board message', () => {
    const panel = read(PANEL);
    assert.match(panel, /gradeMessageRealised/, 'a realised result gets the real-parts wording');
    assert.match(panel, /result\.realised \? gradeMessageRealised\(result, activeC\) : gradeMessage\(result, activeC\)/,
        'and a canvas result keeps the canvas wording');
});

test('the panel says a board challenge is graded on the board, and which builds fit', () => {
    const panel = read(PANEL);
    assert.match(panel, /data-testid="bw-fpga-rungs"/, 'the realisations are named');
    assert.match(panel, /RUNG_LABEL/, 'in the learner\'s words, per rung');
    assert.match(panel, /activeC\.rungs/, 'taken from the challenge, so XOR does not advertise ⚛');
    assert.match(panel, /Any build that computes it passes/, 'and it says topology is not graded');
    assert.match(panel, /isRealise\(c\) \?/, 'board challenges are marked in the LIST too, not only when open');
});

test('the Check button says what it will check, and cannot be double-fired', () => {
    const panel = read(PANEL);
    assert.match(panel, /'✓ Check my board'/, 'a board challenge checks the board');
    assert.match(panel, /'✓ Check my design'/, 'a canvas challenge still checks the design');
    // Reaching the circuit can mean mounting the designer — up to 8 s — so the
    // pending state has to be visible and the button inert meanwhile.
    assert.match(panel, /disabled=\{Boolean\(result && result\.pending\)\}/, 'no double-fire while checking');
    assert.match(panel, /Checking the board…/, 'the wait is visible');
    assert.match(panel, /result && !result\.pending \?/, 'a pending state is not rendered as a verdict');
});

test('the verdict is scrolled into view when it arrives', () => {
    // The panel is a fixed-height scroll box and the brief/Check/result sit below
    // the challenge list, so with a ladder this long the verdict lands under the
    // fold — measured in a real browser: the panel's visible area ended at y=560
    // and the result rendered at y=566, so pressing Check appeared to do nothing.
    const panel = read(PANEL);
    // Asserted as separate facts rather than one regex spanning the effect: a
    // lazy capture terminated by a literal `}` is shortened by the first nested
    // brace, so it could match some OTHER effect and keep passing
    // (scripts/audit-gate-shapes.mjs flags exactly that, and flagged this).
    assert.match(panel, /const scrollRef = React\.useRef\(null\);/, 'the scroll container is held by a ref');
    assert.match(panel, /el\.scrollTop = el\.scrollHeight;/, 'scrolled to its bottom');
    assert.match(panel, /\}, \[result\]\);/, 'whenever the verdict changes');
    assert.match(panel, /<div ref=\{scrollRef\} data-testid="bw-fpga-challenges"/,
        'the ref is on the scrolling panel itself');
    // Scrolling the CONTAINER, not scrollIntoView, so the page does not jump.
    // (Match a CALL — the comment in the source names the API it avoids.)
    assert.ok(!/\.scrollIntoView\(/.test(panel), 'the page itself must stay still');
});

test('live-circuit.js reaches the board the way the app already does', () => {
    const live = read(LIVE);
    assert.match(live, /window\.__circuit/, 'the handle the circuit designer publishes');
    assert.match(live, /dispatchEvent\(new CustomEvent\('bw-activate-tab'/,
        'showing the Circuit tab is what mounts the designer');
    assert.match(live, /typeof c\.addPart === 'function'/, 'a half-initialised handle does not count');
    assert.match(live, /onProblem/, 'and a timeout tells the learner what to do');
    // It must not silently hang forever if the designer never mounts.
    assert.match(live, /deadline/, 'the wait is bounded');
});

test('every import in the board-grading wiring resolves', () => {
    for (const rel of [BUILDER, PANEL, LIVE]) {
        const src = read(rel);
        const dir = resolve(here, '..', dirname(rel));
        const specs = [...src.matchAll(/^import\s+[^'"]*from\s+'([^']+)';/gm)].map(m => m[1]);
        for (const spec of specs) {
            if (!spec.startsWith('.')) continue;
            assert.ok(existsSync(resolve(dir, spec)), `${rel} imports missing ${spec}`);
        }
    }
});

test('the flag-hidden learning-path files are parse-checked', () => {
    // No build compiles them, so check-flagged-jsx.mjs is the only thing that
    // would catch a syntax error in them. It listed the tab alone.
    const script = read('scripts/check-flagged-jsx.mjs');
    assert.match(script, /fpga-gate-builder-rf\.jsx/, 'the builder is parse-checked');
    assert.match(script, /fpga-challenges\.jsx/, 'so is the challenge panel');
});
