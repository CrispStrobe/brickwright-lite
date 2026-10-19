// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's LWP3 hub, byte by byte (overlay/scratch-gui/src/lib/bw-sim/hubs/lwp3/;
 * docs/LWP3-VIRTUAL-HUB-NOTES.md). Every expected message below is written out by hand from
 * LEGO's public "LEGO Wireless Protocol 3.0.00" document (section numbers cited), NOT built with
 * the module's own encoders, so a mistake in lwp3-protocol.js cannot hide in its own test:
 *
 *   host writes (downstream) → the hub's state → what it notifies (upstream).
 *
 * The motor is turned by the real physics (the shipped Technic Hub motor bench, Jolt) where a
 * command's completion matters; elsewhere the hub is stepped with its own encoder readings.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const {Lwp3VirtualHub, lwp3Hubs} = await import(path.join(SIM, 'hubs/lwp3/lwp3-virtual-hub.js'));
const {LWP3_HUB_TYPES} = await import(path.join(SIM, 'hubs/lwp3/profiles.js'));
const {parse, message} = await import(path.join(SIM, 'hubs/lwp3/lwp3-protocol.js'));
const {validateHubProfile} = await import(path.join(SIM, 'hubs/hub-profile.js'));
const {SimSession, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const BENCH = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/technic-hub-bench.ldr'), 'latin1');
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
const bytes = text => text.split(/\s+/).filter(Boolean).map(h => parseInt(h, 16));

/** A Technic Hub with a Technic large motor (IO type 0x2E) on port A, its messages recorded. */
const technicHub = () => {
    const hub = new Lwp3VirtualHub({id: 'hub', profile: 'technic-hub'});
    assert.deepEqual(hub.plug([{port: 'A', class: 'motor', ids: {lpf2: 46}, device: 'technic-large-motor'}]), []);
    const up = [];
    hub.setSink(b => up.push(hex(b)));
    return {hub, up, send: text => { up.length = 0; hub.receive(Uint8Array.from(bytes(text))); return up.slice(); }};
};

test('the four LWP3 hub profiles validate and are registered', () => {
    for (const t of LWP3_HUB_TYPES.values()) assert.deepEqual(validateHubProfile(t.profile), [], t.profile.id);
    assert.deepEqual(lwp3Hubs.map(h => h.profile.id), ['boost-move-hub', 'pup-city-hub', 'technic-hub', 'spike-essential']);
    assert.deepEqual(LWP3_HUB_TYPES.get('boost-move-hub').profile.parts, ['26910.dat']);
    assert.deepEqual(LWP3_HUB_TYPES.get('technic-hub').profile.parts, ['22127.dat']);
});

test('§3.1/3.2 common header: length, hub id 0, type; two-byte length above 127', () => {
    assert.equal(hex(message(0x01, [0x0b, 0x05])), '05 00 01 0b 05');
    const long = message(0x45, Array(200).fill(7));
    // 204 bytes in all (two length bytes, hub id, type, 200 payload): LSB 1xxx xxxx = 0x80 | (204 & 0x7f) = 0xcc,
    // MSB = 204 >> 7 = 1 (LEGO's own example: 1000 0000, 0000 0001 = 128).
    assert.deepEqual([...long.slice(0, 4)], [0xcc, 0x01, 0x00, 0x45]);
    // The longest one-byte message is 127; the next (125 payload bytes) needs the escape: 129 = 1000 0001, 0000 0001.
    assert.equal(message(0x45, Array(124).fill(0))[0], 127);
    assert.deepEqual([...message(0x45, Array(125).fill(0)).slice(0, 2)], [0x81, 0x01]);
    assert.equal(parse(long).payload.length, 200);
    assert.throws(() => parse([0x09, 0x00, 0x01]), /length byte says 9/);
});

test('§3.8 Hub Attached I/O on subscription: the motor (0x2E) on port 0x00, then the internal devices', () => {
    const {hub, up} = technicHub();
    hub.announce();
    // Attached I/O, 15 bytes: 0F 00 04, port, event 01, IO type UInt16 LE, HW rev Int32, SW rev Int32.
    assert.equal(up[0], '0f 00 04 00 01 2e 00 00 00 00 10 00 00 00 10');
    // The Technic Hub's internal devices (community port map, profiles.js): LED 0x32 (RGB light 0x17),
    // current 0x3B (0x15), voltage 0x3C (0x14), temperature 0x3D (0x3C), accelerometer 0x61 (0x39), gyro 0x62 (0x3A), tilt 0x63 (0x3B).
    assert.deepEqual(up.slice(1).map(m => m.slice(9, 17)), ['32 01 17', '3b 01 15', '3c 01 14', '3d 01 3c', '61 01 39', '62 01 3a', '63 01 3b']);
});

test('§3.5 Hub Properties: Request Update answers with Update (0x06) and the property\'s payload', () => {
    const {send} = technicHub();
    // System Type ID (0x0B): the Technic hub's 0x80 (community, not in LEGO's §2.1 list).
    assert.deepEqual(send('05 00 01 0b 05'), ['06 00 01 0b 06 80']);
    // Battery Voltage (0x06) in percent; Button (0x02) released; Enable Updates answers too.
    assert.deepEqual(send('05 00 01 06 05'), ['06 00 01 06 06 64']);
    assert.deepEqual(send('05 00 01 02 02'), ['06 00 01 02 06 00']);
    // LWP version (0x0A), UInt16 BCD: 3.00 → 00 03.
    assert.deepEqual(send('05 00 01 0a 05'), ['07 00 01 0a 06 00 03']);
    // FW version (0x03), §3.5.6: 1.0.00.9999 → build BCD 0x9999, bugfix 00, 0MMM mmmm = 0x10.
    assert.deepEqual(send('05 00 01 03 05'), ['09 00 01 03 06 99 99 00 10']);
    // Manufacturer name "LEGO System A/S".
    assert.deepEqual(send('05 00 01 08 05'), [`14 00 01 08 06 ${hex([...'LEGO System A/S'].map(c => c.charCodeAt(0)))}`]);
});

for (const [firmware, fw, a, b] of [['current', '24 02 00 10', '00', '01'], ['legacy', '23 02 00 10', '37', '38']]) {
    test(`the BOOST Move Hub on its ${firmware} firmware reports its version and that firmware's port ids (A 0x${a}, B 0x${b})`, () => {
        // scratch-vm scratch3_boost: the port ids changed with 1.0.00.0224 (BoostPort10000223OrOlder: A 55, B 56).
        const hub = new Lwp3VirtualHub({id: 'hub', profile: 'boost-move-hub', firmware});
        hub.plug([{port: 'A', class: 'motor', ids: {lpf2: 39}}, {port: 'B', class: 'motor', ids: {lpf2: 39}}]);
        const up = [];
        hub.setSink(m => up.push(hex(m)));
        hub.receive(Uint8Array.from(bytes('05 00 01 03 05')));
        assert.deepEqual(up, [`09 00 01 03 06 ${fw}`], '§3.5.6: build BCD, bugfix 00, 0MMM mmmm 0x10');
        hub.receive(Uint8Array.from(bytes('05 00 01 0b 05')));
        assert.equal(up[1], '06 00 01 0b 06 40', '§2.1: 010 00000 = Boost Hub');
        up.length = 0;
        hub.announce();
        assert.deepEqual(up.slice(0, 2).map(m => m.slice(0, 17)), [`0f 00 04 ${a} 01 27`, `0f 00 04 ${b} 01 27`]);
        // The internal tilt (0x28) on 0x3A, on either firmware.
        assert.ok(up.some(m => m.startsWith('0f 00 04 3a 01 28 00')), up.join('\n'));
        assert.throws(() => hub.setFirmware('beta'), /no firmware 'beta'/);
    });
}

test('§3.17/§3.23/§3.21 Port Input Format Setup (Single) → Port Input Format (Single) → Port Value (Single)', () => {
    const {hub, send, up} = technicHub();
    // Setup: port 0, mode 2 (POS), delta 1, notify 1 → handshake 0x47 with the same fields, then the value (Int32 0).
    assert.deepEqual(send('0a 00 41 00 02 01 00 00 00 01'), ['0a 00 47 00 02 01 00 00 00 01', '08 00 45 00 00 00 00 00']);
    // The shaft turns 10.4°: the next publish notifies POS = 10 (delta 1).
    hub.writeReadings([{port: 'A', kind: 'encoder', angleRad: 0, deltaRad: 10.4 * Math.PI / 180, radPerSec: 0}]);
    up.length = 0;
    hub.publish();
    assert.deepEqual(up, ['08 00 45 00 0a 00 00 00']);
    // Unchanged: nothing new. Mode 1 (SPEED, Int8 %): one byte.
    up.length = 0;
    hub.publish();
    assert.deepEqual(up, []);
    // Mode 3 (APOS, Int16 −180..179) on an absolute motor.
    assert.deepEqual(send('0a 00 41 00 03 05 00 00 00 01'), ['0a 00 47 00 03 05 00 00 00 01', '06 00 45 00 0a 00']);
    // A port with no device: §3.9 Generic Error, Invalid use (0x06) of command 0x41.
    assert.deepEqual(send('0a 00 41 02 02 01 00 00 00 01'), ['05 00 05 41 06']);
});

test('§3.9 Generic Error: an unimplemented message type is "Command NOT recognized" (0x05)', () => {
    const {send} = technicHub();
    assert.deepEqual(send('05 00 21 00 01'), ['05 00 05 21 05'], 'Port Information Request is not implemented');
    assert.deepEqual(send('06 00 61 01 00 01'), ['05 00 05 61 05'], 'nor Virtual Port Setup');
    // A synchronised sub command (StartSpeed(Speed1, Speed2) 0x08) on a single port: not recognised either.
    assert.deepEqual(send('0a 00 81 00 11 08 32 32 64 00'), ['05 00 05 81 05']);
});

test('§3.27/§3.32 output commands and their feedback, the §4 buffering state machine', () => {
    const {hub, send} = technicHub();
    // StartSpeed (0x07): speed 50 %, max power 80, no profile; execute immediately + feedback → Idle + completed (0x0A).
    assert.deepEqual(send('09 00 81 00 11 07 32 50 00'), ['05 00 82 00 0a']);
    const st = hub.motors.get('A');
    assert.equal(st.mode, 'speed');
    assert.equal(st.speedPct, 50);
    assert.equal(st.maxPower, 80);
    // StartSpeedForDegrees (0x0B): Int32 90, speed −30 (direction by sign), max 100, EndState 126 (HOLD) → in progress (0x01).
    // It interrupts nothing that would complete (StartSpeed does not), so no "discarded".
    assert.deepEqual(send('0e 00 81 00 11 0b 5a 00 00 00 e2 64 7e 00'), ['05 00 82 00 01']);
    assert.equal(st.mode, 'degrees');
    assert.equal(st.targetDeg, -90);
    assert.equal(st.endState, 'hold');
    // A "buffer if necessary" command (startup 0x0_) while busy: buffered, Busy/Full (0x10).
    assert.deepEqual(send('0e 00 81 00 01 0d 00 00 00 00 32 64 7f 00'), ['05 00 82 00 10']);
    // A second one: the one-slot buffer is full → §3.9 Buffer Overflow (0x03).
    assert.deepEqual(send('0e 00 81 00 01 0d 00 00 00 00 32 64 7f 00'), ['05 00 05 81 03']);
    // Execute immediately discards the running AND the buffered command: Busy/Empty + discarded (0x05).
    assert.deepEqual(send('0e 00 81 00 11 0b 2d 00 00 00 32 64 7f 00'), ['05 00 82 00 05']);
    assert.equal(st.buffered, null);
    // StartPower is WriteDirectModeData (0x51) mode 0 (§6.1): 127 = BRAKE, 0 = FLOAT, else a duty with no regulation.
    assert.deepEqual(send('08 00 81 00 11 51 00 7f'), ['05 00 82 00 0e'], 'discards the degrees command, completes at once');
    assert.equal(st.mode, 'brake');
    send('08 00 81 00 11 51 00 00');
    assert.equal(st.mode, 'float');
    send('08 00 81 00 11 51 00 c4');
    assert.deepEqual([st.mode, st.power], ['power', -60]);
    hub.advanceTo(5);
    assert.equal(hub.readDrives()[0].duty, -0.6);
    // PresetEncoder: WriteDirectModeData mode 2 with an Int32 (§6.1), and the 0x14 form the extensions send on one port.
    send('0b 00 81 00 11 51 02 e8 03 00 00');
    assert.equal(hub.readPort('A').angleDeg, 1000);
    send('0a 00 81 00 11 14 00 00 00 00');
    assert.equal(hub.readPort('A').angleDeg, 0);
    // SetAccTime (0x05), Int16 ms, profile 1: stored, completes at once.
    assert.deepEqual(send('09 00 81 00 11 05 f4 01 01'), ['05 00 82 00 0a']);
    assert.equal(st.accMs, 500);
    // A command to a port without a motor: Invalid use.
    assert.deepEqual(send('09 00 81 01 11 07 32 64 00'), ['05 00 05 81 06']);
});

test('§3.27.9 on the physics: StartSpeedForDegrees 360 turns the Technic large motor 360 ± 2° and then reports completed', async () => {
    const {session} = await SimSession.fromText(BENCH, {hubState: null, catalog: CATALOG});
    try {
        const hub = session.hubs[0].hub;
        assert.equal(hub.profile.id, 'technic-hub');
        const up = [];
        hub.setSink(b => up.push(hex(b)));
        for (let t = 0; t < 300; t += 16) session.tick(16);
        hub.receive(Uint8Array.from(bytes('0a 00 41 00 02 01 00 00 00 01')));
        hub.receive(Uint8Array.from(bytes('0e 00 81 00 11 0b 68 01 00 00 32 64 7f 00')));
        assert.equal(up.at(-1), '05 00 82 00 01', 'in progress');
        let doneAt = null;
        for (let t = 0; t < 3000; t += 16) {
            session.tick(16);
            if (doneAt === null && up.includes('05 00 82 00 0a')) doneAt = session.time;
        }
        assert.ok(doneAt !== null, 'completed (Idle + completed)');
        const angle = hub.readPort('A').angleDeg;
        assert.ok(Math.abs(angle - 360) <= 2, `${angle.toFixed(2)}°`);
        // The last POS value notified is the encoder, rounded: 08 00 45 00 + Int32.
        const last = up.filter(m => m.startsWith('08 00 45 00')).at(-1);
        const pos = new DataView(Uint8Array.from(bytes(last)).buffer).getInt32(4, true);
        assert.ok(Math.abs(pos - Math.round(angle)) <= 1, `${last} vs ${angle}`);
        // GotoAbsolutePosition (0x0D) back to 0 with HOLD.
        hub.receive(Uint8Array.from(bytes('0e 00 81 00 11 0d 00 00 00 00 32 64 7e 00')));
        for (let t = 0; t < 3000; t += 16) session.tick(16);
        assert.ok(Math.abs(hub.readPort('A').angleDeg) <= 2, `${hub.readPort('A').angleDeg}`);
        assert.equal(hub.motors.get('A').mode, 'hold');
    } finally {
        session.dispose();
    }
});

test('the worker\'s mirror: export/import carries everything that decides a drive', () => {
    const {hub, send} = technicHub();
    send('09 00 81 00 11 07 32 50 00');
    for (let t = 5; t <= 50; t += 5) {
        hub.advanceTo(t);
        hub.writeReadings([{port: 'A', kind: 'encoder', angleRad: 0, deltaRad: 0.01, radPerSec: 2}]);
    }
    const mirror = lwp3Hubs.find(h => h.profile.id === 'technic-hub').createVirtualHub({id: 'hub'});
    mirror.plug([{port: 'A', class: 'motor', ids: {lpf2: 46}, device: 'technic-large-motor'}]);
    mirror.importState(structuredClone(hub.exportState()));
    assert.equal(mirror.stateKey(mirror.exportState()), hub.stateKey(hub.exportState()));
    hub.advanceTo(55);
    mirror.advanceTo(55);
    assert.deepEqual(mirror.readDrives(), hub.readDrives());
});

test('the BOOST rover at full speed: a 50 ms start skew turns it by the skew\'s arc, and it holds that heading (no spin-out)', async () => {
    // The shipped rover's wheels (radius 70 LDU) on the Move Hub's outputs, 250 LDU apart. A front-driven
    // chassis on ball castors needs differential traction to hold a turn; on the narrower first version of this
    // model (170 LDU) the outer wheel's controller saturated at 100 % and the rover spun out.
    const text = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/boost-rover.ldr'), 'latin1');
    const {session} = await SimSession.fromText(text, {hubState: null, catalog: CATALOG, mat: 'plain'});
    try {
        const hub = session.hubs[0].hub;
        const body = session.hubs[0].body;
        const yaw = () => {
            const s = session.snapshot();
            const i = s.bodyIds.indexOf(body);
            const [qx, qy, qz, qw] = [3, 4, 5, 6].map(k => s.bodies[i * 7 + k]);
            return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) * 180 / Math.PI;
        };
        for (let t = 0; t < 300; t += 5) session.tick(5);
        const y0 = yaw();
        // StartSpeed 100 %, max power 100, to A, then to B 50 ms later (the extension's queue spacing).
        hub.receive(Uint8Array.from(bytes('09 00 81 00 11 07 64 64 00')));
        for (let t = 0; t < 50; t += 5) session.tick(5);
        hub.receive(Uint8Array.from(bytes('09 00 81 01 11 07 64 64 00')));
        const cruise = [];
        for (let t = 0; t < 1600; t += 5) {
            session.tick(5);
            if (t >= 1200) cruise.push(yaw() - y0);
        }
        const speed = hub.readPort('B').speedDps;
        const expected = speed * 0.05 * (70 / 250) ;
        assert.ok(Math.abs(Math.abs(cruise[0]) - expected) <= 5, `heading ${cruise[0].toFixed(1)}°, the skew explains ${expected.toFixed(1)}°`);
        assert.ok(Math.max(...cruise) - Math.min(...cruise) < 2, `held: ${Math.min(...cruise).toFixed(1)}…${Math.max(...cruise).toFixed(1)}°`);
    } finally {
        session.dispose();
    }
});
