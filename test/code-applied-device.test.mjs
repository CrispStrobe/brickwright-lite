// Exercise the actual JSX methods with deferred/rejected VM loads. A header is
// only a proposed device until the generated project has loaded successfully.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {balancedFrom, scopeAfter} from './helpers/js-scope.mjs';
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const signature = 'async compile ({strict = false} = {}) {';
const compileBody = balancedFrom(source, source.indexOf(signature) + signature.length - 1, '{', '}');
const publishBody = scopeAfter(source, 'publishAppliedDevice (stc) {');
const devices = {arcade: {core: 'arcade'}, microbit: {core: 'microbit'}, uno: {core: 'avr'}};
const Event = class { constructor (type, options) { this.type = type; this.detail = options.detail; } };
const setup = ({program = 'DEVICE ARCADE', parseError, loadError, deferred = false, setStc = true} = {}) => {
    const events = [], calls = [];
    const window = {dispatchEvent: event => events.push(event)};
    let finishLoad;
    const pendingLoad = new Promise(resolve => { finishLoad = resolve; });
    const runtime = {bwDeviceId: 'microbit', bwDeviceCore: 'microbit', stc: {device: 'microbit'},
        targets: [], getTargetForStage: () => null};
    const vm = {runtime, extensionManager: {refreshBlocks () {}},
        async loadProject () { calls.push('load'); if (loadError) throw new Error(loadError); if (deferred) await pendingLoad; calls.push('loaded'); },
        toJSON: () => JSON.stringify({targets: []})};
    if (setStc) vm.setStc = stc => { calls.push('stc'); runtime.stc = stc; };
    class Creator {
        constructor () { this.warnings = []; this.project = {targets: []}; }
        parse (text) { if (parseError) throw new Error(parseError); const device = text.match(/^DEVICE\s+(\S+)/im)?.[1]; this.project.stc = device ? {device: device.toLowerCase()} : null; }
        async generateSB3 () { return {arrayBuffer: async () => new ArrayBuffer(0)}; }
        generatePython () { return ''; }
        generateJavaScript () { return ''; }
        generateC () { return ''; }
        generateBASIC () { return {ok: true, basic: ''}; }
        generateMicroPython () { return {ok: true, py: ''}; }
    }
    const component = {props: {vm}, state: {lang: 'pseudocode', buffers: {pseudocode: program},
        uploads: [], basicProfile: 'ms', basicLineNumbers: false},
        L: {stCompiling: 'compiling', stLoaded: 'loaded', stError: error => error},
        setState (patch) { Object.assign(this.state, patch); },
        activeCode () { return this.state.buffers.pseudocode; },
        lib: async () => ({default: Creator}), genOpts: () => ({})};
    component.publishAppliedDevice = new Function('DEVICE_BY_ID', 'window', 'CustomEvent',
        `return function (stc) ${publishBody}`)(devices, window, Event);
    component.compile = new Function('TWO_WAY', 'classifyConversionWarnings', 'LANG_LABEL', 'window',
        `return async function ({strict = false} = {}) ${compileBody}`)(new Set(['pseudocode']),
        () => ({changed: [], unsupported: []}), {pseudocode: 'Pseudocode'}, window);
    return {component, runtime, events, calls, finishLoad};
};

test('DEVICE ARCADE is published only after the generated project loads', async () => {
    const {component, runtime, events, calls, finishLoad} = setup({deferred: true});
    const compiling = component.compile();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['load']);
    assert.equal(runtime.bwDeviceId, 'microbit');
    assert.deepEqual(events, []);
    finishLoad(); await compiling;
    assert.deepEqual(calls, ['load', 'loaded', 'stc']);
    assert.equal(runtime.bwDeviceId, 'arcade');
    assert.equal(runtime.bwDeviceCore, 'arcade');
    assert.deepEqual(events.map(event => [event.type, event.detail]),
        [['bw-settings-change', {key: 'bw-device-id', value: 'arcade'}]]);
    assert.equal(component.state.status, 'loaded');
});
for (const failure of [{parseError: 'invalid source'}, {loadError: 'bad archive'}]) {
    test(`failed application retains previous device: ${Object.values(failure)[0]}`, async () => {
        const {component, runtime, events} = setup(failure);
        await component.compile();
        assert.equal(runtime.bwDeviceId, 'microbit');
        assert.equal(runtime.bwDeviceCore, 'microbit');
        assert.deepEqual(events, []);
        assert.equal(component.state.conversionReport.preserved, false);
    });
}
test('a successfully applied ordinary Scratch project clears stale device hints', async () => {
    const {component, runtime, events} = setup({program: 'SPRITE Game:'});
    await component.compile();
    assert.equal(runtime.bwDeviceId, null); assert.equal(runtime.bwDeviceCore, null);
    assert.deepEqual(events.map(event => event.detail), [{key: 'bw-device-id', value: ''}]);
});
test('fallback VM metadata path publishes the actual parsed target too', async () => {
    const {component, runtime, events} = setup({program: 'DEVICE UNO', setStc: false});
    await component.compile();
    assert.equal(runtime.stc.device, 'uno'); assert.equal(runtime.bwDeviceId, 'uno');
    assert.equal(runtime.bwDeviceCore, 'avr'); assert.equal(events.length, 1);
});
