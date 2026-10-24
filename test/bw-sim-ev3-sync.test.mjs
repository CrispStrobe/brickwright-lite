// SPDX-License-Identifier: BSD-3-Clause
// Independent EV3 FDK sync command invariants. The coupling law itself is the
// Lab's model, not copied firmware or a hardware accuracy qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
import {createEv3Session} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-peripheral.js';

const brick = ({mixed = false} = {}) => {
    const hub = new Ev3VirtualHub();
    assert.deepEqual(hub.plug(['B', 'C'].map((port, i) => ({port, class: 'motor', ids: {},
        device: mixed && i === 1 ? 'ev3-medium-motor' : 'ev3-large-motor'}))), []);
    return hub;
};
const signed16 = n => [0x82, n & 255, (n >> 8) & 255];
const sync = (hub, {speed = 40, turn = 0, unit = 'deg', amount = 360, brake = 1} = {}) => {
    const replies = [];
    const link = createEv3Session(() => hub, {send: bytes => replies.push([...bytes]), close () {}});
    // STEP_SYNC b0 / TIME_SYNC b1, then OUTPUT_READY on the same pair.
    const code = [unit === 'deg' ? 0xb0 : 0xb1, 0, 6, 0x81, speed & 255, ...signed16(turn), ...signed16(amount), brake, 0xaa, 0, 6];
    link.receive(Uint8Array.from([code.length + 5, 0, 7, 0, 0, 0, 0, ...code]));
    return {link, replies};
};

for (const [turn, shares] of [[-200, [-1, 1]], [-150, [-0.5, 1]], [-100, [0, 1]], [-50, [0.5, 1]],
    [0, [1, 1]], [50, [1, 0.5]], [100, [1, 0]], [150, [1, -0.5]], [200, [1, -1]]]) {
    test(`FDK turn ${turn} preserves signed shaft ratio in both travel directions`, () => {
        for (const speed of [40, -40]) {
            const hub = brick();
            const guest = sync(hub, {speed, turn});
            hub.advanceTo(5);
            const [B, C] = hub.s.outputs.slice(1, 3);
            const full = 1050 * speed / 100;
            assert.deepEqual([B.refDps, C.refDps], shares.map(share => full * share || 0));
            assert.deepEqual(guest.replies, []);
            guest.link.close();
        }
    });
}

test('shaft phase error slows the leading shaft and speeds the lagging shaft, including counter-rotation', () => {
    for (const turn of [0, 50, 150, 200, -50, -150, -200]) for (const speed of [-40, 40]) {
        const hub = brick();
        const guest = sync(hub, {turn, speed, amount: 0});
        hub.advanceTo(5);
        const master = turn >= 0 ? hub.s.outputs[1] : hub.s.outputs[2];
        const follower = turn >= 0 ? hub.s.outputs[2] : hub.s.outputs[1];
        const before = [master.refDps, follower.refDps];
        const direction = Math.sign(before[1]);
        // The master advanced; the follower is ten degrees behind its ratio.
        master.angleDeg = Math.sign(speed) * 30;
        follower.angleDeg = master.angleDeg * before[1] / before[0] - direction * 10;
        hub.advanceTo(10);
        assert.ok(Math.sign(speed) * (master.refDps - before[0]) < 0, `turn ${turn}: leading master must ease off`);
        assert.ok(direction * (follower.refDps - before[1]) > 0, `turn ${turn}: lagging follower must recover`);
        assert.ok(Math.abs(master.refDps) <= 1050 && Math.abs(follower.refDps) <= 1050, 'bounded motor references');
        guest.link.close();
    }
});

test('a stationary inner shaft resists displacement and mixed motors retain a common shaft scale', () => {
    for (const turn of [-100, 0, 50, 100]) {
        const hub = brick({mixed: true});
        const guest = sync(hub, {turn, amount: 0});
        hub.advanceTo(5);
        const [B, C] = hub.s.outputs.slice(1, 3);
        const reference = turn >= 0 ? B.refDps : C.refDps;
        const ratio = (100 - Math.abs(turn)) / 100;
        const inner = turn >= 0 ? C : B;
        assert.equal(inner.refDps, reference * ratio);
        if (Math.abs(turn) === 100) {
            inner.angleDeg = 5;
            hub.advanceTo(10);
            assert.ok(inner.refDps < 0, 'displaced stationary shaft corrects toward its admitted origin');
        }
        guest.link.close();
    }
});

test('STEP ends both outputs at the master count; TIME ends them on the same clock; zero stays unbounded', () => {
    for (const turn of [-150, 150]) {
        const hub = brick();
        const guest = sync(hub, {turn, amount: 360});
        const master = turn >= 0 ? hub.s.outputs[1] : hub.s.outputs[2];
        const follower = turn >= 0 ? hub.s.outputs[2] : hub.s.outputs[1];
        follower.angleDeg = 400;
        hub.advanceTo(5); hub.publish();
        assert.equal(guest.replies.length, 0, 'follower cannot finish a master-count command');
        master.angleDeg = 360;
        hub.advanceTo(10); hub.publish();
        assert.deepEqual(guest.replies, [[3, 0, 7, 0, 2]]);
        for (const port of [master, follower]) { assert.equal(port.job, null); assert.equal(port.decay, 'brake'); }
        guest.link.close();
    }
    for (const amount of [0, 200]) {
        const hub = brick();
        const guest = sync(hub, {unit: 'ms', amount, brake: 0});
        hub.advanceTo(199); hub.publish();
        assert.equal(guest.replies.length, 0);
        hub.advanceTo(200); hub.publish();
        assert.equal(guest.replies.length, amount ? 1 : 0);
        for (const port of hub.s.outputs.slice(1, 3)) assert.equal(port.busy, !amount);
        guest.link.close();
    }
});

test('worker state preserves coupling origins, and replacing one output retires its old pair', () => {
    const hub = brick();
    const guest = sync(hub, {amount: 0, turn: 50});
    hub.s.outputs[1].angleDeg = 30;
    hub.s.outputs[2].angleDeg = 5;
    hub.advanceTo(5);
    const mirror = brick();
    mirror.importState(hub.exportState());
    hub.advanceTo(10); mirror.advanceTo(10);
    assert.deepEqual(mirror.exportState(), hub.exportState());
    hub.outputSet(0, 4, 'speed', 10);
    hub.outputStart(0, 4);
    hub.s.outputs[2].angleDeg = -10000;
    hub.advanceTo(15);
    assert.equal(hub.s.outputs[1].job, null, 'the old pair is interrupted before the new independent command');
    assert.equal(hub.s.outputs[1].busy, false);
    assert.equal(hub.s.outputs[1].duty, 0);
    assert.equal(hub.s.outputs[1].decay, 'coast');
    assert.equal(hub.s.outputs[2].refDps, 105, 'new independently owned job retains its own reference');
    guest.link.close();
});

test('FDK independent stop, reset, level, polarity and finite commands retire the affected sync pair', () => {
    const commands = [
        ['stop', (hub, mask) => hub.outputStop(0, mask, true)],
        ['reset', (hub, mask) => hub.outputReset(0, mask)],
        ['speed', (hub, mask) => hub.outputSet(0, mask, 'speed', 10)],
        ['power', (hub, mask) => hub.outputSet(0, mask, 'power', 10)],
        ['polarity', (hub, mask) => hub.outputPolarity(0, mask, -1)],
        ['finite', (hub, mask) => hub.outputProfile(0, mask,
            {regulated: true, unit: 'degrees', value: 10, steps: [0, 90, 0], brake: true})]
    ];
    for (const [name, command] of commands) for (const index of [1, 2]) {
        const hub = brick();
        const guest = sync(hub);
        hub.advanceTo(5);
        command(hub, 1 << index);
        const other = hub.s.outputs[index === 1 ? 2 : 1];
        assert.equal(other.job, null, `${name}: partner's old finite command is retired`);
        assert.equal(other.busy, false);
        assert.equal(other.duty, 0);
        assert.equal(other.decay, 'coast');
        assert.notEqual(hub.s.outputs[index].job?.kind, 'sync');
        if (name !== 'finite') assert.deepEqual(guest.replies, [[3, 0, 7, 0, 2]], `${name}: original READY releases`);
        else assert.deepEqual(guest.replies, [], 'READY still sees the new finite job on its selected mask');
        guest.link.close();
    }
});

test('START and CLR_COUNT preserve an already-running sync job', () => {
    const hub = brick();
    const guest = sync(hub);
    const jobs = hub.s.outputs.slice(1, 3).map(port => port.job);
    hub.outputStart(0, 2);
    hub.outputClearCount(0, 4);
    assert.deepEqual(hub.s.outputs.slice(1, 3).map(port => port.job), jobs);
    assert.equal(hub.outputBusy(0, 6), true);
    assert.deepEqual(guest.replies, []);
    guest.link.close();
});
