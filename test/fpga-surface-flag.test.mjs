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
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

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
