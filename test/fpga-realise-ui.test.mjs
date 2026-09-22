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
import {STRINGS} from '../overlay/scratch-gui/src/lib/bw-fpga/l10n.js';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(resolve(here, '..', p), 'utf8');

const BUILDER = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx';
const PANEL = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-challenges.jsx';
const LIVE = 'overlay/scratch-gui/src/lib/bw-fpga/live-circuit.js';

test('Check routes a realise challenge at the LIVE circuit, not at the canvas model', () => {
    const ui = read(BUILDER);
    assert.match(ui, /import \{grade, gradeRealisedAsync\}/,
        'the canvas grader and the non-freezing board grader');
    assert.match(ui, /import \{withLiveCircuit\}/, 'and the way to reach the live board');
    assert.match(ui, /if \(isRealise\(c\)\) \{[\s\S]*?withLiveCircuit\(/,
        'a realise challenge goes to the live circuit');
    assert.match(ui, /gradeRealisedAsync\(circuit, c, \{/, 'and is graded by driving that circuit');
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
    assert.match(ui, /\.then\(result => recordResult\(c\.id, result\)\)/,
        'the board result goes through it too, once the async grade resolves');
    assert.match(ui, /\.catch\(/, 'and a grade that throws does not leave it spinning forever');
});

test('the panel renders a board result with the board message', () => {
    const panel = read(PANEL);
    assert.match(panel, /gradeMessageRealised/, 'a realised result gets the real-parts wording');
    assert.match(panel, /gradeMessageRealised\(result, activeC, locale\)/, 'in the reader\'s language');
    assert.match(panel, /gradeMessage\(result, activeC, locale\)/, 'and a canvas result keeps the canvas wording');
});

test('the panel says a board challenge is graded on the board, and which builds fit', () => {
    const panel = read(PANEL);
    assert.match(panel, /data-testid="bw-fpga-rungs"/, 'the realisations are named');
    assert.match(panel, /rungLabel\(r, locale\)/, 'in the learner\'s words and language, per rung');
    assert.match(panel, /activeC\.rungs/, 'taken from the challenge, so XOR does not advertise ⚛');
    assert.match(panel, /panel\.orWireItYourself/, 'and it says topology is not graded');
    assert.match(STRINGS.en['panel.orWireItYourself'], /Any build that computes it passes/);
    assert.match(panel, /isRealise\(c\) \?/, 'board challenges are marked in the LIST too, not only when open');
});

test('the Check button says what it will check, and cannot be double-fired', () => {
    const panel = read(PANEL);
    assert.match(panel, /'panel\.checkBoard' : 'panel\.checkDesign'/, 'the button names what it checks');
    assert.match(STRINGS.en['panel.checkBoard'], /Check my board/);
    assert.match(STRINGS.en['panel.checkDesign'], /Check my design/);
    // Reaching the circuit can mean mounting the designer — up to 8 s — so the
    // pending state has to be visible and the button inert meanwhile.
    assert.match(panel, /disabled=\{Boolean\(result && result\.pending\)\}/, 'no double-fire while checking');
    assert.match(panel, /'panel\.checking'/, 'the wait is visible');
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

test('a multi-output challenge names its LEDs, and the tab can build one', () => {
    const panel = read(PANEL);
    assert.match(panel, /activeC\.outputs\.length > 1 \?/, 'a multi-output challenge is treated differently');
    assert.match(panel, /'panel\.readsLeds'/, 'it says how many LEDs get read');
    assert.match(STRINGS.en['panel.readsLeds'], /Reads \{n\} LEDs/);
    assert.match(STRINGS.en['panel.readsLeds'], /Name them, or stack them in that order/,
        'which LED is which is the thing a learner can get backwards');
    // The challenge is unmeetable without a way to build it. With more than one
    // multi-chip circuit, that is a picker listed FROM the registry, so a new
    // spec appears in the UI without anybody editing the tab.
    const tab = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /data-testid="bw-fpga-ic-circuit"/, 'a circuit picker');
    assert.match(tab, /Object\.entries\(IC_CIRCUITS\)\.map/, 'listed from the registry, not hardcoded');
    assert.match(tab, /data-testid="bw-fpga-build-circuit"/, 'and a build button');
    assert.match(tab, /realizeIcCircuit\(icCircuit\)/, 'wired to the multi-gate builder');
    assert.match(tab, /import \{buildLogicIcCircuit, IC_CIRCUITS[^}]*\}/, 'from the shared spec registry');
    // The panel names the circuit from the same registry rather than hardcoding one.
    assert.match(panel, /IC_CIRCUITS\[activeC\.circuit\]/, 'the panel reads the label from the registry');
    assert.ok(!/⚙ Half adder/.test(panel), 'no hardcoded circuit name left in the panel');
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

test('no component reads `props.x` where props is not in scope', () => {
    // The failure this exists for: InnerBuilder is declared as
    //   const InnerBuilder = ({onUseVerilog, seed, locale}) => {
    // so `props` does not exist inside it. Twelve `props.locale` reads were
    // added there during the i18n work and every one was a ReferenceError at
    // RENDER time — which unmounts the React tree, so the whole GUI came up
    // with no tabs at all.
    //
    // Nothing else catches it: the file parses, every import resolves, and the
    // flag-off build never compiles it. check-flagged-jsx.mjs says so in as
    // many words ("AND IT DOES NOT CATCH UNDEFINED REFERENCES").
    const files = [BUILDER, PANEL, 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx'];
    const offenders = [];
    for (const rel of files) {
        const lines = read(rel).split('\n');
        // Track the innermost arrow/function component and whether it named its
        // parameter `props` (rather than destructuring it).
        let scopeName = null;
        let scopeHasProps = false;
        let depth = 0;
        lines.forEach((line, i) => {
            const decl = /^(?:export\s+)?(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?:=\s*)?\(?\s*(\{|props|[a-z])?/.exec(line);
            if (decl && /=>|function/.test(line)) {
                scopeName = decl[1];
                scopeHasProps = /\(\s*props\s*[),]/.test(line) || /=\s*props\s*=>/.test(line);
                depth = 0;
            }
            if (scopeName && !scopeHasProps && /\bprops\./.test(line) && !/^\s*[*/]/.test(line)) {
                offenders.push(`${rel}:${i + 1} in ${scopeName}: ${line.trim().slice(0, 60)}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        'these throw at render, which unmounts the tree and blanks the app');
});
