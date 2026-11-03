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
    assert.equal(fs.existsSync(lock), false);
});

// Bounded so a broken recovery fails instead of waiting forever.
test('a lock left by a dead process is recovered', {timeout: 10000}, async t => {
    const {lock} = scratch(t);
    const dead = spawn(process.execPath, ['-e', '0']);
    await new Promise(done => dead.on('exit', done));
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner'), String(dead.pid));
    assert.equal(await withExclusiveBoot(async () => 'ran', {lock, log: null}), 'ran');
    assert.equal(fs.existsSync(lock), false);
});

test('a live holder blocks until it releases', async t => {
    const {lock} = scratch(t);
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner'), String(process.pid));
    let entered = false;
    const waiting = withExclusiveBoot(async () => {entered = true;}, {lock, log: null});
    await new Promise(done => setTimeout(done, 300));
    assert.equal(entered, false);
    fs.rmSync(lock, {recursive: true, force: true});
    await waiting;
    assert.equal(entered, true);
});
