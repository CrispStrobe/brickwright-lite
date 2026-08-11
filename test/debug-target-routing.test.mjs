/**
 * debug-target-factory routing: three engines, one factory, no silent misrouting.
 *
 * Three execution engines (emu8051, avr8js, rp2040js) route through one
 * createDebugTarget() factory. Each was verified individually; this test
 * verifies the SET:
 *
 *   1. Each known kind reaches its engine (not someone else's).
 *   2. An unknown kind fails loudly rather than defaulting to 8051.
 *   3. The lazy imports for avr8js and rp2040js actually resolve.
 *   4. getTargetKinds() lists all three simulator kinds.
 *
 * These assertions cannot be replaced by single-engine tests, because a
 * wrong-default routing produces a program that runs on the wrong
 * architecture and fails in a way that looks like bad user code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LITE = join(here, '..', 'packages', 'scratch-gui', 'src');
const factoryPath = join(LITE, 'lib', 'bw-board', 'debug-target-factory.js');

test('getTargetKinds lists all three simulator engines', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const { getTargetKinds } = await import(factoryPath);
    const kinds = getTargetKinds();
    const kindIds = kinds.map(k => k.kind);

    assert.ok(kindIds.includes('emulator'), 'missing emulator (emu8051)');
    assert.ok(kindIds.includes('avr8js'), 'missing avr8js');
    assert.ok(kindIds.includes('rp2040js'), 'missing rp2040js');
    assert.ok(kindIds.includes('serial'), 'missing serial');

    // Each entry must have label and description
    for (const k of kinds) {
        assert.ok(k.label, `${k.kind} has no label`);
        assert.ok(k.description, `${k.kind} has no description`);
    }
});

test('unknown target kind throws rather than defaulting', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const { createDebugTarget } = await import(factoryPath);
    await assert.rejects(
        () => createDebugTarget('nonexistent', {}),
        { message: /unknown debug target kind/i },
        'an unknown kind must throw, not silently default to 8051'
    );
});

test('emulator kind requires opts.wasm (routes to 8051, not AVR)', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const { createDebugTarget } = await import(factoryPath);
    // The emulator path requires opts.wasm — if it reaches the AVR path
    // instead, the error would mention 'board' not 'wasm'.
    await assert.rejects(
        () => createDebugTarget('emulator', {}),
        { message: /opts\.wasm/i },
        'emulator kind must route to the 8051 target (requires wasm)'
    );
});

test('avr8js kind requires opts.board (routes to AVR, not 8051)', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const { createDebugTarget } = await import(factoryPath);
    // The avr8js path requires opts.board — if it reaches the 8051 path
    // instead, the error would mention 'wasm' not 'board'.
    await assert.rejects(
        () => createDebugTarget('avr8js', {}),
        { message: /opts\.board/i },
        'avr8js kind must route to the AVR target (requires board)'
    );
});

test('rp2040js kind requires opts.board (routes to Pico, not 8051)', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const { createDebugTarget } = await import(factoryPath);
    await assert.rejects(
        () => createDebugTarget('rp2040js', {}),
        { message: /opts\.board/i },
        'rp2040js kind must route to the Pico target (requires board)'
    );
});

test('avr8js lazy import resolves (the adapter module loads)', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    // The adapter is lazy-imported inside createAvr8jsTarget. Verify the
    // module itself resolves — a lazy import that fails only for users who
    // need it is the exact failure shape this project keeps catching.
    const adapterPath = join(LITE, 'lib', 'bw-board', 'avr8js-adapter.js');
    assert.ok(existsSync(adapterPath), 'avr8js-adapter.js missing from overlay');
    const mod = await import(adapterPath);
    assert.ok(typeof mod.createAvr8jsAdapter === 'function',
        'avr8js-adapter.js must export createAvr8jsAdapter');
});

test('rp2040js lazy import resolves (the adapter module loads)', {
    skip: existsSync(factoryPath) ? false : 'not integrated'
}, async () => {
    const adapterPath = join(LITE, 'lib', 'bw-board', 'rp2040js-adapter.js');
    assert.ok(existsSync(adapterPath), 'rp2040js-adapter.js missing from overlay');
    const mod = await import(adapterPath);
    assert.ok(typeof mod.createRp2040jsAdapter === 'function',
        'rp2040js-adapter.js must export createRp2040jsAdapter');
});
