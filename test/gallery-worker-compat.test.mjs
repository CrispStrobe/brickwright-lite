import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {RUNTIME_WORKER_PROVEN, censusEntry, validateGalleryContract} from '../scripts/sync-gallery-pins.mjs';

const root = path.join(import.meta.dirname, '..');
const extensionsRoot = path.join(import.meta.dirname, 'fixtures', 'gallery-worker-sources');
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures/gallery-worker-compat.json')));
const pins = JSON.parse(readFileSync(path.join(root,
    'overlay/scratch-vm/src/extension-support/gallery-pins.json')));
const sha256 = source => createHash('sha256').update(source).digest('hex');

const Cast = Object.freeze({
    toNumber: value => {
        const number = Number(value);
        return Number.isNaN(number) ? 0 : number;
    },
    toString: value => String(value),
    toBoolean: value => !(value === false || value === 0 || value === '' || String(value).toLowerCase() === 'false'),
    compare: (a, b) => String(a).localeCompare(String(b)),
    isWhiteSpace: value => String(value).trim().length === 0
});

const enumProxy = new Proxy({}, {get: (_target, property) => String(property)});
const translate = Object.assign(message => typeof message === 'object' ? (message.default || '') : message,
    {setup: () => {}});

function load (source, restricted) {
    const registrations = [];
    const Scratch = {
        ArgumentType: enumProxy,
        BlockType: enumProxy,
        TargetType: enumProxy,
        Cast,
        translate,
        extensions: {register: extension => registrations.push(extension), unsandboxed: !restricted,
            isPenguinMod: false}
    };
    const context = vm.createContext({Scratch, console, TextEncoder, TextDecoder, URL, Blob,
        setTimeout, clearTimeout});
    if (!restricted) {
        context.window = context;
        context.document = {};
        context.navigator = {};
    }
    vm.runInContext(source.toString('utf8'), context, {timeout: 1000});
    assert.equal(registrations.length, 1, 'source must register exactly one extension');
    return {extension: registrations[0], context};
}

function normalizedInfo (extension) {
    return JSON.parse(JSON.stringify(extension.getInfo()));
}

for (const entry of fixture.cases) {
    test(`worker compatibility parity: ${entry.slug}`, async () => {
        const pin = pins.extensions[entry.slug];
        assert.ok(pin, `missing pin for ${entry.slug}`);
        const sourcePath = path.join(extensionsRoot, `${entry.slug}.js`);
        const source = readFileSync(sourcePath);
        assert.equal(sha256(source), pin.repo, 'immutable repository bytes must match the reviewed pin');
        const oldRealm = load(source, false);
        const workerRealm = load(source, true);
        const oldAdapter = oldRealm.extension;
        const worker = workerRealm.extension;
        assert.equal(workerRealm.context.Scratch.extensions.unsandboxed, false);
        for (const ambient of ['window', 'document', 'navigator', 'WebSocket', 'Worker', 'SharedWorker',
            '__TAURI__', '__TAURI_INTERNALS__']) {
            assert.equal(workerRealm.context[ambient], undefined, `worker must not expose ${ambient}`);
        }
        assert.equal(workerRealm.context.Scratch.vm, undefined, 'worker must not expose Scratch.vm');
        assert.equal(workerRealm.context.Scratch.runtime, undefined, 'worker must not expose Scratch.runtime');
        assert.deepEqual(normalizedInfo(worker), normalizedInfo(oldAdapter), 'getInfo parity');
        assert.equal(typeof worker[entry.opcode], 'function', `missing representative opcode ${entry.opcode}`);
        const expected = await oldAdapter[entry.opcode](structuredClone(entry.args));
        const actual = await worker[entry.opcode](structuredClone(entry.args));
        assert.deepEqual(actual, expected, 'representative opcode parity');
    });
}

test('runtime worker cohort is deterministic, complete and tied to the immutable snapshot', () => {
    assert.equal(fixture.commit, pins.commit);
    assert.deepEqual(fixture.cases.map(entry => entry.slug), RUNTIME_WORKER_PROVEN);
    assert.equal(new Set(RUNTIME_WORKER_PROVEN).size, RUNTIME_WORKER_PROVEN.length);
});

test('generator rejects a hand-promoted worker without runtime proof', () => {
    const mutated = structuredClone(pins);
    const slug = Object.keys(mutated.extensions).find(name =>
        mutated.extensions[name].migration.status === 'candidate' && !RUNTIME_WORKER_PROVEN.includes(name));
    mutated.extensions[slug].migration = {
        status: 'worker', reason: 'runtime parity proven by gallery worker compatibility corpus'
    };
    assert.throws(() => validateGalleryContract(mutated, Object.keys(mutated.extensions)),
        new RegExp(`worker gallery entry ${slug} lacks generator-owned runtime proof`));
});

test('generator refuses a runtime-proven worker which gains an ambient requirement', () => {
    assert.throws(() => censusEntry(RUNTIME_WORKER_PROVEN[0], 'document.body'),
        /runtime-proven worker .* acquired ambient requirements: dom/);
});

test('generator refuses downgrading a runtime-proven worker back to an unmeasured candidate', () => {
    const mutated = structuredClone(pins);
    mutated.extensions[RUNTIME_WORKER_PROVEN[0]].migration = {status: 'candidate', reason: null};
    assert.throws(() => validateGalleryContract(mutated, Object.keys(mutated.extensions)),
        /runtime-proven gallery entry .* was downgraded from worker/);
});

test('published migration counts distinguish proven, awaiting-proof and ambient deferrals', () => {
    const counts = Object.values(pins.extensions).reduce((result, pin) => {
        result[pin.migration.status] = (result[pin.migration.status] || 0) + 1;
        return result;
    }, {});
    assert.deepEqual(counts, {candidate: 25, deferred: 93, worker: 2});
});
