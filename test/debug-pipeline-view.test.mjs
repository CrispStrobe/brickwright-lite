// The CPU-pipeline instrument (task C4, E8): the real component rendered
// against a real bw-board RISC-V debug target running a kernel whose timing is
// derived by hand in bw-board's test/uarch-pipeline.test.mjs (the load-use
// chain: 7 instructions, 3 load-use bubbles, 14 cycles). What the pane shows
// must be what the model computed — the diagram row of the stalled addi, the
// cycle count, the CPI breakdown — and the wiring from panel to runner to
// target must exist.
//
// Mutations that go red here (measured when this was written): the pane
// rendering held cells upper-case (no stall marking) reds the render case;
// the runner's debugTiming returning null, or the <DebugPipeline> element
// dropped from the panel, reds the wiring case; a DE key removed reds the
// parity case.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const read = p => readFileSync(join(root, p), 'utf8');
const PANE = 'overlay/scratch-gui/src/components/tw-pseudocode/debug-pipeline.jsx';

async function loadPane() {
    const guiRequire = createRequire(join(root, 'packages/scratch-gui/package.json'));
    const babel = guiRequire('@babel/core');
    const sourceUrl = new URL(`../${PANE}`, import.meta.url);
    const tempUrl = new URL(`./debug-pipeline-test-${randomUUID()}.mjs`, sourceUrl);
    const reactUrl = pathToFileURL(guiRequire.resolve('react')).href;
    const source = (await readFile(sourceUrl, 'utf8')).replace("from 'react'", `from '${reactUrl}'`);
    const code = babel.transformSync(source, {
        filename: 'debug-pipeline.jsx', babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-react'), {runtime: 'classic'}]]
    }).code;
    await writeFile(tempUrl, code);
    try { return {mod: await import(tempUrl.href), React: guiRequire('react'), renderer: guiRequire('react-test-renderer')}; }
    finally { await unlink(tempUrl); }
}

const LOAD_USE = `
    lui  a0, 8
    lw   t0, 0(a0)
    addi t1, t0, 1
    lw   t2, 4(a0)
    add  t3, t2, t1
    lw   t4, 8(a0)
    add  t5, t4, t3
    ebreak`;

async function riscvTarget() {
    const {createDebugTarget} = await import('bw-board/debug-target-factory.js');
    const {assembleRiscv} = await import('bw-board/riscv-asm.js');
    const {image} = assembleRiscv(LOAD_USE, {textBase: 0x1000, dataBase: 0x8000});
    const {target} = await createDebugTarget('riscv32', {image});
    return target;
}

// The runner's three timing entry points, exactly as debug-runner.js defines them.
function runnerOver(target, calls = []) {
    return {
        debugTimingSupported: () => !!(target && typeof target.setTiming === 'function'),
        setDebugTiming: cfg => { calls.push(cfg); return target.setTiming(cfg); },
        debugTiming: n => target.timing(n)
    };
}

const textOf = node => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''));

test('the pane renders the model: the stalled addi, 14 cycles, the load-use share of CPI', async () => {
    const {mod, React, renderer: {create, act}} = await loadPane();
    const target = await riscvTarget();
    const calls = [];
    const runner = runnerOver(target, calls);
    let r;
    await act(async () => { r = create(React.createElement(mod.default, {runner, locale: 'en'})); });
    const find = attr => r.root.findAll(n => n.props && n.props[attr] !== undefined && typeof n.type === 'string');
    assert.equal(find('data-debug-pipeline')[0].props['data-debug-pipeline-state'], 'off');
    await act(async () => { find('data-debug-pipeline-toggle')[0].props.onClick(); });
    await act(async () => { find('data-debug-pipeline-enable')[0].props.onChange({target: {checked: true}}); });
    assert.deepEqual(calls.at(-1).icache, {size: 1024, ways: 2, line: 16, replacement: 'lru'}, 'the pane\'s defaults reach the model');
    // No caches, so the hand-derived 14 applies: switch both off (a restart of the model).
    for (const k of ['icache', 'dcache']) {
        await act(async () => { find('data-debug-pipeline-setting').find(n => n.props['data-debug-pipeline-setting'] === k).props.onChange({target: {value: 'off'}}); });
    }
    assert.equal(calls.at(-1).icache, null);
    assert.equal(calls.at(-1).dcache, null);
    target.run();
    while (target.runFor(1e6) !== 'halted');
    await act(async () => { r.update(React.createElement(mod.default, {runner, locale: 'en'})); });

    const summary = find('data-debug-pipeline-cycles')[0].props;
    assert.equal(summary['data-debug-pipeline-cycles'], 14);
    assert.equal(summary['data-debug-pipeline-insts'], 7);
    const loaduse = find('data-debug-pipeline-stall').find(n => n.props['data-debug-pipeline-stall'] === 'loaduse');
    assert.equal(loaduse.props['data-debug-pipeline-stall-cpi'], 3 / 7);

    const rows = find('data-debug-pipeline-row');
    const addi = rows.find(row => textOf(row.findAll(n => n.props && n.props['data-debug-pipeline-insn'] !== undefined)[0]) === 'addi t1, t0, 1');
    assert.ok(addi, 'the addi has a row, labelled with its disassembly');
    const cells = addi.findAll(n => n.props && n.props['data-debug-pipeline-cell'] !== undefined).map(n => n.props['data-debug-pipeline-cell']).join('');
    assert.equal(cells, '..FdDXMW......', 'fetched in cycle 2, held one cycle in decode (the load-use bubble), then X M W');
    const held = addi.findAll(n => n.props && n.props['data-debug-pipeline-cell'] === 'd')[0];
    assert.equal(held.props.title, 'waiting for a loaded value');
    const bubbles = find('data-debug-pipeline-bubble').map(n => n.props['data-debug-pipeline-bubble']);
    assert.deepEqual(bubbles.filter(Boolean), ['fill', 'fill', 'fill', 'fill', 'loaduse', 'loaduse', 'loaduse'], 'every empty WB, with its reason');
});

test('German: the pane speaks the locale it is given', async () => {
    const {mod, React, renderer: {create, act}} = await loadPane();
    const runner = runnerOver(await riscvTarget());
    let r;
    await act(async () => { r = create(React.createElement(mod.default, {runner, locale: 'de'})); });
    const toggle = r.root.findAll(n => n.props && n.props['data-debug-pipeline-toggle'] !== undefined && typeof n.type === 'string')[0];
    assert.match(textOf(toggle), /CPU-Pipeline \(Zeitmodell\)/);
});

test('a target without timing models shows nothing', async () => {
    const {mod, React, renderer: {create, act}} = await loadPane();
    let r;
    await act(async () => { r = create(React.createElement(mod.default, {runner: {debugTimingSupported: () => false}, locale: 'en'})); });
    assert.equal(r.toJSON(), null);
});

test('EN and DE carry the same keys', async () => {
    const {mod} = await loadPane();
    assert.deepEqual(Object.keys(mod.L10N.de).sort(), Object.keys(mod.L10N.en).sort());
});

test('wiring: panel renders the pane, the runner exposes the target\'s timing, both twins agree', () => {
    for (const tree of ['overlay', 'packages']) {
        const panel = read(`${tree}/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx`);
        const runner = read(`${tree}/scratch-gui/src/lib/bw-debug/debug-runner.js`);
        assert.match(panel, /import DebugPipeline from '\.\/debug-pipeline\.jsx';/);
        assert.match(panel, /<DebugPipeline runner=\{this\.state\.runner\} locale=\{this\.props\.locale\} \/>/);
        assert.match(runner, /debugTimingSupported: \(\) => !!\(target && typeof target\.setTiming === 'function'\)/);
        assert.match(runner, /setDebugTiming: cfg => \(target && typeof target\.setTiming === 'function'/);
        assert.match(runner, /debugTiming: lastCycles => \(target && typeof target\.timing === 'function' \? target\.timing\(lastCycles\) : null\)/);
    }
    const pane = read(PANE);
    assert.doesNotMatch(pane.replace("import React from 'react';", ''), /^import /m, 'self-contained: React only');
});
