// SPDX-License-Identifier: BSD-3-Clause
/**
 * PartMeta v2 (docs/ROBOT-LAB-ARCHITECTURE.md §5.4, §5.7): the shipped
 * bw-sim/part-meta/parts.json is a v2 file whose every entry validates; the
 * migration (scripts/migrate-parts-v2.mjs) turns the v1 file into exactly this
 * file and changes nothing when run again; the loader (catalogFrom) gives the
 * same catalogue from a v1 file as from the v2 one; and the v2 fields are
 * checked by name.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePartMeta, upgradePartMeta, partMotor, partSensor, partHubProfile} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {deviceModels, DEVICE_MODELS, validateDeviceModel} from '../overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {migratePartsFile, partsFileText} from '../scripts/migrate-parts-v2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8');
const FILE = JSON.parse(TEXT);

/**
 * The v1 fields of the parts that had them, as parts.json v1 held them (git history of
 * the file before R2). Everything else in a v1 entry is what the v2 entry still has.
 */
const V1_FIELDS = {
    '54696p01.dat': {motor: {output: ['out', 'out0', 'out1', 'out2', 'out3'], outputColliders: [1], maxTorqueNm: 0.18, maxSpeedDegPerSec: 1110, deviceId: 48}},
    '54675.dat': {motor: {output: ['out', 'out0', 'out1', 'out2', 'out3'], outputColliders: [1], maxTorqueNm: 0.38, maxSpeedDegPerSec: 1050, deviceId: 49}},
    '45601.dat': {hub: {ports: ['A', 'B', 'C', 'D', 'E', 'F']}},
    '37308.dat': {sensor: {kind: 'color', origin: [0, 0, -49], direction: [0, 0, -1]}},
    '37316.dat': {sensor: {kind: 'distance', origin: [0, 0, -69], direction: [0, 0, -1]}},
    '37312.dat': {sensor: {kind: 'force', origin: [0, 0, -70], direction: [0, 0, -1]}}
};
const V2_ONLY = ['internalJoints', 'device', 'probe', 'hubProfile'];

/** The v1 file: each v2 entry with its v2 fields replaced, in their place, by the v1 ones. */
const v1File = () => {
    const parts = FILE.parts.map(p => {
        const v1 = V1_FIELDS[p.part];
        if (!v1) return p;
        const out = {};
        for (const [k, v] of Object.entries(p)) {
            if (!V2_ONLY.includes(k)) out[k] = v;
            else if (k === 'internalJoints' || k === 'hubProfile' || (k === 'device' && v1.sensor)) Object.assign(out, v1);
        }
        return out;
    });
    return {...FILE, $comment: FILE.$comment.replace(/^Sim Lab part metadata v2 \([^)]*\)\)\./, 'Sim Lab part metadata v1 (docs/SIM-LAB-PLAN.md B3a).'),
        version: 1, parts};
};

test('the device catalogue is valid and holds the numbers PartMeta v1 held', () => {
    for (const d of DEVICE_MODELS) assert.deepEqual(validateDeviceModel(d), [], d.id);
    for (const [part, v1] of Object.entries(V1_FIELDS)) {
        if (!v1.motor) continue;
        const d = [...deviceModels.values()].find(x => x.parts.includes(part));
        assert.deepEqual([d.motor.stallTorqueNm, d.motor.servoMaxDegPerSec, d.ids.lpf2], [v1.motor.maxTorqueNm, v1.motor.maxSpeedDegPerSec, v1.motor.deviceId], part);
    }
});

test('parts.json is PartMeta v2: version 2, every entry valid, no v1 field left, every device in the catalogue', () => {
    assert.equal(FILE.version, 2);
    assert.ok(FILE.parts.length >= 60, `${FILE.parts.length} parts`);
    for (const p of FILE.parts) {
        assert.deepEqual(validatePartMeta(p), [], p.part);
        for (const k of ['motor', 'sensor', 'hub']) assert.equal(p[k], undefined, `${p.part} still has v1 '${k}'`);
        if (p.device !== undefined) assert.equal(typeof p.device, 'string', `${p.part}: the shipped file names catalogue devices`);
    }
    // Exactly the parts that were motors, sensors and the hub are so in v2.
    const kinds = Object.fromEntries(FILE.parts.filter(p => p.device || p.hubProfile)
        .map(p => [p.part, partMotor(p) ? 'motor' : partSensor(p) ? partSensor(p).device.sensor.kind : partHubProfile(p)]));
    assert.deepEqual(kinds, {'54696p01.dat': 'motor', '54675.dat': 'motor', '45601.dat': 'spike-prime',
        '37308.dat': 'color', '37316.dat': 'distance', '37312.dat': 'force'});
});

test('migrating the v1 file gives exactly the shipped file, and migrating again changes nothing', () => {
    const v1 = v1File();
    assert.equal(v1.parts.filter(p => p.motor || p.sensor || p.hub).length, 6);
    const once = migratePartsFile(v1);
    assert.equal(partsFileText(once), TEXT, 'the v1 file migrates to parts.json byte for byte');
    assert.equal(partsFileText(migratePartsFile(once)), TEXT, 'idempotent');
    assert.equal(partsFileText(migratePartsFile(FILE)), TEXT, 'the shipped file is migrated (scripts/migrate-parts-v2.mjs --check)');
});

test('the loader reads a v1 file as v2: the same catalogue and the same compiled driving base', () => {
    const fromV1 = catalogFrom(v1File());
    const fromV2 = catalogFrom(FILE);
    assert.deepEqual([...fromV1.keys()], [...fromV2.keys()]);
    for (const [part, meta] of fromV2) assert.deepEqual(fromV1.get(part), meta, part);
    const base = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/bw-sim/driving-base.json'), 'utf8'));
    // The raw v1 entries (not upgraded by the loader) compile to the same mechanism too.
    const raw = new Map(v1File().parts.map(p => [p.part, p]));
    const expected = compile(base, fromV2, {version: 2});
    assert.deepEqual(compile(base, raw, {version: 2}), expected);
    assert.equal(expected.actuators.length, 2);
});

test('PartMeta v2 fields: each malformation is named', () => {
    const motor = () => structuredClone(FILE.parts.find(p => p.part === '54696p01.dat'));
    const sensor = () => structuredClone(FILE.parts.find(p => p.part === '37308.dat'));
    const cases = [
        [motor, m => { m.device = 'warp-drive'; }, /device: 'warp-drive' is not in the device catalogue/],
        [motor, m => { m.internalJoints[0].movingConnectors = ['nope']; }, /unknown connector 'nope'/],
        [motor, m => { m.internalJoints[0].movingColliders = [0, 1]; }, /fixed body needs at least one collider/],
        [motor, m => { m.internalJoints[0].massFraction = 1.5; }, /massFraction/],
        [motor, m => { delete m.internalJoints[0].axis; }, /point and axis come together/],
        [motor, m => { m.internalJoints[0].actuatedBy = 'none'; }, /a motor drives exactly one internal joint/],
        [motor, m => { m.motor = V1_FIELDS['54696p01.dat'].motor; }, /both motor \(v1\) and internalJoints \(v2\)/],
        [motor, m => { m.device = {id: 'mine', class: 'motor', parts: [], ids: {}, source: 'measured', motor: {stallTorqueNm: 0.1, servoMaxDegPerSec: 600}}; }, null],
        [motor, m => { m.device = {id: 'mine', class: 'motor', parts: [], ids: {}, motor: {stallTorqueNm: 0.1, servoMaxDegPerSec: 600}}; }, /source/],
        [sensor, m => { delete m.probe; }, /a sensor device needs a probe/],
        [sensor, m => { m.probe.direction = [0, 0, 2]; }, /probe\.direction: not a unit vector/],
        [sensor, m => { m.hubProfile = ''; }, /hubProfile/]
    ];
    for (const [make, mutate, re] of cases) {
        const m = make();
        mutate(m);
        const problems = validatePartMeta(m);
        if (re === null) assert.deepEqual(problems, []);
        else assert.ok(problems.some(p => re.test(p)), `${re} not in ${JSON.stringify(problems)}`);
    }
});

test('upgradePartMeta: a v1 motor that is no catalogue device keeps its numbers as an inline device', () => {
    const v1 = {part: 'my-motor.dat', name: 'My motor', category: 'motor', massGrams: 10,
        connectors: [{id: 'h', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 'ax', type: 'pinhole', position: [0, 0, 20], axis: [0, 0, 1], length: 20}],
        colliders: [{shape: 'box', halfExtents: [10, 10, 10]}, {shape: 'sphere', radius: 5}],
        motor: {output: ['ax'], outputColliders: [1], maxTorqueNm: 0.18, maxSpeedDegPerSec: 600}};
    const v2 = upgradePartMeta(v1);
    assert.equal(upgradePartMeta(v1), v2, 'memoised');
    assert.equal(upgradePartMeta(v2), v2, 'a v2 meta is returned as it is');
    assert.deepEqual(validatePartMeta(v2), []);
    assert.deepEqual(v2.internalJoints, [{id: 'motor', type: 'hinge', movingConnectors: ['ax'], movingColliders: [1], massFraction: 0.15, actuatedBy: 'device'}],
        'no axlehole output: no point/axis (the compiler takes the outputs\' centroid, as v1 did)');
    assert.deepEqual(partMotor(v1).device.motor, {stallTorqueNm: 0.18, servoMaxDegPerSec: 600});
    assert.deepEqual(partMotor(v1).device.ids, {}, 'no deviceId: the hub reports its default');
    assert.equal(v1.motor.maxSpeedDegPerSec, 600, 'the v1 object is not changed');
});
