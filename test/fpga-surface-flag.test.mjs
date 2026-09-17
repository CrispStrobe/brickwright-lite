/**
 * The FPGA/HDL surface is a BUILD-TIME opt-in, and OFF is the shipped default.
 *
 * Two things must stay true, and they are different claims:
 *   1. nothing reaches a default build — no tab, no panel, no import;
 *   2. adding it moved no existing tab index, because CODE_TAB_INDEX and
 *      circuit-tab.jsx's hard-coded index are both literals that a fifth tab
 *      inserted in the wrong place would silently invalidate.
 *
 * These are source-text assertions rather than a render, matching
 * circuit-tab-index.test.mjs: the gate is the webpack substitution, and what
 * needs checking is that the substitution is the ONLY way in.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(resolve(here, '..', p), 'utf8');

const GUI = 'overlay/scratch-gui/src/components/gui/gui.jsx';
const WEBPACK = 'overlay/scratch-gui/webpack.config.js';

test('the flag is build-time, so an off build can drop the code entirely', () => {
    const webpack = read(WEBPACK);
    assert.match(webpack, /'process\.env\.BW_ENABLE_FPGA':/,
        'BW_ENABLE_FPGA must be substituted by DefinePlugin; a runtime toggle cannot '
        + 'be dead-code-eliminated and would put the surface in every bundle');
    assert.match(webpack, /BW_ENABLE_FPGA === '1'/,
        'the flag must be an explicit opt-in, not truthiness of any set value');
});

test('OFF is the default: nothing enables the surface without the env var', () => {
    const webpack = read(WEBPACK);
    const line = webpack.split('\n').find(l => l.includes("'process.env.BW_ENABLE_FPGA'"));
    assert.ok(line, 'the define line is missing');
    assert.ok(!/\|\||\?\?/.test(line),
        `the define must not fall back to a default that turns it on: ${line.trim()}`);
});

test('both the tab and its panel are gated, not just the tab', () => {
    const gui = read(GUI);
    const tabList = gui.slice(gui.indexOf('<TabList'), gui.indexOf('</TabList>'));
    assert.match(tabList, /FPGA_ENABLED \? \(/,
        'the <Tab> is not gated');
    const panels = gui.slice(gui.indexOf('</TabList>'), gui.indexOf('</Tabs>'));
    assert.match(panels, /FPGA_ENABLED \? \(/,
        'the <TabPanel> is not gated — a panel without a tab still mounts and still '
        + 'pulls its imports into the bundle');
    assert.match(gui, /const FPGA_ENABLED = process\.env\.BW_ENABLE_FPGA;/,
        'the gate must read the substituted literal directly, so webpack can fold it');
});

test('the FPGA tab is LAST, so no existing tab index moved', () => {
    const gui = read(GUI);
    const tabList = gui.slice(gui.indexOf('<TabList'), gui.indexOf('</TabList>'));
    const fpga = tabList.indexOf('gui.gui.fpgaTab');
    const circuit = tabList.indexOf('gui.gui.circuitTab');
    const code = tabList.indexOf('gui.gui.codeTab');
    assert.ok(fpga > 0, 'gui.gui.fpgaTab not found in the TabList');
    assert.ok(fpga > circuit && circuit > code,
        'FPGA must come after Circuit, which must come after Code: inserting it '
        + 'earlier silently invalidates CODE_TAB_INDEX and circuit-tab.jsx');
});

test('the surface does not claim to do what it cannot', () => {
    // A hidden surface can still lie to the one person who enables it. TN3/TN4/
    // TN5 do not exist, so the panel must not imply synthesis, simulation or
    // flashing -- the same rule target-kinds.js states for picker entries.
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    // Test the CLAIM, not a phrase. An earlier version of this assertion matched
    // the literal words "not built yet" and went red the moment the same
    // disclaimer was reworded -- a guard that polices spelling instead of
    // meaning gets weakened by whoever hits it next.
    const disclaimer = /(not built yet|is not built|none of that is built|does not (synthesi|simulat|flash))/i;
    assert.match(panel, disclaimer,
        'the panel must say plainly, somewhere, that the toolchain half does not exist');
    const visible = panel.slice(panel.indexOf('const FpgaTab'));
    for (const verb of [/synthesis/i, /simulat/i, /flash/i]) {
        if (!verb.test(visible)) continue;
        assert.ok(disclaimer.test(visible),
            `the panel mentions ${verb} in user-facing text without the disclaimer nearby`);
    }
    for (const overclaim of [/\bsynthesis(ing)? (is )?(available|ready)\b/i,
        /\bflash(es|ing) (to )?the board\b/i, /\bruns your (verilog|design)\b/i]) {
        assert.ok(!overclaim.test(panel), `the panel implies a capability that does not exist: ${overclaim}`);
    }
});

test('every import in the flagged surface resolves — because NO build compiles it', () => {
    // The hole this closes: CI only ever builds with BW_ENABLE_FPGA off, and the
    // flag-off build genuinely drops this file (verified by grepping the shipped
    // github-pages artifact for its strings — zero hits). Both facts together
    // mean webpack NEVER parses fpga-tab.jsx in CI, so a renamed or moved module
    // would break the surface and no gate would say a word until someone turned
    // the flag on.
    //
    // A full flag-on build would catch more, and costs a build slot on a repo
    // that counts them. This catches the likely failure -- a path that stopped
    // existing -- for nothing.
    const panelPath = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx';
    const panel = read(panelPath);
    const dir = resolve(here, '..', dirname(panelPath));

    const specifiers = [...panel.matchAll(/^import\s+[^'"]*from\s+'([^']+)';/gm)].map(m => m[1]);
    assert.ok(specifiers.length >= 3, `expected several imports, found ${specifiers.length}`);

    const missing = [];
    for (const spec of specifiers) {
        if (spec.startsWith('.')) {
            if (!existsSync(resolve(dir, spec))) missing.push(spec);
            continue;
        }
        if (spec === 'react') continue;
        // A bare specifier must resolve as a package (the board JSON does).
        try {
            createRequire(import.meta.url).resolve(spec);
        } catch {
            missing.push(spec);
        }
    }
    assert.deepEqual(missing, [],
        `the flagged surface imports paths that do not resolve: ${missing.join(', ')}`);
});

// ── a selection nothing acts on ─────────────────────────────────
//
// The tab computed `selectBackend(...)`, displayed which backend it would build
// on, and then called `synthesise()` without an endpoint — so the button refused
// `no-synthesis-service` even in a build that had been given one. Nothing caught
// it: no build compiles this file, and check-flagged-jsx parses it without
// executing it. A source-text assertion is the instrument that fits, in the same
// spirit as the tab-index tests above.

const TAB = 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx';

test('the Synthesise call is aimed at the SELECTED backend', () => {
    const tab = read(TAB);
    const call = tab.slice(tab.indexOf('synthesise({'));
    assert.ok(call.startsWith('synthesise({'), 'the tab must call synthesise');
    const args = call.slice(0, call.indexOf('}).then'));
    assert.match(args, /endpoint:/,
        'synthesise() without an endpoint always refuses; a selector whose answer is '
        + 'displayed but not passed is a decoration');
    assert.match(args, /selection\.selected\.endpoint/,
        'the endpoint must come from the selection, not from the raw configured value — '
        + 'otherwise an explicit "local" request would silently POST to the hosted service');
});

test('the button is disabled when no backend was selected', () => {
    const tab = read(TAB);
    assert.match(tab, /disabled=\{!hdl\.trim\(\) \|\| !selection\.accepted\}/,
        'an enabled button that can only refuse teaches the user the tool is broken '
        + 'rather than that nothing is configured; the reason is already on screen');
});

// ── TN6a: the local tier's availability must be ASKED, not asserted ──

// A source-text gate that reads comments judges PROSE, not code. `palette-engine-coverage`
// learned this when an apostrophe in a comment made it report nine orphans that did not
// exist; here the comment EXPLAINING the old `localAvailable: false` would have counted as
// the thing it warns about, so a correct fix could never pass.
const codeOnly = text => text.split('\n')
    .map(line => line.replace(/^\s*(\/\/|\*|\/\*).*$/, ''))
    .join('\n');

test('localAvailable comes from the worker, not from a literal', () => {
    const tab = codeOnly(read(TAB));
    assert.doesNotMatch(tab, /localAvailable:\s*(true|false)/,
        'a hard-coded localAvailable makes the backend permanently offerable or '
        + 'permanently not, whatever the browser can actually do — it was `false` '
        + 'for the whole of TN3');
    assert.match(tab, /localAvailable:\s*Boolean\(local/,
        'it must be derived from the state the worker reported');
});

test('the download button is offered only where it can work', () => {
    const tab = read(TAB);
    assert.match(tab, /disabled=\{localBusy \|\| !local \|\| local\.code !== 'not-downloaded'\}/,
        'an enabled button that can only refuse teaches the user the tool is broken; '
        + 'the reason is already rendered above it');
});

test('the tab never asks for a local bitstream', () => {
    // §8c's rule, and the one thing TN6a must not quietly relax: place and route
    // is another 183 MB that is not offered, so nothing here may imply a
    // bitstream comes out of the local tier.
    const tab = read(TAB);
    const localCalls = tab.match(/localClient\.\w+/g) || [];
    assert.deepEqual([...new Set(localCalls)].sort(),
        ['localClient.download', 'localClient.init', 'localClient.synthesise',
            'localClient.terminate']);
    assert.doesNotMatch(tab, /localClient\.bitstream/);
});

test('the worker is terminated when the tab goes away', () => {
    const tab = read(TAB);
    assert.match(tab, /localClient\.terminate\(\)/,
        'a worker holding 78 MB of compiled WebAssembly must not outlive its tab');
});

// ── an off build must not need the local toolchain installed ────
//
// THE FLAG DOES NOT STOP RESOLUTION. `process.env.BW_ENABLE_FPGA` is a
// DefinePlugin substitution, so it removes the flagged code from the OUTPUT,
// after webpack has resolved the graph — and `new Worker(new URL(…))` is
// detected statically, so yosys-worker.js enters that graph either way. Build
// run 35185515757 went red on `Can't resolve '@yowasp/yosys'`, a 75 MB package
// this repository deliberately does not depend on. The comments on this surface
// said "no build compiles it"; what is true is that no build EXECUTES it.

test('a flag-off build resolves @yowasp/yosys to a stub, not to a dependency', () => {
    const webpack = read(WEBPACK);
    assert.match(webpack, /BW_ENABLE_FPGA !== '1'/,
        'the stub must be conditional: an ON build has to reach the real package');
    assert.match(webpack, /alias\['@yowasp\/yosys\$'\]/,
        'an exact-match alias, so @yowasp/yosys/anything is untouched');
    assert.match(webpack, /yosys-absent\.js/);
});

test('@yowasp/yosys is NOT a dependency of this repo', () => {
    const require_ = createRequire(import.meta.url);
    const pkg = require_('../package.json');
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        assert.equal(Object.keys(pkg[field] || {}).some(d => d.startsWith('@yowasp/')), false,
            `${field} must not carry @yowasp/*: 75 MB in every install to serve a tier `
            + 'that is off by default is the trade the local tier exists to avoid');
    }
});

test('the stub throws rather than pretending to be a toolchain', async () => {
    const stub = await import('../overlay/scratch-gui/src/lib/bw-fpga/yosys-absent.js');
    assert.throws(() => stub.runYosys(['-V'], {}), /BW_ENABLE_FPGA=1/,
        'a stub that returns something plausible is how it ends up standing in for the '
        + 'real thing without anyone noticing');
});

// ── the tab must be scrollable, or its lower half is unreachable ──
//
// The tab panel is `display:flex; flex-grow:1` (gui.css .tab-panel.is-selected),
// so the FPGA tab's root is a flex item. `overflow-y:auto` alone does nothing:
// a flex item's default `min-height:auto` refuses to shrink below its content,
// so the tall FPGA content overflows the panel and the page cannot scroll —
// reported unusable 2026-09-17. The fix is `min-height:0` so the item can shrink
// to the panel and scroll its own content. Gated because no build compiles this
// file and it is one deleted property from returning.

test('the FPGA tab root is an absolute-inset scroller, so it actually scrolls', () => {
    // The tab panel (position:relative) and its ancestors carry min-height:auto and
    // overflow:visible, so a FLOW child grows the chain until gui_flex-wrapper clips it
    // with overflow:hidden — no user scroll (reported unusable 2026-09-17; a flex
    // minHeight:0 fix measured NOT enough). circuit-tab.jsx's pattern is the one that
    // works: absolute inset:0 contributes zero flow height, so the panel stays bounded
    // and the content scrolls inside it.
    const tab = codeOnly(read(TAB));
    const at = tab.indexOf("position: 'absolute'");
    assert.ok(at > 0, 'the FPGA tab root must be position:absolute (the circuit-tab pattern)');
    const style = tab.slice(at, at + 160);
    assert.match(style, /top:\s*0/);
    assert.match(style, /bottom:\s*0/,
        'inset must reach the panel bottom, or the scroller is not full height');
    assert.match(style, /overflowY:\s*'auto'/, 'the root must scroll its own content');
});
