import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    commandCapability,
    eventBreakpointCapabilities,
    memoryCapability,
    negotiateDebugCapabilities,
    normalizeDebugCapabilities
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js';

test('legacy target capabilities normalize without inventing cycle support', () => {
    const caps = normalizeDebugCapabilities({
        steps: ['insn', 'over', 'insn'],
        breakpoints: ['code', 'write'],
        spaces: ['code', 'sram'],
        writable: ['sram'],
        timeFreezes: true
    }, {target: 'avr8js'});

    assert.deepEqual(caps.steps, ['insn', 'over']);
    assert.equal(caps.fidelity.instruction, 'recorded');
    assert.equal(caps.fidelity.cycle, 'unsupported');
    assert.deepEqual(caps.spaces.code, {read: true, write: false, passiveRead: null});
    assert.deepEqual(caps.spaces.sram, {read: true, write: true, passiveRead: null});
    assert.equal(commandCapability(caps, 'stepCycle').accepted, false);
    assert.deepEqual(commandCapability(caps, 'stepInstruction'), {
        accepted: true, command: 'stepInstruction', capability: 'steps.insn'
    });
});

test('an explicit cycle producer unlocks cycle stepping', () => {
    const caps = normalizeDebugCapabilities({steps: ['insn', 'cycle']}, {target: '8051'});
    assert.equal(caps.fidelity.cycle, 'recorded');
    assert.equal(commandCapability(caps, 'stepCycle').accepted, true);
});

test('reverse and recording commands require explicit capabilities', () => {
    const caps = normalizeDebugCapabilities({
        steps: ['insn'], reverse: ['insn', 'continue'], recording: ['checkpoint', 'restore']
    });
    assert.equal(commandCapability(caps, 'reverseInstruction').accepted, true);
    assert.equal(commandCapability(caps, 'reverseCycle').accepted, false);
    assert.equal(commandCapability(caps, 'checkpoint').accepted, true);
    assert.equal(commandCapability(caps, 'fork').accepted, false);
});

test('serial-style curated writes survive normalization and stay visible', () => {
    const caps = normalizeDebugCapabilities({spaces: {
        code: {read: true, write: false, passiveRead: true},
        sfr: {read: true, write: 'curated', passiveRead: false}
    }});
    assert.deepEqual(memoryCapability(caps, 'sfr', 'write'), {
        accepted: true, space: 'sfr', operation: 'write', restricted: true
    });
    assert.equal(caps.spaces.sfr.passiveRead, false);
    assert.equal(memoryCapability(caps, 'ports', 'read').code, 'unknown-address-space');
});

test('negotiation and schema failures fail closed', () => {
    assert.throws(() => negotiateDebugCapabilities({}), /must provide capabilities/);
    assert.throws(() => normalizeDebugCapabilities([], {}), /must be an object/);
    assert.throws(() => normalizeDebugCapabilities({schema: 2}), /unsupported.*schema 2/);
    const unknown = commandCapability(normalizeDebugCapabilities(), 'teleport');
    assert.equal(unknown.accepted, false);
    assert.equal(unknown.code, 'unknown-command');
});

test('breakpoint capability adapter preserves explicit event and passive-read truth', () => {
    const caps = normalizeDebugCapabilities({
        events: ['instruction', 'memory'],
        spaces: {ram: {read: true, write: true, passiveRead: true},
            device: {read: true, write: false}},
        extensions: {maxConditionReads: 3}
    });
    assert.deepEqual(eventBreakpointCapabilities(caps), {
        eventKinds: ['instruction', 'memory'],
        addressSpaces: {
            ram: {read: true, write: true, passive: true},
            device: {read: true, write: false, passive: false}
        },
        maxConditionReads: 3,
        allowBreakpointWrites: false
    });
});

test('run-to descriptors are explicit, normalized, frozen and command-gated', () => {
    const raw = [{kind: 'address', space: 'code', addressMin: 0, addressMax: 0xffff,
        stopSides: ['before', 'before', 'after'], installation: 'sync'},
    {kind: 'event', eventKinds: ['interrupt', 'port', 'interrupt'], stopSides: ['after'],
        installation: 'async'}];
    const caps = normalizeDebugCapabilities({runTo: raw});
    assert.deepEqual(caps.runTo, [
        {kind: 'address', space: 'code', addressMin: 0, addressMax: 0xffff,
            stopSides: ['before', 'after'], installation: 'sync'},
        {kind: 'event', eventKinds: ['interrupt', 'port'], stopSides: ['after'], installation: 'async'}
    ]);
    assert.ok(Object.isFrozen(caps.runTo));
    assert.ok(caps.runTo.every(Object.isFrozen));
    assert.ok(Object.isFrozen(caps.runTo[0].stopSides));
    raw[0].space = 'mutated';
    assert.equal(caps.runTo[0].space, 'code');
    assert.deepEqual(commandCapability(caps, 'runTo'), {
        accepted: true, command: 'runTo', capability: 'runTo'
    });
});

test('run-to is never inferred and unknown or malformed descriptors fail closed', () => {
    const absent = normalizeDebugCapabilities({breakpoints: ['code', 'yield'], steps: ['over']});
    assert.deepEqual(absent.runTo, []);
    assert.deepEqual(commandCapability(absent, 'runTo'), {
        accepted: false,
        command: 'runTo',
        code: 'unsupported-capability',
        missing: 'runTo',
        reason: 'runTo requires an explicit runTo descriptor, which this target does not advertise'
    });

    const malformed = normalizeDebugCapabilities({runTo: [
        {kind: 'teleport', stopSides: ['before'], installation: 'sync'},
        {kind: 'address', space: '', stopSides: ['before'], installation: 'sync'},
        {kind: 'address', space: 'code', addressMin: 0, addressMax: 255,
            stopSides: ['during'], installation: 'sync'},
        {kind: 'address', space: 'code', addressMin: 0, addressMax: 255,
            stopSides: ['before'], installation: 'later'},
        {kind: 'address', space: 'code', stopSides: ['before'], installation: 'sync'},
        {kind: 'address', space: 'code', addressMin: -1, addressMax: 255,
            stopSides: ['before'], installation: 'sync'},
        {kind: 'address', space: 'code', addressMin: 256, addressMax: 255,
            stopSides: ['before'], installation: 'sync'},
        {kind: 'address', space: 'code', addressMin: 0, addressMax: Number.MAX_SAFE_INTEGER + 1,
            stopSides: ['before'], installation: 'sync'},
        {kind: 'block', space: 'code', stopSides: ['before'], installation: 'sync'},
        {kind: 'event', eventKinds: [], stopSides: ['after'], installation: 'sync'},
        {kind: 'source', stopSides: ['before'], installation: 'sync', surprise: true}
    ]});
    assert.deepEqual(malformed.runTo, []);
    assert.equal(commandCapability(malformed, 'runTo').accepted, false);
    assert.deepEqual(normalizeDebugCapabilities({runTo: {kind: 'address'}}).runTo, []);
});


test('bounded physical memory metadata survives without code-space inference', () => {
    const mem = {read: true, write: false, passiveRead: true,
        addressSpace: 'physical', addressMin: 0, addressMax: 0xffffffff, maxReadBytes: 1048576};
    const caps = normalizeDebugCapabilities({spaces: {mem, code: {read: true}}});
    assert.deepEqual(caps.spaces.mem, mem);
    assert.ok(Object.isFrozen(caps.spaces.mem));
    mem.addressMax = 1;
    assert.equal(caps.spaces.mem.addressMax, 0xffffffff);
    assert.equal(memoryCapability(caps, 'mem', 'read').accepted, true);
    assert.equal(memoryCapability(caps, 'mem', 'write').accepted, false);
    assert.deepEqual(caps.spaces.code, {read: true, write: false, passiveRead: null});
    assert.equal(caps.spaces.code.addressMax, undefined);
    // Negotiation has no address/length operation: top-byte and one-past-empty
    // enforcement remains the target/read caller's responsibility.
});

test('any explicit memory field selects complete strict validation, never legacy fallback', () => {
    const valid = {read: true, write: false, passiveRead: true,
        addressSpace: 'physical', addressMin: 0, addressMax: 0xffffffff, maxReadBytes: 1048576};
    const bad = [];
    for (const key of Object.keys(valid)) {
        const row = {...valid}; delete row[key]; bad.push(row);
    }
    for (const [key, values] of Object.entries({
        addressSpace: ['linear', '', null],
        addressMin: [-1, 0.5, NaN, true, '0'],
        addressMax: [-1, 0x100000000, Infinity, false, '4294967295'],
        maxReadBytes: [0, -1, 1048577, 0.5, true, '1'],
        read: [1, undefined], write: ['curated', undefined], passiveRead: [1, null]
    })) for (const value of values) bad.push({...valid, [key]: value});
    for (const key of ['addressSpace', 'addressMin', 'addressMax', 'maxReadBytes']) {
        bad.push({read: true, write: true, [key]: valid[key]});
        bad.push({...valid, [key]: undefined});
    }
    for (const mem of bad) {
        const caps = normalizeDebugCapabilities({spaces: {mem, legacy: {read: true, write: true}}});
        assert.equal(caps.spaces.mem, undefined, JSON.stringify(mem));
        assert.equal(memoryCapability(caps, 'mem', 'write').accepted, false);
        assert.equal(memoryCapability(caps, 'legacy', 'write').accepted, true);
    }
    const inverted = normalizeDebugCapabilities({spaces: {mem: {...valid, addressMin: 4, addressMax: 3}}});
    assert.equal(inverted.spaces.mem, undefined);
});


test('inherited metadata and array descriptors cannot select editable legacy fallback', () => {
    const valid = {read: true, write: false, passiveRead: true,
        addressSpace: 'physical', addressMin: 0, addressMax: 0xffffffff, maxReadBytes: 1048576};
    const inheritedPartial = Object.assign(Object.create({addressMax: 0xffffffff}), {read: true, write: true});
    const inheritedComplete = Object.create(valid);
    const inheritedFlags = Object.assign(Object.create({read: true, write: true, passiveRead: true}), {
        addressSpace: 'physical', addressMin: 0, addressMax: 255, maxReadBytes: 16});
    const array = Object.assign([], valid);
    for (const mem of [inheritedPartial, inheritedComplete, inheritedFlags, array]) {
        const caps = normalizeDebugCapabilities({spaces: {mem}});
        assert.equal(caps.spaces.mem, undefined);
        assert.equal(memoryCapability(caps, 'mem', 'write').accepted, false);
        assert.equal(memoryCapability(caps, 'mem', 'read').accepted, false);
    }
    const legacy = Object.create({read: true, write: true});
    assert.equal(memoryCapability(normalizeDebugCapabilities({spaces: {legacy}}), 'legacy', 'write').accepted, true);
});

test('complete own primitive descriptors retain narrower bounds and false capabilities', () => {
    for (const flags of [{read: false, write: false, passiveRead: false},
        {read: true, write: true, passiveRead: false}]) {
        const mem = {...flags, addressSpace: 'physical', addressMin: 128, addressMax: 255, maxReadBytes: 16};
        const caps = normalizeDebugCapabilities({spaces: {mem}});
        assert.deepEqual(caps.spaces.mem, mem);
        assert.ok(Object.isFrozen(caps.spaces.mem));
        assert.equal(memoryCapability(caps, 'mem', 'write').accepted, flags.write);
    }
});


test('bounded descriptors are data-only and never invoke accessor fields', () => {
    const valid = {read: true, write: false, passiveRead: true,
        addressSpace: 'physical', addressMin: 0, addressMax: 255, maxReadBytes: 16};
    for (const key of Object.keys(valid)) {
        for (const throws of [false, true]) {
            let calls = 0;
            const mem = {...valid};
            Object.defineProperty(mem, key, {enumerable: true, get () {
                calls++;
                if (throws) throw new Error('getter must not run');
                return calls < 4 ? valid[key] : Infinity;
            }});
            const caps = normalizeDebugCapabilities({spaces: {mem}});
            assert.equal(caps.spaces.mem, undefined);
            assert.equal(calls, 0);
        }
    }
    assert.deepEqual(normalizeDebugCapabilities({spaces: {mem: valid}}).spaces.mem, valid);
});
