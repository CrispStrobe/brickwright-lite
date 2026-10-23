import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {conversionFailure} from '../overlay/scratch-gui/src/lib/bw-conversion-error.js';
import {codeArtworkMatches} from '../overlay/scratch-gui/src/lib/bw-code-artwork.js';
import {balancedFrom} from './helpers/js-scope.mjs';
import {VM} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';

test('serialized and object VM diagnostics retain every SB3 path and omit unrelated SB2 errors', () => {
    const error = {validationError: 'Invalid project', sb2Errors: [{message: 'missing objName'}], sb3Errors: [
        {dataPath: '.targets[1].costumes', message: 'duplicate costumes'},
        {instancePath: '/targets/0/blocks', message: 'invalid blocks'}
    ]};
    for (const value of [error, JSON.stringify(error)]) {
        const result = conversionFailure(value);
        assert.deepEqual(result.issues, ['.targets[1].costumes: duplicate costumes', '/targets/0/blocks: invalid blocks']);
        assert.match(result.message, /Invalid project/);
        assert.doesNotMatch(result.message, /objName|undefined/);
    }
    assert.deepEqual(conversionFailure(new Error('Broken asset')), {message: 'Broken asset', issues: ['Broken asset']});
    assert.equal(conversionFailure('plain rejection').message, 'plain rejection');
    const cyclic = {}; cyclic.self = cyclic;
    for (const value of [undefined, cyclic]) assert.match(conversionFailure(value).message, /without an error message/);
});

test('actual Code compile catch displays a real VM serialized validation rejection and preserves the loaded project', async () => {
    const source = await fs.readFile(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    const signature = 'async compile ({strict = false, pseudocode = null} = {})';
    const body = balancedFrom(source, source.indexOf(signature) + signature.length, '{', '}', 'Code compile');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    // DOS_LANG / generateDosLangs: the fe and Tcl tabs compile() also reads and
    // regenerates; none here.
    const compile = new AsyncFunction('TWO_WAY', 'LANG_LABEL', 'codeArtworkMatches', 'conversionFailure', 'DOS_LANG', 'generateDosLangs',
        `return async function ({strict = false, pseudocode = null} = {}) ${body}`);
    const execute = await compile(new Set(['pseudocode']), {pseudocode: 'Pseudocode'}, codeArtworkMatches, conversionFailure,
        {}, async () => ({}));
    class InvalidCostumes extends Creator {
        async generateSB3 () {
            const zip = await JSZip.loadAsync(await (await super.generateSB3()).arrayBuffer());
            const project = JSON.parse(await zip.file('project.json').async('text'));
            const target = project.targets.find(row => row.costumes.length);
            target.costumes.push(structuredClone(target.costumes[0]));
            zip.file('project.json', JSON.stringify(project));
            return new Blob([await zip.generateAsync({type: 'uint8array'})]);
        }
    }
    const vm = new VM();
    const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    vm.attachStorage(new Storage());
    const baseline = new Creator(); baseline.parse('SPRITE Game:\nWHEN flag clicked:\n  say "ready"');
    await vm.loadProject(await (await baseline.generateSB3()).arrayBuffer());
    const stage = vm.runtime.getTargetForStage(), before = vm.toJSON();
    const context = {props: {vm}, state: {lang: 'pseudocode', uploads: []}, _animationImport: null, _codeArtwork: null,
        L: {stCompiling: 'Compiling', stError: message => `Error: ${message}`},
        activeCode: () => 'SPRITE Game:\nWHEN flag clicked:\n  say "changed"',
        lib: async () => ({default: InvalidCostumes}), setState (patch) {
            // Match React's functional updater contract as well as object patches.
            const update = typeof patch === 'function' ? patch(this.state) : patch;
            if (update) Object.assign(this.state, update);
        }};
    try {
        await execute.call(context);
        assert.match(context.state.status, /Could not parse as a valid SB2 or SB3 project/);
        assert.match(context.state.status, /\.targets\[\d+\]\.costumes:.*duplicate/);
        assert.doesNotMatch(context.state.status, /undefined|objName/);
        assert.equal(context.state.conversionReport.preserved, false);
        assert.ok(context.state.conversionReport.unsupported.every(issue => issue.includes('costumes')));
        assert.equal(context.state.busy, false);
        assert.strictEqual(vm.runtime.getTargetForStage(), stage);
        assert.equal(vm.toJSON(), before);
        await assert.rejects(execute.call(context, {strict: true}), rejection => typeof rejection === 'string' && rejection.includes('uniqueItems'));
        assert.equal(context.state.busy, false);
    } finally {vm.quit();}
});


test('Arcade reporting is isolated from existing Blocks/Code reports and observer errors', async () => {
    const source = await fs.readFile(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    const extract = signature => balancedFrom(source, source.indexOf(signature) + signature.length, '{', '}', signature).slice(1, -1);
    const invalidate = new Function(extract('invalidateArcadeReport ()'));
    const publish = new Function('request', 'out', 'operation', 'outcome', extract('publishArcadeReport (request, out, operation, outcome)'));
    const prior = {direction: 'Code → Blocks', preserved: true, changed: [], unsupported: []};
    const c = {props: {vm: {}}, state: {conversionReport: prior}, setState (patch) {Object.assign(this.state, patch);}};
    invalidate.call(c);assert.strictEqual(c.state.conversionReport, prior, 'ordinary conversion report remains owned by its original journey');
    const request = {vm: c.props.vm, revision: c._arcadeReportRevision};c._arcadeReportRequest = request;
    const original = new Error('report delivery failed');c.setState = () => {throw original;};
    assert.doesNotThrow(() => publish.call(c, request, {unsupported: ['original refusal']}, 'export', 'source saved'));
    assert.strictEqual(c.state.conversionReport, prior, 'a report transport failure does not invent a new result');
    const exportBody = extract('async exportArcade ()');
    assert.match(exportBody, /await downloadBlob/);assert.match(exportBody, /this\.L\.mcFailed\('MakeCode Arcade'/);
    assert.match(source, /if \(this\._unmounted \|\| this\._arcadeReportRequest !== request/);
});

// Execute only the extracted observer against synthetic data/fibers. These are
// source controls, never a claim about a mounted production GUI or browser.
const cleanExportObserver = async () => {
    const source = await fs.readFile(new URL('../scripts/verify-arcade-numeric-authoring-gui.mjs', import.meta.url), 'utf8');
    const signature = 'const observeCleanExport = (element, {phase, held, visibleText}) =>';
    const at = source.indexOf(signature);assert.ok(at >= 0, 'actual observer declaration');
    const body = balancedFrom(source, at + signature.length, '{', '}', 'clean export observer').slice(1, -1);
    return new Function('window', 'element', 'args', `const {phase, held, visibleText} = args;\n${body}`);
};
const cleanExportFixture = (key = '__reactFiber$sourceControl') => {
    let methods = 0;
    const forbidden = () => { methods++;throw new Error('observer called a product method'); };
    const vm = {toJSON: forbidden}, instance = {props: {vm}, state: {conversionReport: null, busy: false},
        _arcadeReportRequest: null, _arcadeReportRevision: 7, _unmounted: false,
        setState: forbidden, exportArcade: forbidden, arcadeFromStage: forbidden};
    const fiber = {stateNode: instance, return: null}, element = {[key]: fiber, parentElement: null};
    const window = {__brickwrightStore: {getState: () => ({scratchGui: {vm}})}};
    const observation = {schema: 'arcade-clean-export-observation-v1', origin: 'owned-json-export',
        captureStatus: 'COMPLETE', inputJson: '{"targets":[]}', resultJson: '{"unsupported":["receiver"]}',
        inputUtf8Bytes: 14, resultUtf8Bytes: 28, totalUtf8Bytes: 42, limitUtf8Bytes: 8388608};
    const publish = () => {
        instance._arcadeReportRequest = {vm, revision: 7};
        instance.state.conversionReport = {operation: 'export', unsupported: ['receiver'], observation};
    };
    return {window, element, fiber, instance, vm, observation, publish, methods: () => methods};
};

test('clean export observer retains the actual mount before one action and returns only current plain evidence', async () => {
    const observe = await cleanExportObserver();
    for (const key of ['__reactFiber$sourceControl', '__reactInternalInstance$sourceControl']) {
        const f = cleanExportFixture(key), held = observe(f.window, f.element, {phase: 'before'});
        assert.equal(held.status, 'READY');assert.strictEqual(held.instance, f.instance);assert.strictEqual(held.vm, f.vm);
        assert.equal(held.revision, 7);f.publish();
        const before = Object.getOwnPropertyDescriptors(f.instance), state = Object.getOwnPropertyDescriptors(f.instance.state);
        const result = observe(f.window, f.element, {phase: 'after', held, visibleText: 'Unsupported: receiver'});
        assert.deepEqual(result, f.observation);assert.notStrictEqual(result, f.observation);
        assert.ok(Object.values(result).every(value => typeof value === 'string' || typeof value === 'number'));
        assert.deepEqual(Object.getOwnPropertyDescriptors(f.instance), before);
        assert.deepEqual(Object.getOwnPropertyDescriptors(f.instance.state), state);assert.equal(f.methods(), 0);
    }
});

test('clean export observation refuses stale preconditions and foreign or changed post-action ownership', async () => {
    const observe = await cleanExportObserver(), refused = {captureStatus: 'UNAVAILABLE_FRESHNESS'};
    for (const edit of [
        f => { f.instance.state.conversionReport = {operation: 'export'}; },
        f => { f.instance._arcadeReportRequest = {vm: f.vm, revision: 7}; },
        f => { f.instance.state.busy = true; }, f => { f.instance._unmounted = true; }
    ]) {
        const f = cleanExportFixture();edit(f);assert.deepEqual(observe(f.window, f.element, {phase: 'before'}), refused);
    }
    for (const edit of [
        f => { f.fiber.stateNode = {...f.instance}; },
        f => { f.instance.props.vm = {}; }, f => { f.instance._arcadeReportRevision++; },
        f => { f.instance._arcadeReportRequest = null; },
        f => { f.instance._arcadeReportRequest.vm = {}; },
        f => { f.instance._arcadeReportRequest.revision++; },
        f => { f.instance._unmounted = true; }, f => { f.instance.state.busy = true; },
        f => { f.instance.state.conversionReport.operation = 'run'; }
    ]) {
        const f = cleanExportFixture(), held = observe(f.window, f.element, {phase: 'before'});assert.equal(held.status, 'READY');
        f.publish();edit(f);
        assert.deepEqual(observe(f.window, f.element, {phase: 'after', held, visibleText: 'Unsupported: receiver'}), refused);
        assert.equal(f.methods(), 0);
    }
    const f = cleanExportFixture(), held = observe(f.window, f.element, {phase: 'before'});f.publish();
    assert.deepEqual(observe(f.window, f.element, {phase: 'after', held, visibleText: 'Unsupported: nothing reported'}), refused);
});

test('clean export observer rejects missing ambiguous cyclic and incomplete fiber ancestry', async () => {
    const observe = await cleanExportObserver(), refused = {captureStatus: 'UNAVAILABLE_FRESHNESS'};
    for (const edit of [
        f => { delete f.element.__reactFiber$sourceControl; },
        f => { f.element.__reactFiber$second = f.fiber; },
        f => { f.fiber.return = {stateNode: {...f.instance}, return: null}; },
        f => { f.fiber.return = f.fiber; },
        f => { let tail = f.fiber;for (let i = 0; i < 129; i++) tail = tail.return = {stateNode: null, return: null}; }
    ]) {
        const f = cleanExportFixture();edit(f);assert.deepEqual(observe(f.window, f.element, {phase: 'before'}), refused);
        assert.equal(f.methods(), 0);
    }
});

test('clean export observer declines descriptor getters without invoking them or product methods', async () => {
    const observe = await cleanExportObserver(), refused = {captureStatus: 'UNAVAILABLE_FRESHNESS'};
    for (const slot of ['state', 'request', 'unsupported', 'observation', 'payload']) {
        const f = cleanExportFixture(), held = observe(f.window, f.element, {phase: 'before'});f.publish();let gets = 0;
        const [object, name] = slot === 'state' ? [f.instance, 'state'] : slot === 'request' ? [f.instance, '_arcadeReportRequest'] :
            slot === 'payload' ? [f.observation, 'inputJson'] : [f.instance.state.conversionReport, slot];
        Object.defineProperty(object, name, {configurable: true, get () {gets++;throw new Error('unexpected getter');}});
        assert.deepEqual(observe(f.window, f.element, {phase: 'after', held, visibleText: 'Unsupported: receiver'}), refused);
        assert.equal(gets, 0, slot);assert.equal(f.methods(), 0);
    }
});
