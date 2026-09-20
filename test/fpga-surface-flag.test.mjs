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

test('the tab is dropped at BUILD time and hidden behind the user opt-in at RUNTIME', () => {
    const gui = read(GUI);
    // The BUILD gate stays: FpgaTab is behind the substituted literal, so an off
    // build folds it to null and emits no FPGA chunk (the drop the payload guards
    // rely on). The RUNTIME gate is added: visibility is build AND the user's
    // preference, so shipping the code does not put the tab in front of everyone.
    assert.match(gui, /const FpgaTab = process\.env\.BW_ENABLE_FPGA[\s\S]{0,80}React\.lazy\(\(\) => import\(/,
        'FpgaTab must be behind the build literal AND lazy — an off build must emit no '
        + 'FPGA chunk, and an on build must keep the surface out of first paint');
    assert.match(gui, /const FPGA_BUILT = process\.env\.BW_ENABLE_FPGA;/,
        'the build gate must read the substituted literal directly, so webpack can fold it');
    assert.match(gui, /const showFpga = FPGA_BUILT && fpgaEnabled;/,
        'visibility is BUILD and the user opt-in — the build half still folds to false when off');
    const tabList = gui.slice(gui.indexOf('<TabList'), gui.indexOf('</TabList>'));
    assert.match(tabList, /showFpga \? \(/, 'the <Tab> is not gated on showFpga');
    const panels = gui.slice(gui.indexOf('</TabList>'), gui.indexOf('</Tabs>'));
    assert.match(panels, /showFpga \? \(/,
        'the <TabPanel> is not gated — a panel without a tab still mounts and pulls its chunk');
});

test('the user opt-in is a runtime preference, and OFF by default', () => {
    const prefs = read('overlay/scratch-gui/src/lib/bw-fpga-preferences.js');
    assert.match(prefs, /getItem\(FPGA_ENABLED_KEY\) === '1'/,
        'enabled means the stored value is exactly "1"');
    assert.match(prefs, /catch \{ return false; \}/,
        'with no storage (a private window) the tab is OFF, never on by accident');
    // gui.jsx must react to the toggle without a reload: the menu and the tab list
    // are different components, joined by the event the prefs module dispatches.
    const gui = read(GUI);
    assert.match(gui, /addEventListener\(FPGA_TOGGLE_EVENT/,
        'the tab list must listen for the toggle so the tab appears without a reload');
    const menu = read('overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx');
    assert.match(menu, /process\.env\.BW_ENABLE_FPGA \? workspaceSelect\(/,
        'the settings toggle must itself be behind the build flag — no toggle for a tab '
        + 'whose code was never bundled');
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
    // Synthesis now EXISTS (hosted + local, both driven end to end), so the old
    // blanket "does not synthesise" disclaimer is gone and this gate no longer
    // requires it. What still does NOT exist is flashing (TN4) and a local-tier
    // BITSTREAM — the browser tier produces a netlist only. Those honesties must
    // stay, and nothing may imply flashing works.
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    // The local tier must keep saying it produces no bitstream.
    assert.match(panel, /does not produce a bitstream/i,
        'the in-browser tier makes a netlist, not a bitstream — that limit must stay stated');
    // Flashing is not built: it may appear only as a future/"planned" item, never
    // as a present capability.
    assert.doesNotMatch(panel, /\bflash(es|ing)? (the |your )?(board|bitstream|design)\b(?![^<]*[Pp]lanned)/,
        'the panel must not imply it can flash the board — TN4 is not built');
    for (const overclaim of [/\bflash(es|ing) (to )?the board\b/i, /\bplaces (and|&) routes in the browser\b/i]) {
        assert.ok(!overclaim.test(panel), `the panel implies a capability that does not exist: ${overclaim}`);
    }
});

test('the primary flow is NOT gated on entering pin constraints first', () => {
    // The bug that made the tab read as "two empty textfields": the whole
    // Verilog + Synthesise UI was wrapped in `{canonical ? (...)}`, and canonical
    // (a generated .cst) is empty until constraints are typed — so a fresh user
    // saw no design input and no button. The Verilog input must come BEFORE, and
    // outside of, any `canonical` gate.
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    const verilog = panel.indexOf("<h3>{L10N[pickLocale(props.locale)].verilogTitle}");
    const canonicalGate = panel.indexOf('{canonical ?');
    assert.ok(verilog > 0, 'the Verilog input heading must exist');
    assert.ok(canonicalGate === -1 || verilog < canonicalGate,
        'Verilog/Synthesise must not sit inside the canonical gate — that hid the whole flow');
});

test('the pin checker is a collapsed panel, not the first thing shown', () => {
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    assert.match(panel, /<summary[^>]*>[\s\S]*?checkPinsTitle/,
        'the pin checker must live under a <details> summary, demoted below the synth flow');
    // and it must come AFTER the Synthesise button, not before it
    const synth = panel.indexOf(">{L10N[pickLocale(props.locale)].synthesiseBtn}</button>");
    const checker = panel.indexOf('L10N[pickLocale(props.locale)].checkPinsTitle');
    assert.ok(synth > 0 && checker > synth, 'the pin checker must appear after the synth flow');
});

test('every import in the flagged surface resolves', () => {
    // The DEPLOYABLE build is now flag-on and compiles this file, so a moved or
    // renamed module would fail that build. But the BROWSER-gate build stays
    // flag-off and never parses fpga-tab.jsx, and this test is milliseconds
    // against a build slot the repo counts — so it keeps catching the likely
    // failure (a path that stopped existing) without waiting on a webpack run.
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
        if (spec === 'react' || spec === 'react-redux' || spec === 'bw-circuit-ui/parts-data/tang_nano_20k.json') continue;
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

// ── a successful synthesis must be reachable, not stranded in state ──
//
// `synth` was rendered only when NOT ok, so a working build left its bitstream
// (hosted) or netlist (local) in React state with no way for the user to get it.
// Browsers can save a Blob (the artifact sandbox cannot), so success now offers
// a download. Gated because no build compiles this file.

test('a successful synthesis offers its artefact as a download', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /synth && synth\.ok/,
        'the success branch (synth.ok) must render something — a working build was invisible');
    assert.match(tab, /download="design\.fs"/,
        'a hosted bitstream must be downloadable, or the build produced nothing the user can use');
    assert.match(tab, /createObjectURL/,
        'the bitstream/netlist must become a Blob URL the browser can save');
    assert.match(tab, /revokeObjectURL/,
        'the object URLs must be revoked when the result changes, or they leak');
});

// ── the local SIM netlist feeds the simulator, as the blurb promises ──
//
// The tab says the in-browser tier produces "a netlist you can ... check in the
// pin panel below". The netlist textarea (netlistText) drives the gate-level
// sim, so a successful local synth must populate it — otherwise the promise is
// empty and the netlist only exists as a download. It must be the GENERIC
// simNetlist: the synth_gowin `netlist` is Gowin-mapped and yosys2digitaljs
// cannot read it, so feeding that would put an unsimulatable netlist in the box.

test('a successful local synthesis feeds its SIM netlist into the simulator', () => {
    const tab = codeOnly(read(TAB));
    const at = tab.indexOf('localClient.synthesise(');
    assert.ok(at > 0, 'the local synth handler must exist');
    const handler = tab.slice(at, at + 600);
    assert.match(handler, /r\.result\.simNetlist/,
        'the handler must feed the GENERIC simNetlist — the Gowin-mapped netlist is not '
        + 'simulatable ($specify2), so driving the sim from it would be a regression');
    assert.match(handler, /setNetlistText\(/,
        'the sim netlist must be fed into netlistText, which drives the sim — the blurb '
        + 'promises the pin panel can check it, and only setNetlistText makes that true');
});

test('a successful HOSTED synthesis also feeds its SIM netlist into the simulator', () => {
    // The hosted route used to only setSynth (a download), so a hosted design
    // never drove the board — the §7.4 "known polish". Now it feeds simNetlist,
    // so hosted and local both animate the board.
    const tab = codeOnly(read(TAB));
    const at = tab.indexOf('synthesise({');
    assert.ok(at > 0, 'the hosted synth handler must exist');
    const handler = tab.slice(at, at + 600);
    assert.match(handler, /r\.simNetlist/,
        'the hosted handler must feed the generic simNetlist, not the Gowin-mapped netlist');
    assert.match(handler, /setNetlistText\(/,
        'a hosted design must reach the sim too, or only local designs light the board');
});

// ── the Verilog box is never a blank page ───────────────────────

test('the tab offers starter examples that load a design in one click', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /import \{EXAMPLES\}/, 'the tab must pull in the starter designs');
    assert.match(tab, /EXAMPLES\.map\(/, 'it must render a control per example');
    // loading one must set BOTH the Verilog and the constraints, or the pin
    // checker would describe a different design than the one in the box.
    assert.match(tab, /setHdl\(ex\.verilog\)/, 'an example must fill the Verilog box');
    assert.match(tab, /setText\(ex\.cst\)/, 'an example must fill the constraints too');
});

// ── flashing is native-only, and the button never lies (TN4) ────

test('the Flash button appears only when the native flash transport is available', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /flash\.available \? \(/,
        'a Flash button must be gated on flash.available — a browser cannot flash, and a '
        + 'button that only fails is the lie target-kinds.js forbids');
    assert.match(tab, /flashBitstream\(synth\.bitstream\)/,
        'the button must flash the produced bitstream');
    // and the browser path must tell a user with a board how to flash it themselves
    assert.match(tab, /openFPGALoader -b tangnano20k design\.fs/,
        'when flashing is unavailable, the panel must show the openFPGALoader command');
});

// ── the design drives the on-screen board (#1), guarded ─────────

test('the tab drives the placed board through the PERSISTENT circuit handle', () => {
    const tab = codeOnly(read(TAB));
    // window.__circuit is the live model published by circuit-tab.jsx's
    // onCircuitReady; it PERSISTS across a tab switch (window.__bwCircuit, the
    // designer's mount-effect handle, is deleted when the designer unmounts — as
    // it does whenever this tab is active — so it is a fallback only).
    assert.match(tab, /window\.__circuit\b/,
        'the tab must reach the PERSISTENT live circuit handle, not only the '
        + 'designer-lifecycle-bound one that vanishes when this tab is active');
    assert.match(tab, /applyPortValues\(c, bindings, sim\.values\)/,
        'it must apply the design\'s simulated values onto the bound terminals');
    assert.match(tab, /typeof c\.setPin !== 'function'/,
        'it must NO-OP when no circuit has been loaded — fail-closed by presence');
});

test('the first-run guide tracks its steps from real state, and can be hidden', () => {
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    // It must read the tab's actual state, not run a scripted tour that ticks
    // steps the user never did.
    assert.match(panel, /done: Boolean\(demoMsg && demoMsg\.ok\)/,
        'step 1 (demo board) must reflect the real demo-board result');
    assert.match(panel, /done: Boolean\(\(synth && synth\.ok\) \|\| netlistText\.trim\(\)\)/,
        'step 2 (synthesise) must reflect a real netlist/synth result');
    assert.match(panel, /done: clockCycles > 0/,
        'step 3 (step the clock) must reflect real clock steps');
    assert.match(panel, /done: mirrored/,
        'step 4 (the Widgets view) must reflect the design actually being mirrored there');
    // It is dismissible per browser, and defaults to SHOWN (a new user sees it).
    assert.match(panel, /localStorage\.setItem\('bw-fpga-guide-done', '1'\)/,
        'hiding the guide must persist so it does not nag');
    assert.match(panel, /getItem\('bw-fpga-guide-done'\) === '1'/,
        'the guide is shown unless the user has hidden it (default: shown)');
});

// ── the demo board works OUT OF THE BOX, without a Circuit-tab detour ──
//
// The board only exists once the Circuit tab's designer has mounted and
// published window.__circuit. A user who lands straight on the FPGA tab has
// never opened Circuit, so a naive demo click had nothing to build on and the
// old copy told them to "Open the 🔌 Circuit tab once … then try again" — a
// dead end for the out-of-box case (#172 tried to force a hidden designer to
// mount and could not: render() omits the designer under the default debugger
// dock while this tab is visible). The fix asks the app to MAKE the Circuit tab
// visible — the one path that reliably mounts the designer and publishes the
// handle — then waits for it and builds. gui.jsx owns the tab list; the tab
// only knows the index, so it dispatches an event gui.jsx listens for.

test('the demo button asks the app to show the Circuit tab, then builds when the handle appears', () => {
    const tab = codeOnly(read(TAB));
    // It must dispatch the tab-activation request (it cannot flip tabs itself —
    // gui.jsx owns the tab list), aimed at the Circuit tab index.
    assert.match(tab, /dispatchEvent\(new CustomEvent\('bw-activate-tab'/,
        'the demo button must ask gui.jsx to show a tab, not tell the user to do it by hand');
    assert.match(tab, /detail: \{index: CIRCUIT_TAB_INDEX\}/,
        'the activation request must name the Circuit tab, whose designer publishes window.__circuit');
    // It must WAIT for the handle and then build — not assume it appears synchronously.
    assert.match(tab, /buildDemoBoard\(/, 'it must actually wire the demo board');
    assert.match(tab, /liveCircuit\(\)/,
        'it must re-check for the live handle (the designer mounts asynchronously)');
});

test('gui.jsx flips to a tab when asked by bw-activate-tab, using the tab list it owns', () => {
    const gui = codeOnly(read(GUI));
    assert.match(gui, /addEventListener\('bw-activate-tab'/,
        'gui.jsx must listen for the activation request — it is the only component that '
        + 'owns onActivateTab and can make the Circuit tab visible');
    assert.match(gui, /props\.onActivateTab\(idx\)/,
        'the listener must drive the same tab-select path the tabs themselves use');
});

// ── the synthesised design is visible in the Widgets view too ──
//
// The FPGA tab drives the placed board's LEDs, but the Controller/Widgets view
// is a right-pane dock the tab cannot reach, and this build's bw-board pin has
// no path from a board pin into a widget. So the tab broadcasts its output pins
// and their levels, and gui.jsx (which owns the panel) mirrors them as indicator
// widgets — the design's LEDs show in the Widgets view, not only on the board.

test('the FPGA tab broadcasts its driven output pins and their live levels', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /dispatchEvent\(new CustomEvent\('bw-fpga-leds'/,
        'the tab must offer to mirror its output pins into the Controller view');
    assert.match(tab, /dispatchEvent\(new CustomEvent\('bw-fpga-output'/,
        'the tab must broadcast live pin levels so the mirrored indicators can follow');
    assert.match(tab, /outputPins/,
        'it must mirror the DRIVEN pins (outputs), not every binding');
    // A free-running clock is what makes the Widgets view watchable: you cannot
    // step here and watch the dock on another tab at once.
    assert.match(tab, /setInterval\(\(\) => setClockCycles/,
        'a self-running clock must exist, or the mirrored view never advances');
});

test('gui.jsx mirrors the FPGA output into the Controller panel, behind the build flag', () => {
    const gui = codeOnly(read(GUI));
    assert.match(gui, /addEventListener\('bw-fpga-leds'/,
        'gui.jsx must create the indicator widgets — it owns the controller panel');
    assert.match(gui, /addEventListener\('bw-fpga-output'/,
        'gui.jsx must update the indicators as the design runs');
    assert.match(gui, /controllerPanel\.setBargraphValue\(name, high \? 1 : 0\)/,
        'each pin level must drive its indicator');
    // The wiring is FPGA-surface code, so an off build must drop it.
    const at = gui.indexOf("addEventListener('bw-fpga-leds'");
    const guard = gui.lastIndexOf('if (!FPGA_BUILT) return undefined;', at);
    assert.ok(guard > 0 && guard < at,
        'the mirror effect must be gated on FPGA_BUILT so an off build folds it away');
});

// ── re-mirroring a different design clears the previous design's indicators ──
test('the widget mirror removes stale fpga indicators for pins no longer driven', () => {
    const gui = codeOnly(read(GUI));
    assert.match(gui, /\/\^fpga_p\\d\+\$\/\.test\(existing\) && !want\.has\(existing\)/,
        'switching designs must drop indicators for pins the new design does not drive');
    assert.match(gui, /controllerPanel\.removeWidget\(existing\)/,
        'the stale indicator must actually be removed');
});

// ── the demo board follows the loaded design's pins ──
//
// The demo board used to hard-wire LEDs on 15-18 regardless of the design in
// the box, so loading an example on other pins ("Counter — 6 LEDs") wired LEDs
// the design never drives and left its real outputs dark. The builder already
// takes a `pins` option; the tab now hands it the design's OUTPUT pins so the
// board matches whatever is loaded. With no design, the builder's own default
// (15-18) applies — where the sequence and chaser examples put their LEDs.

test('the demo board is wired on the loaded design\'s output pins', () => {
    const tab = codeOnly(read(TAB));
    // It must read the CURRENT output pins (through a ref, since the builder runs
    // from an async callback), not a fixed list.
    assert.match(tab, /outputPinsRef\.current = netlistText\.trim\(\) \? outputPins : \[\]/,
        'the builder must see the latest output pins (through a ref), and only trust '
        + 'them once a netlist gives directions — else a clock input gets an LED');
    assert.match(tab, /buildDemoBoard\(c, pins\.length \? \{pins\} : \{\}\)/,
        'the demo board must be wired on the design pins when there are any, else the default');
    // The confirmation names the pins it actually lit, not a hard-coded "15-18".
    assert.match(tab, /result\.leds\.map\(l => l\.pin\)/,
        'the message must report the pins actually wired');
});

// ── Rung 1: the synthesised design is drawn as gates (a visual analog) ──
//
// The whole app is visual; the FPGA tab was a Verilog textbox. HDL is not a
// Scratch script, so the honest analog is a SCHEMATIC, not blocks. The tab now
// draws the synthesised netlist as gates, laid out with elkjs, lighting the nets
// whose value it knows. The heavy layout lib loads only when the view shows.

test('the FPGA tab shows the synthesised design as a gate schematic', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /import\(\s*\/\*[^*]*\*\/\s*'\.\/fpga-schematic\.jsx'\)/,
        'the schematic view must be its own lazy chunk (it pulls elkjs)');
    assert.match(tab, /<FpgaSchematic netlistText=\{netlistText\} netValues=\{netValues\}/,
        'the tab must render the schematic from the same netlist the sim reads, with known net values');
});

test('the schematic model and view exist and are wired to elkjs, not a heavy renderer', () => {
    const model = read('overlay/scratch-gui/src/lib/bw-fpga/schematic.js');
    assert.match(model, /export function buildSchematicModel/,
        'a pure model builder must exist (testable without a browser)');
    assert.match(model, /org\.eclipse\.elk\.algorithm/,
        'layout must be elkjs — no jointjs/MPL renderer pulled into the bundle');
    const view = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-schematic.jsx');
    assert.match(view, /elkjs\/lib\/elk\.bundled\.js/, 'the view lays out with elkjs');
    assert.match(view, /buildSchematicModel/, 'the view draws the pure model');
    // Honesty: an unknown net is drawn as unknown, never guessed to 0.
    assert.match(view, /a wire lights with the value it carries|wireColor/, 'wires are coloured by real value');
    assert.doesNotMatch(view, /@joint|jointjs/, 'no jointjs — the team avoided that dependency on purpose');
});

// ── Rung 2: the design's outputs as waveforms over time ──
test('the FPGA tab shows output waveforms for a clocked design', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /import\(\s*\/\*[^*]*\*\/\s*'\.\/fpga-waveform\.jsx'\)/,
        'the waveform view is its own lazy chunk');
    assert.match(tab, /<FpgaWaveform netlistText=\{netlistText\} inputs=\{inputs\}/,
        'the tab must render the waveform from the same netlist and inputs');
});

test('the waveform builder is pure and honest about unknown values', () => {
    const wf = read('overlay/scratch-gui/src/lib/bw-fpga/waveform.js');
    assert.match(wf, /export function traceToLanes/, 'a pure lane builder exists (testable without a browser)');
    assert.match(wf, /return 'x'/, 'an undefined value stays x, never coerced to a confident low');
    const sim = read('overlay/scratch-gui/src/lib/bw-fpga/sim.js');
    assert.match(sim, /traceClock \(clockPort, cycles, ports/,
        'the sim must record outputs per cycle, bounded by a cap');
    assert.match(sim, /Math\.min\(Math\.max\(0, cycles \| 0\), cap\)/,
        'the trace length must be bounded so a large step count cannot build an unbounded array');
});

// ── Rung 3: build logic by placing gates, no Verilog typed ──
test('the FPGA tab offers a visual gate builder that feeds the Verilog box', () => {
    const tab = codeOnly(read(TAB));
    // the React Flow canvas is the sole visual builder (the old SVG one was retired)
    assert.match(tab, /import\(\s*\/\*[^*]*\*\/\s*'\.\/fpga-gate-builder-rf\.jsx'\)/,
        'the React Flow builder is its own lazy chunk');
    assert.match(tab, /<FpgaGateBuilderRf [^>]*onUseVerilog=/,
        'the tab must render the React Flow gate builder');
    assert.doesNotMatch(tab, /<FpgaGateBuilder [^>]*onUseVerilog=/,
        'the redundant old SVG builder must not also be rendered');
    assert.match(tab, /setHdl\(v\); if \(cst\) setText\(cst\); setSynth\(null\)/,
        'building gates must drop generated Verilog AND matching constraints into the boxes');
});

test('the gate-builder Verilog generator is pure and refuses to emit illegal HDL', () => {
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /export function modelToVerilog/, 'a pure generator exists (fully tested)');
    assert.match(gb, /unconnected-input/, 'a floating input is a NAMED problem, tied low, not illegal HDL');
    assert.match(gb, /replace\(\/\[\^A-Za-z0-9_\]\/g/, 'user names are sanitised to legal identifiers');
    // The builder UI must not itself contain HDL string-building — that lives in
    // the tested pure module.
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /modelToVerilog\(model\)/, 'the UI must generate via the tested pure function');
    assert.doesNotMatch(ui, /'module '|`module /, 'the UI must not build Verilog strings itself');
});

// ── B: internal-wire liveness in the schematic ──
test('the schematic can light INTERNAL wires, defensively and without regression', () => {
    const sim = read('overlay/scratch-gui/src/lib/bw-fpga/sim.js');
    assert.match(sim, /netValue \(net\)/, 'the sim must read a single named net');
    assert.match(sim, /catch \(e\) \{ \/\* engine internals shifted/,
        'the read must NEVER throw — the engine graph is not a stable surface');
    assert.match(sim, /return null;/, 'an unreadable net returns null, so the caller draws it unknown');
    const view = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-schematic.jsx');
    assert.match(view, /liveNet\[net\] !== undefined \? liveNet\[net\]/,
        'a live internal value wins, but falls back to the I/O values — additive only');
    assert.match(view, /sim\.netValues\(nets\)/, 'the schematic reads every net of its own settle');
    // The tab feeds the schematic the live clock/inputs so it reflects the board.
    const tab = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /<FpgaSchematic[^>]*inputs=\{inputs\} clockCycles=\{clockCycles\}/);
});

// ── C: the first-run guide points to the visual views ──
test('the guide surfaces the schematic, waveforms and gate builder', () => {
    const tab = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /Three ways to SEE it/, 'a synthesised design points the learner to its visual views');
    assert.match(tab, /gate schematic/, 'the schematic is named');
    assert.match(tab, /waveforms/, 'the waveforms are named');
    assert.match(tab, /build it visually/, 'the gate builder is surfaced for people who would rather not type HDL');
});

// ── the React Flow canvas foundation: a permissive dep + a tested bridge ──
test('the gate builder canvas dep is React Flow (MIT), registered for the build', () => {
    const integ = read('scripts/integrate.mjs');
    assert.match(integ, /@xyflow\/react.*MIT/,
        'the canvas library must be the MIT React Flow, registered with its licence like every dep');
    const bridge = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js');
    assert.match(bridge, /export function reactFlowToModel/, 'React Flow state → our model (feeds the tested generator)');
    assert.match(bridge, /export function modelToReactFlow/, 'our model → React Flow state (seeds the canvas)');
    // positions are UI-only and must not leak into the logic model
    assert.match(bridge, /Positions are UI-only and dropped/);
});

// ── visual hierarchy on the canvas: save a subcircuit, drop instances ──
test('the React Flow builder composes: save a subcircuit and instantiate it', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /const saveSubcircuit = /, 'a design can be saved as a reusable subcircuit');
    assert.match(ui, /derivePorts\(model\)/, 'its I/O become the subcircuit ports');
    assert.match(ui, /const addInstance = /, 'a saved subcircuit can be dropped as an instance');
    assert.match(ui, /instance: InstanceNode/, 'instances render with per-port handles');
    assert.match(ui, /reactFlowToModel\(nodes, edges, library\)/,
        'generate must pass the library so the Verilog carries every subcircuit as a module');
    const bridge = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js');
    assert.match(bridge, /modules && modules\.length \? \{modules, nodes, edges\}/,
        'the bridge carries the subcircuit library into the model');
});

// ── bus wires: the canvas can make multi-bit ports ──
test('the React Flow builder can set a node bit width (buses)', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /const \[newWidth, setNewWidth\]/, 'a width for the next node');
    assert.match(ui, /data-testid="bw-fpga-rf-width"/, 'a width selector on the toolbar');
    assert.match(ui, /width: newWidth/, 'new nodes take the chosen width');
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /A multi-bit port needs ONE pin per bit/, 'a bus is constrained per-bit, or P&R fails');
});

// ── the palette: drag parts onto the canvas (CircuitVerse/icestudio-style) ──
test('the builder places nodes by dragging from a categorised palette', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import FpgaGatePalette, \{DRAG_MIME\}/, 'the palette sidebar is mounted');
    assert.match(ui, /<FpgaGatePalette catalog=\{catalog\}/, 'fed by the pure catalogue');
    assert.match(ui, /rf\.screenToFlowPosition/, 'a drop lands the node where the cursor is');
    assert.match(ui, /const placeNode = /, 'one place-node path for gate/io/memory/template drops');
    const palette = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-palette.jsx');
    assert.match(palette, /e\.dataTransfer\.setData\(DRAG_MIME/, 'rows start a drag carrying a descriptor');
    assert.match(palette, /gateShape\(/, 'gate rows preview the shared glyph');
    const catalog = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(catalog, /export function buildPaletteCatalog/, 'the catalogue is pure data over GATE_DEFS');
});

// ── inspector + right-click: edit a node's params, delete/duplicate ──
test('a placed node can be inspected (params) and right-clicked (delete/duplicate)', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /onNodeDoubleClick=\{onNodeDoubleClick\}/, 'double-click opens the inspector');
    assert.match(ui, /onNodeContextMenu=\{onNodeContextMenu\}/, 'right-click opens the menu');
    assert.match(ui, /const patchNode = /, 'edits merge into node.data');
    assert.match(ui, /const duplicateNode = /, 'a node can be duplicated');
    assert.match(ui, /<NodeInspector node=\{inspectNode\}/, 'the inspector renders for the live node');
    const insp = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-node-inspector.jsx');
    assert.match(insp, /export function NodeInspector/, 'a native-control inspector');
    assert.match(insp, /export function NodeContextMenu/, 'a duplicate/delete menu');
    assert.match(insp, /dataWidth.*addrWidth|addrWidth/, 'RAM geometry is editable');
    assert.doesNotMatch(insp, /from 'bw-circuit-ui/, 'ported for the gate domain — no board-package import coupling');
});

// ── live simulation: Run mode colours wires and shows values ──
test('the builder runs live — wires colour by value, inputs toggle', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import \{evalModel, stepClock\}/, 'the tested evaluator drives Run mode');
    assert.match(ui, /data-testid="bw-fpga-rf-run"/, 'a Run toggle');
    assert.match(ui, /const shownEdges = live/, 'edges recolour by their source value');
    assert.match(ui, /const onNodeClick = /, 'clicking an input toggles it');
    assert.match(ui, /stepClock\(reactFlowToModel/, 'a clock step advances flip-flops');
    assert.match(ui, /nodes=\{shownNodes\} edges=\{shownEdges\}/, 'the canvas renders the live values');
});

// ── templates: drag a starter design onto the canvas ──
test('the palette offers starter templates that merge onto the canvas', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /buildPaletteCatalog\(EXAMPLES\.filter\(e => e\.model/, 'model-bearing examples become templates');
    assert.match(ui, /item\.kind === 'template'/, 'a template drop is handled');
    assert.match(ui, /idMap\[n\.id\] = id/, 'ids are remapped so a template MERGES, not clobbers');
});

// ── the learning path: a guided, auto-graded challenge ladder ──
test('the builder has a learning path — challenges, Check, saved progress', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import \{grade\}/, 'the tested grader drives Check');
    assert.match(ui, /data-testid="bw-fpga-rf-learn"/, 'a Learn toggle');
    assert.match(ui, /const selectChallenge = /, 'selecting a step scaffolds its I/O');
    assert.match(ui, /const runCheck = /, 'Check grades the built design');
    assert.match(ui, /localStorage/, 'progress persists across sessions');
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-challenges.jsx');
    assert.match(panel, /data-testid="bw-fpga-check"/, 'a Check button');
    assert.match(panel, /gradeMessage/, 'the result explains what to fix');
    const grader = read('overlay/scratch-gui/src/lib/bw-fpga/grader.js');
    assert.match(grader, /import \{evalModel/, 'grading reuses the tested evaluator');
});

// ── canvas UX polish: snap, keyboard-delete, clear, next-on-pass ──
test('the canvas has snap-to-grid, keyboard delete, clear, and next-on-pass', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /snapToGrid snapGrid=\{\[16, 16\]\}/, 'nodes snap to a grid');
    assert.match(ui, /deleteKeyCode=\{\['Backspace', 'Delete'\]\}/, 'Delete/Backspace removes selection');
    assert.match(ui, /data-testid="bw-fpga-rf-clear"/, 'a Clear button');
    assert.match(ui, /const goNext = /, 'advance to the next unlocked challenge');
    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-challenges.jsx');
    assert.match(panel, /data-testid="bw-fpga-next"/, 'a Next button appears on a pass');
});

// ── Run mode shows each wire's live value (label + colour + animation) ──
test('Run mode labels each wire with its live bit value', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /label: v === undefined \? 'x' : String\(v\)/, 'each wire shows its bit');
    assert.match(ui, /animated: isLive\(v\)/, 'live wires animate (1-bit high or nonzero bus)');
    assert.match(ui, /strokeWidth: isLive\(v\) \? 2\.6 : 1\.8/, 'active wires thicken');
});

// ── new primitives: constant source, buffer, controlled inverter ──
test('the palette gains a Constant source and buffer/cinv gates', () => {
    const cat = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(cat, /kind: 'const', label: 'Constant'/, 'a Constant source node');
    assert.match(cat, /'buffer', 'cinv'/, 'buffer and controlled inverter in Logic');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /const: ConstNode/, 'the constant renders its value');
    assert.match(ui, /item\.kind === 'const'/, 'a constant can be dropped');
});

// ── the sequential family: T/SR/JK flip-flops ──
test('the palette offers T, SR and JK flip-flops that synthesise', () => {
    const cat = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(cat, /'dff', 'tff', 'srff', 'jkff'/, 'the sequential family is in the palette');
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /tff: \{label: 'T-FF'/, 'the T flip-flop is defined');
    assert.match(gb, /seqNext:/, 'flip-flops carry a Verilog next-state');
    assert.match(gb, /gd\.seqNext\(nets, reg\)/, 'the codegen is generic over the family');
});

// ── the canvas must show its design even when opened from a collapsed panel ──
test('the React Flow canvas re-fits when its container gains size', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /new ResizeObserver/, 'a ResizeObserver re-fits the view');
    assert.match(ui, /rf\.fitView\(\{padding/, 'so nodes are never left off-screen');
    assert.match(ui, /onInit=\{inst => \{ try \{ inst\.fitView/, 'and it fits on init');
});

// ── the canvas can be exported to SVG (CLI-inspectable, saves browser drives) ──
test('the builder can export the canvas as an SVG', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import \{canvasToSvg\}/, 'the pure exporter is used');
    assert.match(ui, /const exportSvg = /, 'an export handler');
    assert.match(ui, /data-testid="bw-fpga-rf-svg"/, 'a visible Export SVG button');
    const lib = read('overlay/scratch-gui/src/lib/bw-fpga/canvas-svg.js');
    assert.match(lib, /export function canvasToSvg/, 'and it lives in a pure, reusable module');
    assert.match(lib, /import \{gateShape\}/, 'reusing the shared glyphs');
});

// ── built-in blocks: decoder / demux from the palette ──
test('the palette offers built-in decoder/demux blocks', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import \{BUILTINS\}/, 'built-ins are loaded');
    assert.match(ui, /buildPaletteCatalog\(EXAMPLES\.filter\([^)]*\), BUILTINS\)/, 'and fed to the palette as Blocks');
    const b = read('overlay/scratch-gui/src/lib/bw-fpga/builtins.js');
    assert.match(b, /decoder2to4/);
    assert.match(b, /demux1to2/);
});

// ── Code block: a node written in raw Verilog (icestudio-style) ──
test('a Verilog Code block can be added and instantiated', () => {
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /export function parseVerilogPorts/, 'ports are parsed from the Verilog header');
    assert.match(gb, /m\.verilog \? String\(m\.verilog\)\.trim\(\)/, 'code modules are emitted verbatim');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /const addCodeBlock = /, 'the modal adds a code module to the library');
    assert.match(ui, /data-testid="bw-fpga-rf-code"/, 'a Code button');
});

// ── the demo board RENDERS: it loads the built circuit so the designer updates ──
test('wiring the demo board loads it as circuitData so the designer re-renders', () => {
    const tab = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /dispatchEvent\(new CustomEvent\('bw-load-circuit-data'/, 'the built circuit is dispatched to be loaded');
    assert.match(tab, /c\.toJSON\(\)/, 'as the live circuit JSON');
    const ct = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    assert.match(ct, /addEventListener\('bw-load-circuit-data'/, 'circuit-tab loads it');
    assert.match(ct, /this\.setState\(\{circuitData: data\}\)/, 'as a fresh circuitData prop so the designer re-renders');
    assert.match(ct, /removeEventListener\('bw-load-circuit-data'/, 'and cleans up the listener');
});

// ── tunnels: named nets that declutter wiring ──
test('the palette offers a tunnel (named net) that the codegen shares', () => {
    const cat = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(cat, /kind: 'tunnel', label: 'Tunnel'/, 'a Tunnel in the palette');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /tunnel: TunnelNode/, 'the tunnel renders as a named tag');
    assert.match(ui, /item\.kind === 'tunnel'/, 'a tunnel can be dropped');
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /w_tun_\$\{ident\(node\.name, 'net'\)\}/, 'same-named tunnels share one net');
});

// ── combinational analysis: truth table → generated circuit ──
test('the builder can generate a circuit from a truth table', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /import TruthTableModal/, 'the modal is mounted');
    assert.match(ui, /data-testid="bw-fpga-rf-tt"/, 'a Truth table button');
    assert.match(ui, /onGenerate=\{loadModel\}/, 'generating loads the synthesised model onto the canvas');
    const lib = read('overlay/scratch-gui/src/lib/bw-fpga/synthesize.js');
    assert.match(lib, /export function synthesizeTruthTable/, 'a pure sum-of-products synthesiser');
    const modal = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-truth-table.jsx');
    assert.match(modal, /synthesizeTruthTable\(/, 'the modal uses the tested synthesiser');
});

test('a generated circuit re-fits the view, so its gates are not left off-screen', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    // loadModel replaces the canvas with the generated design at fresh positions;
    // without a re-fit the old fit region frames nothing (LOOK-verified: a
    // generated XOR showed only its I/O, its five gates off-screen).
    const at = ui.indexOf('const loadModel =');
    assert.ok(at > 0, 'loadModel must exist');
    const body = ui.slice(at, at + 800);
    assert.match(body, /rf\.fitView\(/, 'loadModel must fit the view to the generated design');
});

test('a generated circuit is laid out as a schematic, not the naive zig-zag', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /modelToReactFlow\(model, layerPositions\(model\)\)/,
        'loadModel must position the generated nodes by depth (inputs left, output right)');
    const lay = read('overlay/scratch-gui/src/lib/bw-fpga/auto-layout.js');
    assert.match(lay, /export function layerPositions/, 'a pure topological layout exists (tested without a browser)');
    assert.match(lay, /visiting\.has\(id\)/, 'the layering must be cycle-safe (sequential feedback)');
});

// ── output devices: an LED and a seven-segment display that light in Run ──
//
// The far end of a circuit is where bits become something you can SEE. The
// palette offers an LED and a seven-segment display; both are viewing
// INSTRUMENTS, dropped from the synthesised netlist (they emit no HDL) but lit
// live from the values on their inputs. The seven-segment FACE and the hex
// decoder are pure and proved against the font (fpga-output-devices.test.mjs).
test('the palette offers LED and seven-segment output devices that light in Run mode', () => {
    const cat = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(cat, /id: 'display', label: 'Display'/, 'a Display section in the palette');
    assert.match(cat, /kind: 'led', label: 'LED'/, 'an LED device');
    assert.match(cat, /kind: 'seg7', label: '7-seg display'/, 'a seven-segment device');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /led: LedNode, seg7: Seg7Node/, 'the devices render as nodes');
    assert.match(ui, /item\.kind === 'led'/, 'an LED can be dropped');
    assert.match(ui, /item\.kind === 'seg7'/, 'a seven-segment can be dropped');
    assert.match(ui, /ledValue\(n\.id, edges, live\.values\)/, 'an LED lights from its live input');
    assert.match(ui, /seg7Value\(n\.id, edges, live\.values\)/, 'the display reads its 4-bit input live');
});

test('display devices are instruments — dropped from the synthesised model, not emitted as HDL', () => {
    const bridge = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js');
    assert.match(bridge, /DISPLAY_KINDS = new Set\(\['seg7', 'led'/,
        'the bridge must know display kinds are instruments');
    assert.match(bridge, /filter\(n => !DISPLAY_KINDS\.has/, 'display nodes are dropped from the model');
    assert.match(bridge, /shown\.has\(e\.source\) && shown\.has\(e\.target\)/,
        'and their edges too, so codegen never sees an instrument');
});

test('the seven-segment core is pure: a hex font, a decoder, and a shared face', () => {
    const dev = read('overlay/scratch-gui/src/lib/bw-fpga/output-devices.js');
    assert.match(dev, /export const SEG7_FONT/, 'the hex font (the oracle) is exported');
    assert.match(dev, /export function sevenSegDecoderModel/, 'a synthesisable 4→7 decoder gate model');
    assert.match(dev, /export function sevenSegSvg/, 'a shared SVG face for the canvas and the widget');
    assert.match(dev, /import \{synthesizeTruthTable, truthTableFrom\}/,
        'the decoder is built by the tested truth-table synthesiser, not hand-wired');
});

// ── logic minimisation: truth-table→circuit yields a designed circuit ──
test('the synthesiser can minimise (Quine–McCluskey), and the modal offers it', () => {
    const syn = read('overlay/scratch-gui/src/lib/bw-fpga/synthesize.js');
    assert.match(syn, /import \{minimizeOutput\}/, 'the synthesiser uses the pure minimiser');
    assert.match(syn, /\{minimize = false\}/, 'minimising is an option (default off; the modal turns it on)');
    const min = read('overlay/scratch-gui/src/lib/bw-fpga/minimize.js');
    assert.match(min, /export function primeImplicants/, 'Quine–McCluskey prime implicants (pure, tested)');
    assert.match(min, /export function minimizeOutput/, 'a per-output SOP minimiser');
    const modal = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-truth-table.jsx');
    assert.match(modal, /data-testid="bw-fpga-tt-minimize"/, 'a minimise checkbox');
    assert.match(modal, /tableRows\(\)\}, \{minimize\}\)/, 'Generate honours the checkbox');
    assert.match(modal, /data-testid="bw-fpga-tt-gatehint"/, 'a gate-count hint teaches what minimising saves');
});

test('the 7-seg decoder is a minimised, droppable block laid out as a schematic', () => {
    const b = read('overlay/scratch-gui/src/lib/bw-fpga/builtins.js');
    assert.match(b, /id: 'seg7_decoder'/, 'the decoder is a palette Block');
    assert.match(b, /sevenSegDecoderModel\(\)/, 'built from the tested decoder model');
    const dev = read('overlay/scratch-gui/src/lib/bw-fpga/output-devices.js');
    assert.match(dev, /synthesizeTruthTable\(table, \{minimize: true\}\)/, 'the decoder is minimised (309→~78 gates), else it is undroppable');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /modelToReactFlow\(item\.model, layerPositions\(item\.model\)\)/, 'a dropped block is laid out, not zig-zagged');
});

// ── undo/redo: a real editor steps back ──
test('the canvas has undo/redo (buttons + Ctrl-Z), snapshotting before edits', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /const takeSnapshot = /, 'a snapshot-before-edit primitive');
    assert.match(ui, /const undo = /, 'an undo');
    assert.match(ui, /const redo = /, 'a redo');
    assert.match(ui, /data-testid="bw-fpga-rf-undo"/, 'an Undo button');
    assert.match(ui, /data-testid="bw-fpga-rf-redo"/, 'a Redo button');
    // snapshots must guard the discrete edits, or undo has nothing to step back to
    for (const site of [/const placeNode = \(item, position\) => \{\s*takeSnapshot\(\)/,
        /onConnect = React\.useCallback\(params => \{ takeSnapshot\(\)/,
        /const loadModel = model => \{\s*takeSnapshot\(\)/,
        /const deleteNode = id => \{\s*takeSnapshot\(\)/]) {
        assert.match(ui, site, `a mutation is not snapshotted: ${site}`);
    }
    assert.match(ui, /onKeyDownCapture=\{onCanvasKeyDown\}/, 'keyboard undo/redo + snapshot-before-delete');
    assert.match(ui, /e\.shiftKey\) redo\(\); else undo\(\)/, 'Ctrl-Z undo, Ctrl-Shift-Z redo');
    assert.match(ui, /onNodeDragStart=\{\(\) => takeSnapshot\(\)\}/, 'a move is undoable too');
});

// ── cross-tab: the FPGA outputs as a seven-segment number (opt-in) ──
test('the FPGA tab can mirror its outputs as a seven-segment digit', () => {
    const tab = codeOnly(read(TAB));
    assert.match(tab, /data-testid="bw-fpga-show-seg7"/, 'a "show as 7-seg" control');
    assert.match(tab, /dispatchEvent\(new CustomEvent\('bw-fpga-seg7'/,
        'it must ask gui.jsx to make the seven-segment widget');
    const gui = codeOnly(read(GUI));
    assert.match(gui, /addEventListener\('bw-fpga-seg7'/, 'gui.jsx owns the panel and creates the widget');
    assert.match(gui, /addWidget\(SEG7_NAME, 'sevenseg'/, 'a real sevenseg widget, not a bargraph');
    assert.match(gui, /setSevenSegValue\(SEG7_NAME, pinsToValue\(leds\)\)/,
        'bw-fpga-output must drive the digit with the folded pin value');
    // gated behind the build flag like the rest of the mirror
    const at = gui.indexOf("addEventListener('bw-fpga-seg7'");
    const guard = gui.lastIndexOf('if (!FPGA_BUILT) return undefined;', at);
    assert.ok(guard > 0 && guard < at, 'the seg7 mirror must be inside the FPGA_BUILT-gated effect');
    const pv = read('overlay/scratch-gui/src/lib/bw-fpga/pin-value.js');
    assert.match(pv, /export function pinsToValue/, 'a pure LSB-first pin folder (tested without a browser)');
});

// ── LED bank: several bits shown at once, one device ──
test('the palette offers an LED bank that lights per bit in Run mode', () => {
    const cat = read('overlay/scratch-gui/src/lib/bw-fpga/palette-catalog.js');
    assert.match(cat, /kind: 'ledbank', label: 'LED bank'/, 'an LED bank device');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /ledbank: LedBankNode/, 'the bank renders as a node');
    assert.match(ui, /item\.kind === 'ledbank'/, 'a bank can be dropped');
    assert.match(ui, /ledBankValues\(n\.id, edges, live\.values, n\.data\.bits/, 'each bit lights from its own input');
    const bridge = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js');
    assert.match(bridge, /DISPLAY_KINDS = new Set\(\['seg7', 'led', 'ledbank'\]\)/, 'the bank is an instrument, dropped from the netlist');
});

// ── the "minimise" lesson: challenges graded on gate count too ──
test('the learning path has minimise challenges graded on size, using the minimiser', () => {
    const ch = read('overlay/scratch-gui/src/lib/bw-fpga/challenges.js');
    assert.match(ch, /id: 'absorb'.*minimize: true/s, 'an absorption challenge');
    assert.match(ch, /id: 'consensus'.*minimize: true/s, 'a consensus challenge');
    assert.match(ch, /id: 'majority_min'.*minimize: true/s, 'a minimal-majority challenge');
    const g = read('overlay/scratch-gui/src/lib/bw-fpga/grader.js');
    assert.match(g, /export function minimalGates/, 'the budget is the true minimum (Quine–McCluskey)');
    assert.match(g, /import \{synthesizeTruthTable, truthTableFrom\}/, 'computed from the reference via the minimiser');
    assert.match(g, /challenge\.minimize/, 'grade() enforces the gate budget');
    assert.match(g, /overBudget/, 'a correct-but-oversized design is rejected on size');
    assert.match(g, /Correct AND minimal/, 'and a minimal one is celebrated');
});

// ── the datapath comes alive: bus inputs take a real number in Run mode ──
test('a bus input (width>1) is set with a number field, not a 0/1 toggle', () => {
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    // The input node offers a numeric field for width>1, exposing the arithmetic
    // the evaluator already computes (add/sub/mux/compare on buses).
    assert.match(ui, /const editable = isIn && running && w > 1;/, 'a bus input is editable in Run mode');
    assert.match(ui, /data-testid=\{`bw-fpga-rf-inval-\$\{data\.name\}`\}/, 'the field is addressable per input');
    assert.match(ui, /data\.setValue\(v\)/, 'setting it drives the live input value');
    // Run mode feeds the REAL numeric value (masked to width), not a coerced 0/1.
    assert.match(ui, /const val = w === 1 \? \(raw \? 1 : 0\) : /, 'a bus keeps its multi-bit value');
    assert.match(ui, /setValue: v => setInputs/, 'the node carries a setter for its value');
    // The click-toggle stays 1-bit only, so a bus field is not flipped by a click.
    assert.match(ui, /node\.data\.kind === 'in' && \(node\.data\.width \|\| 1\) === 1/, 'only 1-bit inputs toggle on click');
    // A nonzero bus reads as a LIVE wire, not idle.
    assert.match(ui, /const isLive = v => v !== undefined && v !== 'x' && v !== 0/, 'a nonzero bus wire is live');
});

// ── sequential datapath: multi-bit registers + bus-fed displays ──
test('a multi-bit register holds all its bits (bus counters/accumulators)', () => {
    const ev = read('overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js');
    // stepClock must MASK the captured value to the flop width, not coerce to 0/1.
    assert.match(ev, /multi-bit DFF \(a register\) holds all its bits/, 'the register-width intent is documented');
    assert.match(ev, /const w = n\.width \|\| 1;/, 'the flop width is read');
    assert.match(ev, /w >= 32 \? Number\(BigInt\(raw\)/, 'and the captured value is masked to that width');
    assert.doesNotMatch(ev, /step\(nets, cur\) \? 1 : 0/, 'the old 0/1 coercion must be gone');
});

test('the seven-segment and LED bank can be fed by a single bus wire', () => {
    const dev = read('overlay/scratch-gui/src/lib/bw-fpga/output-devices.js');
    assert.match(dev, /targetHandle === 'd'\);\s*\n\s*if \(bus/, 'a bus wire on the d handle carries the whole value');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /position=\{Position\.Top\} id="d"/, 'the seg7 has a bus input handle');
    assert.match(ui, /position=\{Position\.Left\} id="d"/, 'the LED bank has a bus input handle');
});

// ── live RAM: the memory node simulates in Run mode ──
test('a RAM simulates live — writes on we, registered read on dout', () => {
    const ev = read('overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js');
    assert.match(ev, /n\.kind === 'memory'/, 'evalModel drives the memory dout');
    assert.match(ev, /if \(we === 1\) mem\[addr\] =/, 'stepClock writes the word when we is high');
    assert.match(ev, /takes the OLD word at addr/i, 'the registered-read semantics are documented');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /k === 'memory'\) return \{\.\.\.n, data: \{\.\.\.n\.data, live: live\.values\[n\.id\]\}\}/, 'the RAM value is fed to the node');
    assert.match(ui, /'dout '.*String\(data\.live\)/s, 'the RAM shows its dout in Run mode');
});

// ── the bridge to silicon: the builder previews each port's board pin ──
test('the builder shows which Tang Nano pin each port lands on', () => {
    const gb = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js');
    assert.match(gb, /export function modelPinMap/, 'a pure pin-map (the same placement modelToCst emits)');
    const ui = read('overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx');
    assert.match(ui, /modelPinMap\(reactFlowToModel\(nodes, edges, library\)\)/, 'computed from the live design');
    assert.match(ui, /data-testid="bw-fpga-rf-pinmap"/, 'and shown before synthesis');
});

// ── loadable sequential/datapath templates (showcase registers + displays) ──
test('the builder ships a counter template and a counter→7-seg block', () => {
    const ex = read('overlay/scratch-gui/src/lib/bw-fpga/examples.js');
    assert.match(ex, /id: 'counter4'/, 'a loadable 4-bit counter example');
    assert.match(ex, /always @\(posedge clk\) w_q <= w_add;/, 'its Verilog is a real clocked counter');
    const b = read('overlay/scratch-gui/src/lib/bw-fpga/builtins.js');
    assert.match(b, /id: 'counter7seg'/, 'a counter→7-seg droppable block');
    assert.match(b, /kind: 'seg7'/, 'that drives a seven-segment display');
    const bridge = read('overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js');
    assert.match(bridge, /DIRECT = new Set\(\['instance', 'memory', 'const', 'tunnel', 'led', 'seg7', 'ledbank'\]\)/,
        'display kinds render as themselves when a model is loaded, not as gates');
});
