// The original-simulator session lock must exclude concurrent test processes
// (several node --test files run at once) and recover from a dead holder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withExclusiveBoot} from './helpers/exclusive-boot-lock.mjs';

const helper = fileURLToPath(new URL('./helpers/exclusive-boot-lock.mjs', import.meta.url));

function holder(lock, log, holdMs) {
    const code = `const {withExclusiveBoot}=await import(${JSON.stringify(helper)});
await withExclusiveBoot(()=>new Promise(done=>setTimeout(done,${holdMs})),{lock:${JSON.stringify(lock)},log:${JSON.stringify(log)}});`;
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', code], {stdio: 'inherit'});
        child.on('error', reject);
        child.on('exit', status => status === 0 ? resolve() : reject(new Error('holder exited ' + status)));
    });
}

function scratch(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-boot-lock-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    return {lock: path.join(dir, 'session.lock'), log: path.join(dir, 'intervals.jsonl')};
}

test('concurrent processes hold the session one at a time', async t => {
    const {lock, log} = scratch(t);
    await Promise.all([1, 2, 3, 4].map(() => holder(lock, log, 250)));
    const spans = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
        .sort((a, b) => a.start - b.start);
    assert.equal(spans.length, 4);
    assert.equal(new Set(spans.map(span => span.pid)).size, 4);
    for (let i = 1; i < spans.length; i++) {
        assert.ok(spans[i].start >= spans[i - 1].end, 'overlapping sessions: ' + JSON.stringify(spans));
    }
    assert.deepEqual(fs.readdirSync(`${lock}.participants-v1`), []);
});

// Bounded so a broken recovery fails instead of waiting forever.
test('a lock left by a dead process is recovered', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    const dead = spawn(process.execPath, ['-e', '0']);
    await new Promise(done => dead.on('exit', done));
    const root = `${lock}.participants-v1`;
    fs.mkdirSync(root);
    const stale = path.join(root, `${dead.pid}-00000000-0000-4000-8000-000000000001`);
    fs.mkdirSync(stale);
    fs.writeFileSync(path.join(stale, 'ticket-1'), '');
    assert.equal(await withExclusiveBoot(async () => 'ran', {lock, log: null}), 'ran');
    assert.deepEqual(fs.readdirSync(root), []);
});

test('a live holder blocks until it releases', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    let release;
    let started;
    const ready = new Promise(done => {started = done;});
    const first = withExclusiveBoot(async () => {
        started();
        await new Promise(done => {release = done;});
    }, {lock, log: null});
    await ready;
    let entered = false;
    const waiting = withExclusiveBoot(async () => {entered = true;}, {lock, log: null});
    await new Promise(done => setTimeout(done, 300));
    assert.equal(entered, false);
    release();
    await Promise.all([first, waiting]);
    assert.equal(entered, true);
});

test('stale cleanup cannot remove a replacement live participant', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    const dead = spawn(process.execPath, ['-e', '0']);
    await new Promise(done => dead.on('exit', done));
    const root = `${lock}.participants-v1`;
    fs.mkdirSync(root);
    const stale = path.join(root, `${dead.pid}-00000000-0000-4000-8000-000000000001`);
    const live = path.join(root, `${process.pid}-00000000-0000-4000-8000-000000000002`);
    fs.mkdirSync(stale);
    fs.writeFileSync(path.join(stale, 'ticket-1'), '');
    const remove = fs.rmSync;
    let substituted = false;
    fs.rmSync = function (target, options) {
        if (target === stale && !substituted) {
            substituted = true;
            // Model a new owner arriving after the stale check. Its unique
            // participant path is distinct from the dead owner's path.
            fs.mkdirSync(live);
            fs.writeFileSync(path.join(live, 'ticket-1'), '');
        }
        return remove.call(this, target, options);
    };
    try {
        let entered = false;
        const waiter = withExclusiveBoot(async () => {entered = true;}, {lock, log: null});
        await new Promise(done => setTimeout(done, 300));
        assert.equal(substituted, true);
        assert.equal(entered, false);
        assert.equal(fs.existsSync(live), true);
        remove(live, {recursive: true, force: true});
        await waiter;
        assert.equal(entered, true);
    } finally {fs.rmSync = remove;}
});

test('a dead participant that never published a ticket is recovered', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    const dead = spawn(process.execPath, ['-e', '0']);
    await new Promise(done => dead.on('exit', done));
    const root = `${lock}.participants-v1`;
    fs.mkdirSync(root);
    fs.mkdirSync(path.join(root, `${dead.pid}-00000000-0000-4000-8000-000000000003`));
    assert.equal(await withExclusiveBoot(async () => 'ran', {lock, log: null}), 'ran');
    assert.deepEqual(fs.readdirSync(root), []);
});

test('a logging error releases the participant', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    await assert.rejects(withExclusiveBoot(async () => {}, {lock, log: path.join(lock, 'missing', 'log')}));
    assert.equal(await withExclusiveBoot(async () => 'ran', {lock, log: null}), 'ran');
    assert.deepEqual(fs.readdirSync(`${lock}.participants-v1`), []);
});
