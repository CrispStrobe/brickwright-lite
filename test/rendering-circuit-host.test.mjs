import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindRenderingCircuitHost, bindReadyRenderingCircuitHost} from '../scripts/lib/rendering-circuit-host.mjs';

const host = (state = {circuitData: {parts: []}}) => ({state, loadExample () {}, setState () {}});
const root = (fiber, overrides = {}) => ({
    isConnected: true, getBoundingClientRect: () => ({width: 800, height: 600}),
    __reactFiber$proof: fiber, ...overrides
});
const clear = () => {delete globalThis.__bwRenderingCircuitTab;};
const ownershipOracle = bind => {
    const own = host(), unrelated = host();
    const leaf = {return: {stateNode: own}, sibling: {stateNode: unrelated}};
    assert.equal(bind(root(leaf)), true);
    assert.equal(globalThis.__bwRenderingCircuitTab, own, 'must bind the visible canvas owner, not its sibling');
};
const staleOracle = bind => {
    assert.equal(bind(root({stateNode: host()})), true);
    assert.equal(bind(root({})), false);
    assert.equal(Object.hasOwn(globalThis, '__bwRenderingCircuitTab'), false, 'rejected root must clear stale host');
};
const stateOracle = bind => {
    assert.equal(bind(root({stateNode: host({})})), false);
    assert.equal(Object.hasOwn(globalThis, '__bwRenderingCircuitTab'), false);
};
const readinessOracle = async bind => {
    let release;
    const ready = new Promise(resolve => {release = resolve;});
    const events = [];
    const designer = {
        async waitFor (options) {
            assert.deepEqual(options, {state: 'visible', timeout: 60000}); events.push('shell');
        },
        locator (selector) {
            assert.equal(selector, '[data-canvas]');
            return {async waitFor (options) {
                assert.deepEqual(options, {state: 'visible', timeout: 60000});
                events.push('waiting'); await ready; events.push('ready');
            }};
        },
        evaluate (binder) {events.push('bind'); return binder(root({stateNode: host()}));}
    };
    const pending = bind(designer);
    try {
        await Promise.resolve();
        await Promise.resolve();
        assert.deepEqual(events, ['shell', 'waiting'], 'binding must wait for delayed canvas readiness');
        release();
        assert.equal(await pending, true);
        assert.deepEqual(events, ['shell', 'waiting', 'ready', 'bind']);
    } finally {release(); await pending.catch(() => {}); clear();}
};

test('visible canvas ownership ignores unrelated and hidden sibling hosts', () => {
    try {ownershipOracle(bindRenderingCircuitHost);} finally {clear();}
});
test('nearest complete owner wins over an outer CircuitTab', () => {
    try {
        const inner = host(), outer = host();
        assert.equal(bindRenderingCircuitHost(root({return: {stateNode: inner, return: {stateNode: outer}}})), true);
        assert.equal(globalThis.__bwRenderingCircuitTab, inner);
    } finally {clear();}
});
test('missing ancestry clears a previously successful binding', () => {
    try {staleOracle(bindRenderingCircuitHost);} finally {clear();}
});
test('detached, hidden-sized and non-React roots cannot leave a binding', () => {
    try {
        for (const bad of [null, root({}, {isConnected: false}),
            root({}, {getBoundingClientRect: () => ({width: 0, height: 600})}),
            {isConnected: true, getBoundingClientRect: () => ({width: 1, height: 1})}]) {
            globalThis.__bwRenderingCircuitTab = host();
            assert.equal(bindRenderingCircuitHost(bad), false);
            assert.equal(Object.hasOwn(globalThis, '__bwRenderingCircuitTab'), false);
        }
    } finally {clear();}
});
test('incomplete owners and inherited circuitData do not satisfy the contract', () => {
    try {
        stateOracle(bindRenderingCircuitHost);
        for (const invalid of [{state: {circuitData: {}}, loadExample () {}},
            host(Object.create({circuitData: {}}))]) {
            assert.equal(bindRenderingCircuitHost(root({stateNode: invalid})), false);
        }
    } finally {clear();}
});
test('legacy React key works, but cyclic ancestry throws instead of hanging', () => {
    try {
        const own = host(), oldRoot = root(null);
        delete oldRoot.__reactFiber$proof;
        oldRoot.__reactInternalInstance$proof = {return: {stateNode: own}};
        assert.equal(bindRenderingCircuitHost(oldRoot), true);
        const cycle = {}; cycle.return = cycle;
        assert.throws(() => bindRenderingCircuitHost(root(cycle)), /ancestry is cyclic/);
        assert.equal(Object.hasOwn(globalThis, '__bwRenderingCircuitTab'), false);
    } finally {clear();}
});
test('late canvas readiness is awaited before binding its owning host', async () => {
    await readinessOracle(bindReadyRenderingCircuitHost);
});
test('canvas readiness refusal prevents binding or fixture injection', async () => {
    let bound = false;
    const unavailable = new Error('canvas unavailable');
    await assert.rejects(() => bindReadyRenderingCircuitHost({
        async waitFor () {},
        locator () {return {async waitFor () {throw unavailable;}};},
        evaluate () {bound = true;}
    }), error => error === unavailable);
    assert.equal(bound, false);
});
test('browser gate uses the shared ready-owner helper before fixture injection', () => {
    const gate = readFileSync(new URL('../scripts/verify-circuit-rendering.mjs', import.meta.url), 'utf8');
    const bind = gate.indexOf('await bindReadyRenderingCircuitHost(designer)');
    const inject = gate.indexOf('const load = async parts');
    assert.ok(bind >= 0 && inject > bind);
    assert.ok(!gate.includes('const queue = key ? [root[key]] : []'));
});
test('four isolated executable mutants fail their caller-consequence oracles', async () => {
    const source = readFileSync(new URL('../scripts/lib/rendering-circuit-host.mjs', import.meta.url), 'utf8');
    for (const [name, anchor, replacement, oracle, exported] of [
        ['sibling rather than owner', 'fiber = fiber.return', 'fiber = fiber.sibling', ownershipOracle, 'bindRenderingCircuitHost'],
        ['stale binding survives rejection', 'delete globalThis.__bwRenderingCircuitTab;', 'void 0;', staleOracle, 'bindRenderingCircuitHost'],
        ['missing state admitted', "Object.hasOwn(host.state || {}, 'circuitData')", 'true', stateOracle, 'bindRenderingCircuitHost'],
        ['unawaited late canvas', "await designer.locator('[data-canvas]').waitFor", "void designer.locator('[data-canvas]').waitFor", readinessOracle, 'bindReadyRenderingCircuitHost']
    ]) {
        assert.equal(source.split(anchor).length - 1, 1, name);
        try {
            clear();
            const mutant = await import(
                `data:text/javascript;base64,${Buffer.from(source.replace(anchor, replacement)).toString('base64')}`);
            await assert.rejects(async () => oracle(mutant[exported]), {name: 'AssertionError'}, name);
        } finally {clear();}
    }
});
