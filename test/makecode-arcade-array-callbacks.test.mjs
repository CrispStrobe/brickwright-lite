import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Optional passive evidence uses only these actual helper returns and callbacks.
const evidenceRoot = process.env.BW_ARRAY_CALLBACK_EVIDENCE_DIR;
function retain(name, value) {
    if (!evidenceRoot) return;
    fs.mkdirSync(evidenceRoot, {recursive: true});
    fs.writeFileSync(path.join(evidenceRoot, name + '.json'), JSON.stringify(value), {flag: 'wx'});
}
function typed(value, seen = new WeakMap(), depth = 0) {
    if (value === undefined) return {$scalar: 'Undefined'};
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return {$scalar: 'Number', value: String(value), negativeZero: Object.is(value, -0)};
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value !== 'object') return {$unobserved: typeof value};
    if (seen.has(value)) return {$reference: seen.get(value)};
    const id = seen.sizeToken = (seen.sizeToken || 0) + 1; seen.set(value, id);
    if (depth > 8) return {$id: id, $unexpanded: 'depth8'};
    const out = Object.assign(Object.create(null), {$id: id, $kind: Array.isArray(value) ? 'array' : 'object'});
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        out[typeof key === 'symbol' ? String(key) : key] = Object.hasOwn(descriptor, 'value') ? typed(descriptor.value, seen, depth + 1) : {$unobserved: 'accessor-not-invoked'};
    }
    return out;
}
function channels(value) {
    return Object.fromEntries(Object.getOwnPropertyNames(value).filter(key => /warn|error|unparsed|unsupported|diagnostic|refus|netAttempts/i.test(key)).map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return [key, Object.hasOwn(descriptor, 'value') ? {present: true, kind: Array.isArray(descriptor.value) ? 'array' : descriptor.value === null ? 'null' : typeof descriptor.value, actual: typed(descriptor.value)} : {present: true, unobserved: 'accessor-not-invoked'}];
    }));
}
const compilationObserver = name => evidenceRoot ? actual => retain(name, {actual, channels: channels(actual.built)}) : null;
const creatorObserver = evidenceRoot ? (creator, error) => retain('creator-before-helper-load', {project: creator.project, channels: channels(creator), parseException: {present: error !== null, actual: typed(error)}}) : null;
function captureRun(run) {
    if (!evidenceRoot) return;
    const bytes = Buffer.from(run.buffer);
    fs.writeFileSync(path.join(evidenceRoot, 'actual-helper.sb3'), bytes, {flag: 'wx'});
    const assets = [...run.creator.assets].map(([id, asset], index) => {
        const data = asset.data;
        const actual = typeof data === 'string' ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data instanceof ArrayBuffer ? Buffer.from(data) : null;
        const file = 'asset-' + index + '.bin';
        if (actual) fs.writeFileSync(path.join(evidenceRoot, file), actual, {flag: 'wx'});
        return {id, metadata: typed(asset), file: actual ? file : null, bytes: actual?.length, sha256: actual ? crypto.createHash('sha256').update(actual).digest('hex') : null, unsupportedDataKind: actual ? null : typed(data)};
    });
    retain('actual-run-before-assertions', {buffer: {file: 'actual-helper.sb3', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')}, project: run.creator.project, assetRoles: run.creator.project.targets.map(target => ({name: target.name, isStage: target.isStage, costumes: target.costumes, sounds: target.sounds})), assets, creatorChannels: channels(run.creator), errors: typed(run.errors), calls: [...run.calls.entries()], runtime: {targets: run.vm.runtime.targets.map(target => ({id: target.id, name: target.getName(), isStage: target.isStage, isOriginal: target.isOriginal, blocks: target.blocks._blocks, variables: typed(target.variables)})), threads: typed(run.vm.runtime.threads)}});
}

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));

// filter evaluates every predicate before forEach runs: moving the first kept
// sprite left must not drop or add later sprites. The index form counts calls.
const SOURCE = `let done = false
let xs = [10, 90, 100, 130, 40]
for (let x of xs) {
    let s = sprites.create(img\`1\`, SpriteKind.Enemy)
    s.x = x
}
let all = sprites.allOfKind(SpriteKind.Enemy)
all.filter(e => e.x > 80).forEach(e => e.x -= 80)
let indexSum = 0
all.forEach((e, i) => { indexSum += i * 1000 + e.x })
let magic = (function () {
    let out = 0
    for (let i = 0; i < 4; i++) out += i
    return out * 10
})()
let after = 0
all.forEach(function (e) { after += e.x })
// A discarded map runs its callback for its side effects, like forEach.
let frames = [img\`3 1\`, img\`1 3\`]
frames.map(f => f.replace(3, 10))
let mapped = frames[0].getPixel(0, 0) * 100 + frames[1].getPixel(1, 0)
let mapCalls = 0
xs.map((x, i) => { mapCalls += x + i })
done = true
done = true`;

test('forEach, filter and immediately invoked functions match the original runtime', async () => {
    const original = await runPxtArcade(SOURCE, {waitForGlobals: {done: true}, onCompilation: compilationObserver('original-compilation')});
    retain('original-result', typed(original));
    const imported = arcadeToPseudocode(SOURCE);
    retain('actual-import-before-assertions', {actual: imported, channels: channels(imported)});
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 30, storage: true, uploads: imported.costumes, observeCreator: creatorObserver});
    try {
        captureRun(run);
        assert.deepEqual(run.errors, []);
        const actual = values(run);
        assert.equal(String(actual.done), 'true');
        for (const name of ['indexSum', 'magic', 'after', 'mapped', 'mapCalls']) assert.equal(Number(actual[name]), original[name], name);
        assert.equal(original.mapped, 1010);
        assert.equal(original.magic, 60);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        retain('actual-export-before-assertions', {actual: exported, channels: channels(exported)});
        assert.deepEqual(exported.unsupported, []);
        const again = await runPxtArcade(exported.ts + '\ndone = true', {waitForGlobals: {done: true}, onCompilation: compilationObserver('export-compilation')});
        retain('executed-export-result', typed(again));
        for (const name of ['indexSum', 'magic', 'after', 'mapped', 'mapCalls']) assert.equal(again[name], original[name], `${name} in the executed export`);
    } finally {
        try { retain('actual-final-runtime', {errors: typed(run.errors), variables: typed(run.vm.runtime.targets.map(target => target.variables)), threads: typed(run.vm.runtime.threads)}); }
        finally { clearStrayTimers(); }
    }
});

test('callbacks that cannot be lowered stay visible', () => {
    // An early return inside forEach, and an IIFE capturing a local of its function.
    for (const source of ['let a = [1, 2]\na.forEach(x => { if (x > 1) return; a.push(x) })',
        'function f(k: number) { return (function () { return k })() }\nlet v = f(2)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
