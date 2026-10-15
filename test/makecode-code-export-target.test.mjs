import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {exportToMakeCodeCalliope} from '../overlay/scratch-gui/src/lib/bw-makecode/export-calliope.js';
import {exportToMakeCodeEv3} from '../overlay/scratch-gui/src/lib/bw-makecode/export-ev3.js';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Execute the actual UI method. Only its lazy module loader, parser boundary
// and file download are supplied here; emission and the project writer are real.
const methodSource = scopeAfter(source, 'async exportMakeCode ()');
const lazyImport = `await import(
                /* webpackChunkName: "bw-makecode" */ '../../lib/bw-makecode/index.js')`;
assert.equal(methodSource.split(lazyImport).length, 2, 'replace exactly the shipped lazy compiler import');
const method = new AsyncFunction('downloadBlob', 'loadMakeCode', 'MAKECODE_EDITOR',
    methodSource.replace(lazyImport, 'await loadMakeCode()'));
const editors = {microbit: 'https://makecode.microbit.org/', calliopemini: 'https://makecode.calliope.cc/',
    ev3: 'https://makecode.mindstorms.com/'};
const done = [...source.matchAll(/mcExportDone: ([\s\S]*?),\n\s*mcExportEmpty:/g)]
    .map(m => new Function(`return (${m[1]});`)());
assert.equal(done.length, 2, 'exercise both shipped locales');

const waitProject = () => ({targets: [{isStage: true, blocks: {
    hat: {opcode: 'event_whenflagclicked', next: 'wait', topLevel: true},
    wait: {opcode: 'control_wait_until', parent: 'hat', inputs: {CONDITION: [2, 'condition']}},
    condition: {opcode: 'operator_equals', parent: 'wait', inputs: {OPERAND1: [1, [4, '1']], OPERAND2: [1, [4, '1']]}}
}}]});
const motorProject = () => ({targets: [{isStage: true, blocks: {
    hat: {opcode: 'event_whenflagclicked', next: 'motor', topLevel: true},
    motor: {opcode: 'ev3comprehensive_motorRun', parent: 'hat', inputs: {PORT: [1, 'port'], POWER: [1, [4, '50']]}},
    port: {opcode: 'ev3comprehensive_menu_motorPorts', shadow: true, parent: 'motor', fields: {motorPorts: ['A', null]}}
}}]});

async function run (target, {original = {status: 'none'}, locale = 0, project = waitProject(), text,
    hasBoards = false, parseError, nextTargetOnLoad} = {}) {
    const downloads = [], calls = {parse: 0, load: 0, boards: 0};
    let device = target;
    const host = {
        state: {buffers: {pseudocode: text ?? `# target test\nDEVICE ${target.toUpperCase()}\n`}},
        currentDevice: () => device, hasBoards: () => hasBoards,
        async exportBoardsMakeCode () { calls.boards++; },
        setState (next) { Object.assign(this.state, next); },
        lib: async () => {
            if (nextTargetOnLoad) device = nextTargetOnLoad;
            return {default: class {parse () { calls.parse++; if (parseError) throw parseError; return project; }}};
        },
        makeCodeOriginalStatus: () => original,
        L: {mcExportEmpty: 'Nothing to export', mcExportDone: done[locale], mcFailed: (label, error) => `${label}: ${error}`}
    };
    await method.call(host, async (name, blob) => downloads.push({name, envelope: JSON.parse(await blob.text())}),
        async () => { calls.load++; return {exportToMakeCode, exportToMakeCodeCalliope, exportToMakeCodeEv3, makeCodeProjectFile}; }, editors);
    return {downloads, calls, state: host.state};
}
const downloaded = result => {
    assert.equal(result.downloads.length, 1, result.state.status);
    assert.equal(result.state.busy, false);
    const file = result.downloads[0];
    assert.match(file.name, /\.mkcd$/);
    return {...file, files: JSON.parse(file.envelope.source)};
};

for (const target of Object.keys(editors)) {
    for (const locale of [0, 1]) test(`${target} export writes its own target and editor (locale ${locale})`, async () => {
        const result = await run(target, {locale});
        const file = downloaded(result);
        assert.equal(file.envelope.meta.cloudId, `pxt/${target}`);
        assert.equal(file.envelope.meta.name, 'target test');
        assert.equal(file.name, 'target-test.mkcd', 'retain the generated micro:bit filename convention');
        assert.ok(result.state.status.includes(editors[target]), result.state.status);
        assert.doesNotMatch(result.state.status, /undefined/);
        const dependencies = JSON.parse(file.files['pxt.json']).dependencies;
        assert.deepEqual(dependencies, target === 'ev3' ? {ev3: '*'} :
            target === 'calliopemini' ? {core: '*', radio: '*'} : {core: '*', radio: '*', microphone: '*'});
        if (target === 'calliopemini') {
            assert.doesNotMatch(file.files['main.ts'], /pauseUntil/);
            assert.match(file.files['main.ts'], /while \(!\([\s\S]*basic\.pause\(20\)/);
        } else assert.match(file.files['main.ts'], /pauseUntil/);
    });
    test(`${target} unchanged original retains all original files and its name`, async () => {
        const files = {'main.ts': '// original bytes\n', 'pxt.json': '{"name":"original"}', 'extra.ts': '// custom source\r\n'};
        const file = downloaded(await run(target, {original: {status: 'current', target, name: 'original name', files}}));
        assert.deepEqual(file.files, files);
        assert.equal(file.envelope.meta.cloudId, `pxt/${target}`);
        assert.equal(file.envelope.meta.name, 'original name');
        assert.equal(file.name, 'original name.mkcd');
    });
}

test('EV3 blocks use the EV3 emitter rather than a micro:bit fallback', async () => {
    const file = downloaded(await run('ev3', {project: motorProject()}));
    assert.match(file.files['main.ts'], /motors\.largeA\.run\(50\)/);
    assert.doesNotMatch(file.files['main.ts'], /unsupported|basic\./);
});

for (const original of [
    {status: 'stale', target: 'calliopemini'},
    {status: 'current', target: 'microbit'}
]) test(`${original.status} ${original.target} originals cannot replace current Calliope code`, async () => {
    const file = downloaded(await run('calliopemini', {original: {...original, files: {'main.ts': '// wrong original'}}}));
    assert.match(file.files['main.ts'], /basic\.pause\(20\)/);
    assert.doesNotMatch(file.files['main.ts'], /wrong original/);
});

test('empty source and multi-board source retain their existing early returns', async () => {
    for (const options of [{text: ''}, {hasBoards: true}]) {
        const result = await run('microbit', options);
        assert.equal(result.downloads.length, 0);
        assert.equal(result.calls.load, 0);
        assert.equal(result.calls.parse, 0);
        assert.equal(result.calls.boards, options.hasBoards ? 1 : 0);
    }
});

test('unsupported devices and parse errors fail without a download and release busy', async () => {
    for (const [target, options, error] of [['pico', {}, /not available for pico/],
        ['calliopemini', {parseError: new Error('parse failed')}, /parse failed/]]) {
        const result = await run(target, options);
        assert.equal(result.downloads.length, 0);
        assert.equal(result.state.busy, false);
        assert.match(result.state.status, error);
    }
});

test('the export button is offered for micro:bit, Calliope and EV3', () => {
    const menu = source.match(/\{(\[[^\]]+\])\.includes\(this\.currentDevice\(\)\) \? \(\s*<button type="button" onClick=\{this\.exportMakeCode\}/);
    assert.ok(menu, 'find the actual export button device guard');
    assert.deepEqual(JSON.parse(menu[1].replace(/'/g, '"')), ['microbit', 'calliopemini', 'ev3']);
});

// A lazy import must not mix the captured source with a later editor header.
test('the export target belongs to the source captured before loading the compiler', async () => {
    const file = downloaded(await run('calliopemini', {nextTargetOnLoad: 'microbit'}));
    assert.equal(file.envelope.meta.cloudId, 'pxt/calliopemini');
    assert.match(file.files['main.ts'], /basic\.pause\(20\)/);
});
