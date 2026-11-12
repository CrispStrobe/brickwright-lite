import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {snapshotScopedGuest} from '../scripts/snapshot-scoped-browser-guest.mjs';
const setup = t => {
    const root = mkdtempSync(path.join(tmpdir(), 'guest-snapshot-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const source = path.join(root, 'artifacts/sim-lab');
    const take = (model = 'apex', outcome = 'failure') => snapshotScopedGuest({source,
        destination: path.join(root, model), model,
        stepId: model === 'apex' ? 'scoped_robot_apex' : 'scoped_robot_tempest', outcome, conclusion: outcome});
    return {root, source, take};
};
test('separate failure snapshot retains original before next guest reuses its filename', t => {
    const f = setup(t);mkdirSync(f.source, {recursive: true});
    const child = spawnSync(process.execPath, ['-e',
        'require("node:fs").writeFileSync(process.argv[1],"apex failure original");process.exit(3)', path.join(f.source, 'track.json')]);
    assert.equal(child.status, 3);
    const first = f.take();assert.equal(first.outcome, 'failure');
    assert.deepEqual(readdirSync(f.source), []);
    writeFileSync(path.join(f.source, 'track.json'), 'tempest original');
    f.take('tempest-pendulum', 'success');
    assert.equal(readFileSync(path.join(f.root, 'apex/originals/track.json'), 'utf8'), 'apex failure original');
    assert.equal(readFileSync(path.join(f.root, 'tempest-pendulum/originals/track.json'), 'utf8'), 'tempest original');
});
test('post-timeout snapshot works after producing shell never reaches inline cleanup', t => {
    const f = setup(t);mkdirSync(f.source, {recursive: true});
    const child = spawnSync(process.execPath, ['-e',
        'require("node:fs").writeFileSync(process.argv[1],"timeout original");setInterval(()=>{},1000)', path.join(f.source, 'track.json')], {timeout: 300});
    assert.equal(child.error?.code, 'ETIMEDOUT');
    assert.equal(child.signal, 'SIGTERM');
    f.take();
    assert.equal(readFileSync(path.join(f.root, 'apex/originals/track.json'), 'utf8'), 'timeout original');
    assert.equal(JSON.parse(readFileSync(path.join(f.root, 'apex/step.json'))).conclusion, 'failure');
});
test('no produced files still retains producing outcome and an empty-output receipt', t => {
    const f = setup(t);
    const receipt = f.take();
    assert.equal(receipt.sourcePresent, false);
    assert.deepEqual(receipt.topLevelEntries, []);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, 'apex/step.json'))), receipt);
    assert.deepEqual(readdirSync(f.source), []);
});
test('an existing snapshot refuses overwrite and leaves later output intact', t => {
    const f = setup(t);f.take();
    writeFileSync(path.join(f.source, 'later.json'), 'later original');
    assert.throws(() => f.take(), /exist/i);
    assert.equal(readFileSync(path.join(f.source, 'later.json'), 'utf8'), 'later original');
});

test('unknown model or step identity refuses before moving originals', t => {
    const f = setup(t);mkdirSync(f.source, {recursive: true});
    writeFileSync(path.join(f.source, 'track.json'), 'held original');
    for (const [model, stepId] of [['other', 'other'], ['apex', 'wrong-step']]) {
        assert.throws(() => snapshotScopedGuest({source: f.source, destination: path.join(f.root, model),
            model, stepId, outcome: 'failure', conclusion: 'failure'}));
    }
    assert.equal(readFileSync(path.join(f.source, 'track.json'), 'utf8'), 'held original');
});
