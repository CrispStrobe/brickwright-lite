import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {guiDependencyFile, INTEGRATED} from './helpers/bw-integrated.mjs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const shellPath = 'overlay/scratch-gui/src/lib/microbit-update.js';
const implementationPath = 'overlay/scratch-gui/src/lib/microbit-update-implementation.js';
const modalPath = 'overlay/scratch-gui/src/containers/connection-modal.jsx';
const stepPath = 'overlay/scratch-gui/src/components/connection-modal/update-peripheral-step.jsx';
const defer = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
let sequence = 0;
const shell = async () => {
    const source = read(shellPath);
    const needle = "import log from './log.js';";
    assert.equal(source.split(needle).length, 2);
    const body = source.replace(needle, 'const log = {info () {}};');
    return import(`data:text/javascript;base64,${Buffer.from(body).toString('base64')}#${sequence++}`);
};
const updater = async (usb, loadImplementation) => (await shell()).createMicroBitUpdater({
    getNavigator: () => ({usb}), loadImplementation
});

// Execute the exact owned implementation body with explicitly mocked transport,
// fetch and logging boundaries. This is no USB/firmware/hardware qualification.
const implementation = ({WebUSB, DAPLink, isUniversalHex = () => true,
    separateUniversalHex = () => [{boardId: 0x9900}, {boardId: 0x9903}], fetch, events}) => {
    const source = read(implementationPath);
    const begin = source.indexOf('/**\n * @typedef');
    assert.ok(begin > 0);
    const ending = '\nexport {updateMicroBit};\n';
    assert.ok(source.endsWith(ending));
    const body = source.slice(begin, -ending.length);
    const evaluate = new Function('WebUSB', 'DAPLink', 'isUniversalHex', 'separateUniversalHex',
        'keyMirror', 'log', 'hexUrl', 'fetch', 'TextEncoder', `${body}\nreturn updateMicroBit;`);
    return evaluate(WebUSB, DAPLink, isUniversalHex, separateUniversalHex,
        object => Object.fromEntries(Object.keys(object).map(key => [key, key])),
        {info: value => events.push(['log', value])}, 'owned-fixture.hex', fetch, TextEncoder);
};
const transport = (options = {}) => {
    const events = [], targets = [];
    class WebUSB {
        constructor (device) { this.device = device; events.push(['WebUSB', device]); }
    }
    class DAPLink {
        static EVENT_PROGRESS = 'owned-progress-event';
        constructor (value) {
            this.transport = value; this.connected = false; targets.push(this);
            events.push(['DAPLink', value]);
        }
        on (event, callback) { this.progress = callback; events.push(['on', event, callback]); }
        async connect () {
            events.push(['connect', this]);
            if (Object.hasOwn(options, 'connectFailure')) throw options.connectFailure;
            this.connected = true;
        }
        async flash (bytes) {
            events.push(['flash', this, bytes]);
            if (this.progress) this.progress(0.5);
            if (Object.hasOwn(options, 'flashFailure')) throw options.flashFailure;
        }
        async disconnect () {
            events.push(['disconnect', this]); this.connected = false;
            if (Object.hasOwn(options, 'disconnectFailure')) throw options.disconnectFailure;
        }
    }
    const text = options.text ?? 'complete original universal HEX bytes';
    const fetch = async url => {
        events.push(['fetch', url]);
        if (Object.hasOwn(options, 'fetchFailure')) throw options.fetchFailure;
        return {text: async () => text};
    };
    return {WebUSB, DAPLink, events, targets, fetch, text};
};

// Only these actual method bodies are evaluated; JSX/rendering is not modeled.
const method = (source, name) => {
    const pattern = new RegExp(`^    (?:async )?${name} \\(`, 'm');
    const start = source.search(pattern); assert.ok(start >= 0, name);
    const next = source.slice(start + 1).search(/^    (?:async )?[A-Za-z_$][\w$]* \(/m);
    const end = next < 0 ? source.indexOf('\n}', start) : start + 1 + next;
    assert.ok(end > start, name); return source.slice(start, end).trim();
};
const modal = select => {
    const names = ['componentDidUpdate', 'componentWillUnmount', 'handleScanning', 'handleDisconnect',
        'handleCancel', 'handleUpdatePeripheral', 'handleSendUpdate'];
    const functions = names.map(name => method(read(modalPath), name)).join(',\n');
    const object = new Function('selectAndUpdateMicroBit', 'analytics', 'PHASES', `return ({${functions}});`)(
        select, {event () {}}, {scanning: 'scanning', updatePeripheral: 'updatePeripheral'});
    const states = [], cancellations = [], removed = [];
    Object.assign(object, {_updateIntent: null, _updateDisposed: false,
        props: {extensionId: 'microbit', onCancel: () => cancellations.push(true),
            vm: {getPeripheralIsConnected: () => false, disconnectPeripheral () {},
                removeListener: (...args) => removed.push(args)}},
        setState: state => states.push(state)});
    return {object, states, cancellations, removed};
};
const step = send => {
    const functions = ['componentWillUnmount', 'handleSendUpdate'].map(name => method(read(stepPath), name)).join(',\n');
    const object = new Function('UPDATE_ACTIVITY', `return ({${functions}});`)(
        {sendUpdate: 'sendUpdate', results: 'results'});
    const states = [];
    Object.assign(object, {_updateIntent: null, _updateDisposed: false,
        props: {onSendPeripheralUpdate: send}, setState: state => states.push(state)});
    return {object, states};
};

test('eager shell and managed mirrors retain chooser-first and support contracts', async () => {
    for (const relative of ['lib/microbit-update.js', 'lib/microbit-update-implementation.js',
        'containers/connection-modal.jsx', 'components/connection-modal/update-peripheral-step.jsx']) {
        assert.equal(read(`overlay/scratch-gui/src/${relative}`), read(`packages/scratch-gui/src/${relative}`));
    }
    assert.doesNotMatch(read(shellPath), /from ['"](?:dapjs|@microbit\/microbit-universal-hex)['"]/);
    assert.match(read(shellPath), /webpackChunkName: "microbit-update"/);
    assert.match(read(implementationPath), /from 'dapjs'/);
    assert.match(read(implementationPath), /from '@microbit\/microbit-universal-hex'/);
    const chosen = defer(), calls = [];
    const usb = {requestDevice (options) { assert.equal(this, usb); calls.push(['chooser', options]); return chosen.promise; }};
    const progress = () => {};
    const run = await updater(usb, async () => { calls.push(['load']); return {updateMicroBit: (device, callback) => {
        calls.push(['update', device, callback]); return 'actual-return';
    }}; });
    assert.deepEqual(calls, [], 'factory/module evaluation never opens a device or acquires updater');
    const promise = run(progress);
    assert.equal(calls.length, 1, 'real chooser is invoked before yielding');
    assert.deepEqual(calls[0], ['chooser', {filters: [{vendorId: 0x0d28, productId: 0x0204}]}]);
    const device = Object.freeze({serialNumber: '99040001'}); chosen.resolve(device);
    assert.equal(await promise, 'actual-return');
    assert.deepEqual(calls.slice(1), [['load'], ['update', device, progress]]);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
        Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {usb}});
        assert.equal((await shell()).isMicroBitUpdateSupported(), true);
        Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
        assert.equal((await shell()).isMicroBitUpdateSupported(), false);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
        else delete globalThis.navigator;
    }
});

test('chooser cancellation rejection and inactive actions never acquire or start an updater', async () => {
    let loads = 0, requests = 0;
    const acquire = async () => { loads++; throw new Error('must not load'); };
    for (const device of [null, undefined]) {
        const run = await updater({requestDevice () { requests++; return Promise.resolve(device); }}, acquire);
        assert.equal(await run(), undefined);
    }
    for (const error of [Object.freeze(new Error('permission')), undefined, null, false, '', 0, -0, NaN]) {
        const run = await updater({requestDevice () { requests++; return Promise.reject(error); }}, acquire);
        await assert.rejects(run(), actual => Object.is(actual, error));
    }
    const run = await updater({requestDevice () { requests++; }}, acquire);
    const before = requests; assert.equal(await run(undefined, {isCurrent: () => false}), undefined);
    assert.equal(requests, before); assert.equal(loads, 0);
});

test('chunk failure retains exact rejection and a later selected action retries', async () => {
    const device = Object.freeze({serialNumber: '99040002'}), reason = Object.freeze(new Error('chunk'));
    let loads = 0, updates = 0;
    const run = await updater({requestDevice: async () => device}, async () => {
        if (++loads === 1) throw reason;
        return {updateMicroBit: (actual, progress) => { assert.equal(actual, device); assert.equal(progress, undefined); updates++; }};
    });
    await assert.rejects(run(), actual => actual === reason); assert.equal(updates, 0);
    await run(); assert.equal(loads, 2); assert.equal(updates, 1);
});

test('concurrent chooser and chunk completion retain each actual device and callback', async () => {
    const choices = [defer(), defer()], chunks = [defer(), defer()], events = [];
    let requests = 0, loads = 0;
    const run = await updater({requestDevice: () => choices[requests++].promise}, () => chunks[loads++].promise);
    const progressA = () => {}, progressB = () => {}, a = Object.freeze({name: 'A'}), b = Object.freeze({name: 'B'});
    const pa = run(progressA), pb = run(progressB);
    choices[1].resolve(b); await Promise.resolve(); choices[0].resolve(a); await Promise.resolve();
    assert.equal(loads, 2);
    chunks[1].resolve({updateMicroBit: (device, progress) => events.push([device, progress])});
    await pa; chunks[0].resolve({updateMicroBit: (device, progress) => events.push([device, progress])}); await pb;
    assert.deepEqual(events, [[a, progressA], [b, progressB]]);
});

test('cancellation while chooser or chunk is pending prevents transport start without swallowing errors', async () => {
    for (const stage of ['chooser', 'chunk']) {
        let current = true, loads = 0, updates = 0;
        const chosen = defer(), chunk = defer(), device = {};
        const run = await updater({requestDevice: () => chosen.promise}, () => { loads++; return chunk.promise; });
        const result = run(undefined, {isCurrent: () => current});
        if (stage === 'chooser') { current = false; chosen.resolve(device); }
        else { chosen.resolve(device); await Promise.resolve(); current = false; chunk.resolve({updateMicroBit: () => { updates++; }}); }
        await result; assert.equal(updates, 0); assert.equal(loads, stage === 'chooser' ? 0 : 1);
    }
    let current = true; const chunk = defer(), reason = Object.freeze(new Error('cancelled load'));
    const run = await updater({requestDevice: async () => ({})}, () => chunk.promise);
    const pending = run(undefined, {isCurrent: () => current}); await Promise.resolve(); current = false; chunk.reject(reason);
    await assert.rejects(pending, actual => actual === reason);
});

test('unchanged implementation retains transport receiver bytes progress and disconnect ordering', async () => {
    const fixture = transport(), device = Object.freeze({serialNumber: '99040003'}), progress = [];
    const update = implementation(fixture);
    await update(device, value => progress.push(value));
    const calls = fixture.events.filter(row => row[0] !== 'log');
    assert.deepEqual(calls.map(row => row[0]), ['WebUSB', 'DAPLink', 'on', 'fetch', 'connect', 'flash', 'disconnect']);
    assert.equal(calls[0][1], device); assert.equal(calls[1][1], fixture.targets[0].transport);
    assert.equal(calls[2][1], fixture.DAPLink.EVENT_PROGRESS); assert.equal(calls[4][1], fixture.targets[0]);
    assert.equal(calls[5][1], fixture.targets[0]); assert.equal(calls[6][1], fixture.targets[0]);
    assert.deepEqual(calls[5][2], new TextEncoder().encode(fixture.text), 'preserve original complete HEX byte delivery');
    assert.deepEqual(progress, [0.5]); assert.equal(fixture.targets[0].connected, false);
});

test('unchanged implementation preserves error identity and existing cleanup precedence', async () => {
    const device = {serialNumber: '99040004'};
    for (const reason of [Object.freeze(new Error('failure')), undefined, null, false, '', 0, -0, NaN]) {
        for (const field of ['fetchFailure', 'connectFailure', 'flashFailure', 'disconnectFailure']) {
            const fixture = transport({[field]: reason}), update = implementation(fixture);
            await assert.rejects(update(device), actual => Object.is(actual, reason));
            const disconnects = fixture.events.filter(row => row[0] === 'disconnect');
            assert.equal(disconnects.length, ['flashFailure', 'disconnectFailure'].includes(field) ? 1 : 0);
        }
    }
    const primary = Object.freeze(new Error('flash')), secondary = Object.freeze(new Error('disconnect'));
    const fixture = transport({flashFailure: primary, disconnectFailure: secondary});
    await assert.rejects(implementation(fixture)(device), actual => actual === secondary, 'existing finally failure precedence is retained');
    const progressFailure = Object.freeze(new Error('progress')), normal = transport();
    await assert.rejects(implementation(normal)(device, () => { throw progressFailure; }), actual => actual === progressFailure);
    assert.equal(normal.events.filter(row => row[0] === 'disconnect').length, 1);
    const invalid = transport(); await assert.rejects(implementation(invalid)({serialNumber: 'not-a-microbit'}), /Could not identify micro:bit board version/);
    assert.equal(invalid.events.some(row => row[0] === 'fetch' || row[0] === 'connect'), false);
});

test('modal ownership retires pending acquisition on close replacement extension ABA and disposal', async () => {
    for (const retire of ['handleCancel', 'handleDisconnect', 'handleScanning', 'handleUpdatePeripheral', 'componentWillUnmount', 'extensionABA']) {
        const chosen = defer(), chunk = defer(), device = {}, progress = [], events = [];
        const run = await updater({requestDevice: () => chosen.promise}, () => chunk.promise);
        const {object, cancellations} = modal(run); const result = object.handleSendUpdate(value => progress.push(value));
        chosen.resolve(device); await Promise.resolve();
        if (retire === 'extensionABA') {
            object.props = {...object.props, extensionId: 'other'}; object.componentDidUpdate({extensionId: 'microbit'});
            object.props = {...object.props, extensionId: 'microbit'}; object.componentDidUpdate({extensionId: 'other'});
        } else object[retire]();
        chunk.resolve({updateMicroBit: (...args) => events.push(args)}); await result;
        assert.deepEqual(events, [], retire); assert.deepEqual(progress, []);
        assert.equal(cancellations.length, ['handleCancel', 'handleDisconnect'].includes(retire) ? 1 : 0);
    }
    const calls = [];
    const {object} = modal((progress, options) => { const done = defer(); calls.push({progress, options, done}); return done.promise; });
    const first = object.handleSendUpdate(value => calls.push(['first', value]));
    const second = object.handleSendUpdate(value => calls.push(['second', value]));
    assert.equal(calls[0].options.isCurrent(), false); assert.equal(calls[1].options.isCurrent(), true);
    calls[0].progress(1); calls[1].progress(2); assert.deepEqual(calls[2], ['second', 2]);
    calls[0].done.resolve(); await first; assert.equal(calls[1].options.isCurrent(), true);
    calls[1].done.resolve(); await second; assert.equal(calls[1].options.isCurrent(), false);
});

test('update step ignores retired progress and terminal delivery while retaining current errors', async () => {
    // Combine the actual child/parent/shell methods. React unmounts the update
    // child when the modal's phase changes; this model invokes that real
    // lifecycle method explicitly and does not claim a React mount test.
    for (const stage of ['chooser', 'chunk']) {
        const chosen = defer(), chunk = defer(); let loads = 0, updates = 0;
        const run = await updater({requestDevice: () => chosen.promise}, () => { loads++; return chunk.promise; });
        const parent = modal(run).object;
        const child = step((...args) => parent.handleSendUpdate(...args)).object;
        const pending = child.handleSendUpdate();
        if (stage === 'chunk') { chosen.resolve({}); await Promise.resolve(); assert.equal(loads, 1); }
        child.componentWillUnmount();
        if (stage === 'chooser') chosen.resolve({});
        else chunk.resolve({updateMicroBit: () => { updates++; }});
        await pending;
        assert.equal(updates, 0, `child unmount during ${stage} must prevent transport start`);
        assert.equal(loads, stage === 'chooser' ? 0 : 1);
    }
    const calls = [];
    const {object, states} = step(progress => { const done = defer(); calls.push({progress, done}); return done.promise; });
    const first = object.handleSendUpdate(), second = object.handleSendUpdate();
    calls[0].progress(0.7); assert.equal(states.some(state => Object.hasOwn(state, 'progressPercentage')), false);
    calls[1].progress(0.5); assert.equal(states.at(-1).progressPercentage, 50);
    calls[0].done.resolve('old'); await first; assert.equal(states.some(state => state.res === 'old'), false);
    const reason = Object.freeze(new Error('current')); calls[1].done.reject(reason); await second;
    assert.equal(states.at(-1).err, reason);
    const third = object.handleSendUpdate(); const before = states.length; object.componentWillUnmount();
    calls[2].progress(1); calls[2].done.resolve('disposed'); await third; assert.equal(states.length, before);
});

test('genuine production ES package APIs parse HEX and retain selected builtin prototype surfaces', async () => {
    const roots = [Function.prototype, Object.prototype, Array.prototype, Number.prototype,
        String.prototype, Boolean.prototype, Promise.prototype];
    const before = roots.map(value => ({parent: Object.getPrototypeOf(value), keys: Reflect.ownKeys(value),
        descriptors: Object.getOwnPropertyDescriptors(value)}));
    // The distinct main/UMD embeds global core-js and its failed control is
    // preserved. Use the genuine unchanged production ES entries in this host
    // process, with only their exact extensionless relative edges admitted.
    // Stable module.register needs no custom Node flag in ordinary root tests.
    register(new URL('./helpers/microbit-update-production-es-loader.mjs', import.meta.url), {
        data: {guiRoot: INTEGRATED}
    });
    const dap = await import(pathToFileURL(guiDependencyFile('dapjs/dist/dap.esm.js')).href);
    const hex = await import(pathToFileURL(guiDependencyFile('@microbit/microbit-universal-hex/dist/esm5/index.js')).href);
    assert.equal(typeof dap.WebUSB, 'function'); assert.equal(typeof dap.DAPLink, 'function');
    const input = ':020000040000FA\n:0400000001020304F2\n:00000001FF\n';
    const universal = hex.createUniversalHex([{boardId: 0x9900, hex: input}, {boardId: 0x9903, hex: input}]);
    assert.equal(hex.isUniversalHex(universal), true);
    assert.deepEqual(hex.separateUniversalHex(universal).map(row => row.boardId), [0x9900, 0x9903]);
    assert.equal(hex.isUniversalHex(input), false);
    const fixture = transport({text: universal});
    await implementation({...fixture, isUniversalHex: hex.isUniversalHex, separateUniversalHex: hex.separateUniversalHex})({serialNumber: '99040005'});
    assert.deepEqual(fixture.events.find(row => row[0] === 'flash')[2], new TextEncoder().encode(universal));
    assert.deepEqual(roots.map(value => ({parent: Object.getPrototypeOf(value), keys: Reflect.ownKeys(value),
        descriptors: Object.getOwnPropertyDescriptors(value)})), before);
});
