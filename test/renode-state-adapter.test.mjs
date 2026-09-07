import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = '../overlay/scratch-gui/src/lib/virtual-hub/';
const {default: HubState} = await import(resolve(here, `${base}spike-hub-state.js`));
const {FIRMWARE_IDENTITY_TARGETS, RenodeBrickStateAdapter, encodeBrickCommand, validateBrickStateMessage} =
    await import(resolve(here, `${base}renode-state-adapter.js`));
const fixture = JSON.parse(readFileSync(resolve(here, '../contracts/brick-state/v1/snapshot.ndjson')));

test('canonical fixture reaches VirtualSpikeHubState as immutable neutral data', () => {
    const state = new HubState();
    const adapter = new RenodeBrickStateAdapter(state);
    const neutral = adapter.accept(fixture);
    assert.ok(Object.isFrozen(neutral));
    assert.ok(Object.isFrozen(neutral.target));
    assert.equal(state.data.firmwareTarget, 'official-v3');
    assert.equal(state.data.battery, 87);
    assert.equal(state.data.motors[0].speed, 20);
    assert.equal(state.data.sensors[1].kind, 'distance');
    assert.deepEqual(state.data.display, fixture.display.pixels);
    assert.equal(state.data.neutral.target.imageSha256, fixture.target.imageSha256);
    assert.equal(state.data.neutral.lifecycle.phase, 'ready');
});

test('unknown optional fields survive while version and replay fail closed', () => {
    const state = new HubState();
    const adapter = new RenodeBrickStateAdapter(state);
    assert.equal(validateBrickStateMessage({...fixture, future: true}).future, true);
    adapter.accept(fixture);
    assert.throws(() => adapter.accept(fixture), /replayed/);
    assert.throws(() => validateBrickStateMessage({...fixture, schemaVersion: 2}), /schemaVersion/);
});

test('every board-qualified firmware identity is distinct and unknown pairs fail', () => {
    assert.deepEqual(FIRMWARE_IDENTITY_TARGETS, {
        'spike-prime/lego-prime-v2': 'legacy-v2',
        'spike-prime/lego-prime-v3': 'official-v3',
        'spike-prime/pybricks-prime': 'pybricks',
        'spike-prime/spike-nx': 'spike-nx',
        'spike-prime/brickwright-nuttx': 'brickwright',
        'spike-essential/lego-essential': 'official-essential',
        'spike-essential/pybricks-essential': 'pybricks-essential'
    });
    const adapter = new RenodeBrickStateAdapter(new HubState());
    assert.throws(() => adapter.accept({...fixture, target: {...fixture.target,
        firmware: 'lego-essential'}}), /unknown firmware identity/);
});

test('streaming is framed and sequence gaps must be explicit', () => {
    const gaps = [];
    const adapter = new RenodeBrickStateAdapter(new HubState(), {onGap: gap => gaps.push(gap)});
    const line = JSON.stringify(fixture);
    assert.deepEqual(adapter.feed(line.slice(0, 50)), []);
    assert.equal(adapter.feed(`${line.slice(50)}\n`).length, 1);
    assert.throws(() => adapter.accept({...fixture, seq: 9}), /unannounced/);
    adapter.accept({schemaVersion: 1, type: 'gap', firstDroppedSeq: 8, nextSeq: 9, dropped: 1});
    assert.equal(gaps.length, 1);
    assert.equal(adapter.accept({...fixture, seq: 9}).seq, 9);
});

test('stream bounds apply to each line and batch independently', () => {
    const adapter = new RenodeBrickStateAdapter(new HubState());
    const first = JSON.stringify({...fixture, seq: 1});
    const second = JSON.stringify({...fixture, seq: 2});
    assert.equal(adapter.feed(`${first}\n${second}\n`).length, 2);
    assert.throws(() => new RenodeBrickStateAdapter(new HubState()).feed(`${' '.repeat(256 * 1024 + 1)}\n`),
        /line too long/);
});

test('commands match the shared canonical fixture byte for byte', () => {
    const expected = readFileSync(resolve(here, '../contracts/brick-state/v1/command.ndjson'), 'utf8');
    assert.equal(encodeBrickCommand({requestId: 'req-1', command: 'motor.setSpeed',
        arguments: {port: 'A', speed: 35}, expectedSeq: 7}), expected);
    assert.throws(() => encodeBrickCommand({requestId: 'bad', command: 'x',
        arguments: {value: Number.NaN}}), /non-finite/);
});
