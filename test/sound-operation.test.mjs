import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
// Explicit GUI package scope, matching the existing pane tests.
const guiRequire = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const babel = guiRequire('@babel/core');
const parse = text => babel.parseSync(text, {babelrc: false, configFile: false, parserOpts: {plugins: ['jsx']}});
const source = readFileSync(new URL('../overlay/scratch-gui/src/containers/sound-editor.jsx', import.meta.url), 'utf8');
const ast = parse(source);
const editor = ast.program.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'SoundEditor');
const names = ['currentSoundOperation', 'runSoundOperation', 'submitNewSamples', 'handleUndo', 'handleRedo',
    'handleEffect', 'handleUpdateTrim', 'hasTrimSelection', 'hasTrimSelectionForLength',
    'handleDelete', 'handleDeleteInverse',
    'handlePaste', 'paste',
    'componentDidMount', 'handleKeyPress', 'componentWillReceiveProps', 'componentWillUnmount', 'resampleBufferToRate'];
const methods = editor.body.body.filter(n => n.type === 'ClassMethod' && names.includes(n.key.name));
assert.equal(methods.length, names.length);
let encodes, renders, registered;
const audioWindow = {};
const WavEncoder = {encode: () => new Promise((resolve, reject) => encodes.push({resolve, reject}))};
class AudioBufferPlayer {
    constructor (samples, sampleRate) { this.buffer = {length: samples.length, sampleRate, getChannelData: () => samples}; }
    stop () {}
}
class AudioEffects {
    constructor (buffer) { this.buffer = buffer; }
    process (callback) { return new Promise((resolve, reject) => renders.push({complete: () => {callback(this.buffer, 0, 1); resolve();}, reject})); }
}
const Methods = vm.runInNewContext(`(class {${methods.map(n => source.slice(n.start, n.end)).join('\n')}})`, {
    WavEncoder, AudioBufferPlayer, AudioEffects, UNDO_STACK_SIZE: 99,
    notifyUndoState: () => {}, computeChunkedRMS: () => [], downsampleIfNeeded: v => Promise.resolve(v),
    log: {error: () => {}}, document: {removeEventListener: () => {}, addEventListener: () => {}},
    window: audioWindow, dropEveryOtherSample: buffer => buffer,
    HTMLInputElement: class {}, registerUndoSurface: (name, surface) => { registered = surface; return () => {}; },
    activateUndoSurface: () => {}
});
const samples = n => new Float32Array([n, n]);
const item = n => ({samples: samples(n), sampleRate: 48000, trimStart: 0.1, trimEnd: 0.8});
const fixture = () => {
    encodes = []; renders = [];
    const writes = [], sound = {soundId: 'first'}, target = {sprite: {sounds: [sound]}};
    const vm = {editingTarget: target, runtime: {targets: [target]},
        updateSoundBuffer: (index, buffer) => writes.push([index, buffer.getChannelData(0)[0]])};
    const o = new Methods();
    o.props = {vm, soundId: 'first', soundIndex: 0, samples: samples(2), sampleRate: 48000};
    o.soundTarget = target; o.soundObject = sound; o.soundUnmounted = false; o.soundOperation = null;
    o.undoStack = [item(1)]; o.undoLabels = ['old']; o.redoStack = []; o.redoLabels = []; o.stepLabel = null;
    o.state = {trimStart: 0.2, trimEnd: 0.7, copyBuffer: {samples: samples(3), sampleRate: 48000}};
    o.audioBufferPlayer = new AudioBufferPlayer(samples(2), 48000);
    o.copyCurrentBuffer = () => ({samples: o.audioBufferPlayer.buffer.getChannelData(0), sampleRate: 48000});
    o.getUndoItem = () => ({...o.copyCurrentBuffer(), trimStart: o.state.trimStart, trimEnd: o.state.trimEnd});
    o.setState = (state, callback) => { Object.assign(o.state, state); if (callback) callback(); };
    o.handlePlay = () => { o.played = true; };
    o.handleStopPlaying = () => {};
    o.resetState = s => { o.audioBufferPlayer = new AudioBufferPlayer(s, 48000); };
    o.resampleBufferToRate = input => Promise.resolve(input);
    return {o, writes, vm, target};
};
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const resolveEncode = () => encodes.shift().resolve(new ArrayBuffer(4));

test('successful undo and redo move one stack entry and retain trim/playback', async () => {
    const {o, writes} = fixture(); const undo = o.handleUndo(); await tick(); resolveEncode();
    assert.equal(await undo, true); assert.equal(o.undoStack.length, 0); assert.equal(o.redoStack.length, 1);
    assert.equal(o.state.trimStart, 0.1); assert.equal(o.played, true); assert.equal(writes[0][1], 1);
    const redo = o.handleRedo(); await tick(); resolveEncode(); assert.equal(await redo, true);
    assert.equal(o.undoStack.length, 1); assert.equal(o.redoStack.length, 0); assert.equal(writes[1][1], 2);
});

test('encoding refusal preserves sound, stacks, labels and trim', async () => {
    const {o, writes} = fixture(); const undo = o.handleUndo(); await tick(); encodes.shift().reject(new Error('fail'));
    assert.equal(await undo, false); assert.equal(writes.length, 0); assert.equal(o.undoStack.length, 1);
    assert.equal(o.undoLabels[0], 'old'); assert.equal(o.redoStack.length, 0); assert.equal(o.state.trimStart, 0.2);
    assert.equal(o.state.soundBusy, false);
});

test('keyboard delete and crop require a real nonempty selection', async () => {
    const {o, writes} = fixture();
    o.state.trimStart = null; o.state.trimEnd = null;
    let prevented = 0;
    for (const shiftKey of [false, true]) {
        o.handleKeyPress({target: {}, key: 'Delete', shiftKey, metaKey: false, ctrlKey: false,
            preventDefault: () => { prevented++; }});
        await tick();
        assert.equal(encodes.length, 0, 'no WAV encoding without a selection');
    }
    assert.equal(prevented, 2);
    for (const [start, end] of [[0.3, 0.3], [0.1, 0.2], [NaN, 0.5], [-0.1, 0.5], [0.3, 1.1]]) {
        o.state.trimStart = start; o.state.trimEnd = end;
        assert.equal(await o.handleDelete(), false);
        assert.equal(await o.handleDeleteInverse(), false);
        assert.equal(encodes.length, 0);
    }
    assert.equal(writes.length, 0);
    assert.equal(o.undoStack.length, 1);
    assert.equal(o.undoLabels[0], 'old');
    assert.equal(o.state.soundBusy, undefined);
});

test('a valid crop and whole-selection delete still write one Undoable sound', async () => {
    let {o, writes} = fixture();
    o.state.trimStart = 0.2; o.state.trimEnd = 0.8;
    const crop = o.handleDeleteInverse(); await tick();
    assert.equal(encodes.length, 1); resolveEncode(); assert.equal(await crop, true);
    assert.deepEqual(Array.from(o.audioBufferPlayer.buffer.getChannelData(0)), [2]);
    assert.deepEqual(writes, [[0, 2]]);
    assert.deepEqual(o.undoLabels, ['old', 'Crop']);

    ({o, writes} = fixture());
    o.state.trimStart = 0; o.state.trimEnd = 1;
    const removeAll = o.handleDelete(); await tick();
    assert.equal(encodes.length, 1); resolveEncode(); assert.equal(await removeAll, true);
    assert.deepEqual(Array.from(o.audioBufferPlayer.buffer.getChannelData(0)), [0]);
    assert.deepEqual(writes, [[0, 0]]);
    assert.deepEqual(o.undoLabels, ['old', 'Delete selection']);
});

test('busy history visibly refuses effect, paste, delete and trim', async () => {
    const {o, writes} = fixture(); const undo = o.handleUndo(); await tick();
    assert.equal(await o.handleEffect('reverse'), false); assert.equal(await o.handlePaste(), false);
    assert.equal(await o.handleDelete(), false); assert.equal(await o.handleDeleteInverse(), false);
    o.handleUpdateTrim(0.3, 0.4); assert.equal(o.state.trimStart, 0.2);
    assert.equal(o.state.soundBusyNotice, true); assert.equal(renders.length, 0);
    resolveEncode(); assert.equal(await undo, true); assert.equal(writes.length, 1);
});

test('effect rendering remains busy until encoding and refuses history', async () => {
    const {o, writes} = fixture(); const effect = o.handleEffect('reverse'); await tick();
    assert.equal(await o.handleUndo(), false); assert.equal(o.state.soundBusyNotice, true);
    renders.shift().complete(); await tick(); assert.equal(await o.handleUndo(), false);
    resolveEncode(); assert.equal(await effect, true); assert.equal(o.state.soundBusy, false);
    assert.equal(writes.length, 1); assert.equal(o.undoStack.length, 2);
});

test('effect render rejection releases the busy operation', async () => {
    const {o} = fixture(); const effect = o.handleEffect('reverse'); await tick(); renders.shift().reject(new Error('render'));
    assert.equal(await effect, false); assert.equal(o.state.soundBusy, false); assert.equal(o.soundOperation, null);
});

for (const change of ['sound', 'target', 'unmount']) {
    test(`in-flight undo cannot write after ${change} replacement`, async () => {
        const {o, vm, writes} = fixture(); const undo = o.handleUndo(); await tick();
        if (change === 'sound') {
            const other = {soundId: 'second'}; vm.editingTarget.sprite.sounds.push(other);
            const next = {...o.props, soundIndex: 1, soundId: 'second', samples: samples(8)};
            o.componentWillReceiveProps(next); o.props = next;
        } else if (change === 'target') {
            vm.editingTarget = {sprite: {sounds: [{soundId: 'first'}]}};
        } else o.componentWillUnmount();
        resolveEncode(); assert.equal(await undo, false); assert.equal(writes.length, 0);
        if (change === 'sound') assert.equal(o.undoStack.length, 0);
    });
}

test('old completion cannot unlock a new sound operation after selection change', async () => {
    const {o, vm, writes} = fixture(); const old = o.handleUndo(); await tick();
    vm.editingTarget.sprite.sounds.push({soundId: 'second'});
    const next = {...o.props, soundIndex: 1, soundId: 'second', samples: samples(8)};
    o.componentWillReceiveProps(next); o.props = next;
    o.undoStack.push(item(7)); o.undoLabels.push('second edit');
    const current = o.handleUndo(); await tick();
    resolveEncode(); assert.equal(await old, false); assert.equal(o.state.soundBusy, true);
    assert.equal(await o.handleRedo(), false);
    resolveEncode(); assert.equal(await current, true); assert.deepEqual(writes, [[1, 7]]);
});

test('stale effect callback after selection change never starts encoding', async () => {
    const {o, vm, writes} = fixture(); const effect = o.handleEffect('reverse'); await tick();
    vm.editingTarget.sprite.sounds.push({soundId: 'second'});
    const next = {...o.props, soundIndex: 1, soundId: 'second', samples: samples(8)};
    o.componentWillReceiveProps(next); o.props = next;
    renders.shift().complete(); assert.equal(await effect, false);
    assert.equal(encodes.length, 0); assert.equal(writes.length, 0);
});

test('stale paste resampling after target replacement never starts encoding', async () => {
    const {o, vm, writes} = fixture(); let finish;
    o.state.copyBuffer = {samples: samples(3), sampleRate: 24000};
    o.resampleBufferToRate = () => new Promise(resolve => { finish = resolve; });
    const paste = o.handlePaste(); await tick();
    vm.editingTarget = {sprite: {sounds: [{soundId: 'first'}]}};
    finish({samples: samples(3), sampleRate: 48000}); assert.equal(await paste, false);
    assert.equal(encodes.length, 0); assert.equal(writes.length, 0);
});


test('the mounted shared surface and keyboard refuse a second undo rather than queueing it', async () => {
    const {o, writes} = fixture(); o.componentDidMount();
    const first = registered.undo(); await tick();
    assert.equal(await registered.undo(), false);
    const event = {target: {}, key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, preventDefault: () => {}};
    o.handleKeyPress(event); assert.equal(o.state.soundBusyNotice, true);
    resolveEncode(); assert.equal(await first, true); await tick();
    assert.equal(writes.length, 1); assert.equal(encodes.length, 0);
});

test('a new VM target with the same sound ID resets the old surface stacks', async () => {
    const {o, vm} = fixture();
    vm.editingTarget = {sprite: {sounds: [{soundId: 'first'}]}};
    const next = {...o.props, samples: samples(8)};
    o.componentWillReceiveProps(next); o.props = next;
    assert.equal(o.undoStack.length, 0); assert.equal(o.redoStack.length, 0);
    assert.equal(o.audioBufferPlayer.buffer.getChannelData(0)[0], 8);
});

test('constructor records the initial target and sound synchronously', () => {
    const constructor = editor.body.body.find(n => n.type === 'ClassMethod' && n.kind === 'constructor');
    class Component { constructor (props) { this.props = props; } }
    const Constructor = vm.runInNewContext(`(class extends Component {${source.slice(constructor.start, constructor.end)}})`, {
        Component, bindAll: () => {}, computeChunkedRMS: () => []
    });
    const sound = {soundId: 'first'}, target = {sprite: {sounds: [sound]}};
    const instance = new Constructor({vm: {editingTarget: target}, soundIndex: 0, samples: samples(1)});
    assert.equal(instance.soundTarget, target); assert.equal(instance.soundObject, sound);
    assert.equal(instance.soundOperation, null); assert.equal(instance.soundUnmounted, false);
});

test('the actual effect helper returns the offline rendering rejection', async () => {
    const text = readFileSync(new URL('../overlay/scratch-gui/src/lib/audio/audio-effects.js', import.meta.url), 'utf8');
    const parsed = parse(text);
    const cls = parsed.program.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'AudioEffects');
    const method = cls.body.body.find(n => n.type === 'ClassMethod' && n.key.name === 'process');
    const Effect = vm.runInNewContext(`(class {${text.slice(method.start, method.end)}})`, {effectTypes: {}});
    const instance = new Effect(); const failure = new Error('offline rendering');
    instance.name = 'reverse'; instance.source = {connect: () => {}, start: () => {}};
    instance.audioContext = {destination: {}, startRendering: () => Promise.reject(failure)};
    await assert.rejects(instance.process(() => {}), error => error === failure);
});

test('disabling trim cancels both drag recognizers and restores displayed selection', () => {
    const text = readFileSync(new URL('../overlay/scratch-gui/src/containers/audio-selector.jsx', import.meta.url), 'utf8');
    const parsed = parse(text);
    const cls = parsed.program.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'AudioSelector');
    const method = cls.body.body.find(n => n.type === 'ClassMethod' && n.key.name === 'componentWillReceiveProps');
    const Selector = vm.runInNewContext(`(class {${text.slice(method.start, method.end)}})`);
    const selector = new Selector(); let resets = 0;
    selector.props = {trimStart: 0.2, trimEnd: 0.8, disabled: false};
    selector.state = {trimStart: 0.3, trimEnd: 0.7};
    selector.trimStartDragRecognizer = {reset: () => { resets++; }};
    selector.trimEndDragRecognizer = {reset: () => { resets++; }};
    selector.setState = state => Object.assign(selector.state, state);
    selector.componentWillReceiveProps({...selector.props, disabled: true});
    assert.equal(resets, 2); assert.equal(selector.state.trimStart, 0.2); assert.equal(selector.state.trimEnd, 0.8);
});

test('busy controls disable edits but keep sound playback and copying available', () => {
    const text = readFileSync(new URL('../overlay/scratch-gui/src/components/sound-editor/sound-editor.jsx', import.meta.url), 'utf8');
    const parsed = parse(text);
    const traverse = babel.traverse;
    const controls = new Map(); let selector;
    traverse(parsed, {JSXOpeningElement(path) {
        const attrs = path.node.attributes.filter(a => a.type === 'JSXAttribute');
        const click = attrs.find(a => a.name.name === 'onClick');
        const disabled = attrs.find(a => a.name.name === 'disabled');
        if (click && click.value.type === 'JSXExpressionContainer') {
            const handler = text.slice(click.value.expression.start, click.value.expression.end);
            const expr = disabled && text.slice(disabled.value.expression.start, disabled.value.expression.end);
            controls.set(handler, expr);
        }
        if (path.node.name.type === 'JSXIdentifier' && path.node.name.name === 'AudioSelector') {
            const attr = attrs.find(a => a.name.name === 'disabled');
            selector = text.slice(attr.value.expression.start, attr.value.expression.end);
        }
    }});
    const props = {editingBusy: true, canUndo: true, canRedo: true, canPaste: true, trimStart: 0.1, tooLoud: false};
    for (const action of ['Undo', 'Redo', 'Paste', 'Delete', 'Faster', 'Slower', 'Louder', 'Softer', 'Mute',
        'FadeIn', 'FadeOut', 'Reverse', 'Robot', 'CopyToNew']) {
        assert.equal(vm.runInNewContext(controls.get(`props.on${action}`), {props}), true, `${action} must be disabled`);
    }
    for (const action of ['Play', 'Stop', 'Copy']) assert.equal(controls.get(`props.on${action}`), undefined);
    assert.equal(vm.runInNewContext(selector, {props}), true);
});


test('removed project target is invalid even while editingTarget still references it', async () => {
    const {o, vm, target, writes} = fixture();
    const undo = o.handleUndo(); await tick();
    vm.runtime.targets = [];
    assert.equal(vm.editingTarget, target);
    resolveEncode(); assert.equal(await undo, false);
    assert.equal(writes.length, 0); assert.equal(o.undoStack.length, 1);
});


const resamplerContext = mode => {
    const observation = {handlerInstalled: false};
    class Context {
        constructor () { this.destination = {}; }
        createBufferSource () { return {connect: () => {}, start: () => {}}; }
        createBuffer (channels, length) {
            const data = new Float32Array(length);
            return {getChannelData: () => data};
        }
        startRendering () {
            observation.handlerInstalled = typeof this.oncomplete === 'function';
            if (mode === 'reject') {
                const promise = Promise.reject(new Error('offline resampling failed'));
                promise.catch(() => {}); // Let the original method fail the assertion without an unhandled rejection.
                return promise;
            }
            queueMicrotask(() => this.oncomplete({renderedBuffer: {getChannelData: () => new Float32Array([1, 2, 3, 4])}}));
            return mode === 'callback-only' ? undefined : Promise.resolve();
        }
    }
    if (mode === 'callback-only') { audioWindow.OfflineAudioContext = null; audioWindow.webkitOfflineAudioContext = Context; }
    else { audioWindow.OfflineAudioContext = Context; audioWindow.webkitOfflineAudioContext = null; }
    return observation;
};

test('actual resampler rejection releases a pending paste lock', async () => {
    const {o, writes} = fixture();
    const observed = resamplerContext('reject');
    o.resampleBufferToRate = Methods.prototype.resampleBufferToRate.bind(o);
    o.state.copyBuffer = {samples: samples(3), sampleRate: 24000};
    let result = 'pending';
    const job = o.handlePaste().then(value => { result = value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result, false);
    assert.equal(observed.handlerInstalled, true);
    assert.equal(o.state.soundBusy, false);
    assert.equal(o.soundOperation, null);
    assert.equal(o.state.soundError, true);
    assert.equal(writes.length, 0);
    await job;
});

for (const mode of ['promise', 'callback-only']) {
    test(`actual resampler ${mode} completion preserves samples and rate`, async () => {
        const {o} = fixture();
        const observed = resamplerContext(mode);
        const result = await Methods.prototype.resampleBufferToRate.call(o, {samples: samples(3), sampleRate: 24000}, 48000);
        assert.equal(observed.handlerInstalled, true);
        assert.deepEqual(Array.from(result.samples), [1, 2, 3, 4]);
        assert.equal(result.sampleRate, 48000);
    });
}
