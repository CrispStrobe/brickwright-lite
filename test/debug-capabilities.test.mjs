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
