// SPDX-License-Identifier: Apache-2.0
//
// What happens to a project saved before the five SPIKE extensions became one.
//
// spike-unified-coverage.test.mjs proves the migration TABLE is complete and
// well formed against the frozen ledger. This proves the migration FUNCTION
// does what the table says to real sb3 structures — the blocks, the fields,
// the monitors, and the project's extension list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../overlay/scratch-vm/src/extension-support/spike-legacy-migration.js');
const ledger = require('./fixtures/spike-legacy-ledger.json');

const {migrateBlock, migrateProject, resolveOpcode} = migration;

/** A block as sb3 stores one. */
const block = (opcode, fields = {}, inputs = {}) => ({
    opcode, next: null, parent: null, inputs, fields, shadow: false, topLevel: false
});

const project = blocks => ({
    targets: [{isStage: true, name: 'Stage', blocks: {}},
        {isStage: false, name: 'Sprite1', blocks}],
    monitors: [],
    extensions: []
});

test('a spikeprime project is left completely alone', () => {
    // The base vocabulary does not move. This is the case that must cost
    // nothing, because it is most of the existing projects.
    const before = block('spikeprime_motorRunFor',
        {PORT: ['A', null], DIRECTION: ['1', null], UNIT: ['rotations', null]},
        {VALUE: [1, [4, '2']]});
    const after = JSON.parse(JSON.stringify(before));
    assert.equal(migrateBlock(after), false, 'nothing should have changed');
    assert.deepEqual(after, before);
});

test('a renamed opcode is rewritten and its arguments kept', () => {
    const b = block('legospikeprimeBLE_getColorSensorColor', {PORT: ['B', null]});
    assert.equal(migrateBlock(b), true);
    assert.equal(b.opcode, 'spikeprime_getColor');
    assert.deepEqual(b.fields, {PORT: ['B', null]}, 'the port survives the rename');
});

test('direction words become the signed menu values', () => {
    const forward = block('legospikeprimeBLE_motorRun',
        {PORT: ['A', null], DIRECTION: ['forward', null]});
    const backward = block('legospikeprimeBLE_motorRunForTime',
        {PORT: ['C', null], DIRECTION: ['backward', null], UNIT: ['seconds', null]});
    migrateBlock(forward);
    migrateBlock(backward);
    assert.equal(forward.opcode, 'spikeprime_motorStart');
    assert.deepEqual(forward.fields.DIRECTION, ['1', null]);
    assert.equal(backward.opcode, 'spikeprime_motorRunFor');
    assert.deepEqual(backward.fields.DIRECTION, ['-1', null]);
    assert.deepEqual(backward.fields.UNIT, ['seconds', null], 'other fields are untouched');
});

test('the millimetre readers keep reading millimetres', () => {
    // The whole point of getDistanceIn. Both BLE extensions reported mm; the
    // unified getDistance means cm. Migrating them to getDistance would have
    // silently divided every reading by ten.
    for (const opcode of ['spikeprimeble_getDistance', 'legospikeprimeBLE_getDistanceSensor']) {
        const b = block(opcode, {PORT: ['B', null]});
        assert.equal(migrateBlock(b), true);
        assert.equal(b.opcode, 'spikeprime_getDistanceIn');
        assert.deepEqual(b.fields.UNIT, ['mm', null], `${opcode} must still read millimetres`);
        assert.deepEqual(b.fields.PORT, ['B', null]);
    }
});

test('the centimetre reader is not touched', () => {
    const b = block('spikeprime_getDistance', {PORT: ['B', null]});
    assert.equal(migrateBlock(b), false);
    assert.equal(b.opcode, 'spikeprime_getDistance');
    assert.equal(b.fields.UNIT, undefined, 'no unit is invented for the block that has a meaning');
});

test('the getOrientation collision resolves by argument, not by name', () => {
    // spikeprime_getOrientation reports an orientation name and takes nothing.
    // spikeprimeble_getOrientation takes an AXIS and reports an angle. They
    // are different blocks that happened to share a method name.
    const nameReporter = block('spikeprime_getOrientation');
    const angleReporter = block('spikeprimeble_getOrientation', {AXIS: ['roll', null]});
    migrateBlock(nameReporter);
    migrateBlock(angleReporter);
    assert.equal(nameReporter.opcode, 'spikeprime_getOrientation');
    assert.equal(angleReporter.opcode, 'spikeprime_getAngle');
    assert.deepEqual(angleReporter.fields.AXIS, ['roll', null]);
});

test('the three single-axis reporters gain the axis they always meant', () => {
    for (const [opcode, axis] of [['getYaw', 'yaw'], ['getPitch', 'pitch'], ['getRoll', 'roll']]) {
        const b = block(`legospikeprimeBLE_${opcode}`);
        migrateBlock(b);
        assert.equal(b.opcode, 'spikeprime_getAngle');
        assert.deepEqual(b.fields.AXIS, [axis, null]);
    }
});

test('an injected field never overwrites a value the project already had', () => {
    const withInput = block('spikeprimeble_getDistance', {PORT: ['B', null]},
        {UNIT: [3, 'someReporterId']});
    migrateBlock(withInput);
    assert.equal(withInput.fields.UNIT, undefined,
        'a reporter plugged into UNIT must win over the default');
    assert.ok(withInput.inputs.UNIT, 'and must still be there');
});

test('a whole project migrates: blocks, monitors, and the extension list', () => {
    const p = project({
        a: block('spikeprimeble_startMotor', {PORT: ['A', null]}, {SPEED: [1, [4, '50']]}),
        b: block('legospikeprimeBLE_getBattery'),
        c: block('spikeprimeBridge_connectHub', {}, {URL: [1, [10, 'localhost:8081']]}),
        d: block('spikeprime_displayText', {}, {TEXT: [1, [10, 'hi']]})
    });
    p.extensions = ['spikeprimeble', 'legospikeprimeBLE', 'spikeprimeBridge', 'spikeprime'];
    p.monitors = [{id: 'm1', opcode: 'spikeprimeble_getDistance', params: {PORT: 'B'}}];

    const changed = migrateProject(p);
    const blocks = p.targets[1].blocks;

    assert.equal(blocks.a.opcode, 'spikeprime_startMotor', 'a unique name is kept as-is');
    assert.equal(blocks.b.opcode, 'spikeprime_getBatteryLevel');
    assert.equal(blocks.c.opcode, 'spikeprime_connectHubAt', 'the addressed connect gets its own opcode');
    assert.deepEqual(blocks.c.inputs.URL, [1, [10, 'localhost:8081']], 'the relay address survives');
    assert.equal(blocks.d.opcode, 'spikeprime_displayText', 'an already-unified block is untouched');

    assert.deepEqual(p.extensions, ['spikeprime'],
        'four ids collapse to one, without duplicates');

    assert.equal(p.monitors[0].opcode, 'spikeprime_getDistanceIn');
    assert.equal(p.monitors[0].params.UNIT, 'mm', 'a watched reporter keeps its unit too');
    assert.equal(changed, 4, 'three blocks and one monitor');
});

test('nothing outside the SPIKE family is touched', () => {
    const p = project({
        a: block('motion_movesteps', {}, {STEPS: [1, [4, '10']]}),
        b: block('legopoweredup_motorOn', {PORT: ['A', null]}),
        c: block('ev3comprehensive_motorTurnClockwise')
    });
    p.extensions = ['legopoweredup', 'ev3comprehensive'];
    assert.equal(migrateProject(p), 0);
    assert.deepEqual(p.extensions, ['legopoweredup', 'ev3comprehensive']);
    assert.equal(p.targets[1].blocks.b.opcode, 'legopoweredup_motorOn');
});

test('malformed project data is survived, not thrown on', () => {
    // A project file is not trusted input. A loader that throws here loses the
    // whole project over one bad entry.
    assert.equal(migrateBlock(null), false);
    assert.equal(migrateBlock({}), false);
    assert.equal(migrateBlock({opcode: 42}), false);
    assert.equal(migrateBlock({opcode: 'nounderscore'}), false);
    assert.equal(migrateBlock({opcode: '_leading'}), false);
    assert.equal(migrateProject(null), 0);
    assert.equal(migrateProject({}), 0);
    assert.equal(migrateProject({targets: [null, {blocks: null}]}), 0);
    assert.equal(migrateProject({monitors: [null, 'x']}), 0);
});

test('migration is idempotent', () => {
    // Loading a migrated project again must not move it a second time.
    const p = project({a: block('spikeprimeble_getDistance', {PORT: ['B', null]})});
    p.extensions = ['spikeprimeble'];
    migrateProject(p);
    const once = JSON.parse(JSON.stringify(p));
    assert.equal(migrateProject(p), 0, 'a second pass changes nothing');
    assert.deepEqual(p, once);
});

test('every opcode in the frozen ledger survives a real migration pass', () => {
    // The exhaustive one: build a project holding all 236 legacy blocks with
    // their default arguments, migrate it, and require that each lands on a
    // spikeprime opcode with nothing dropped.
    const blocks = {};
    let n = 0;
    for (const [legacyId, ext] of Object.entries(ledger.extensions)) {
        for (const b of ext.blocks) {
            const fields = {};
            for (const [name, arg] of Object.entries(b.arguments || {})) {
                if (arg.menu) fields[name] = [String(arg.defaultValue ?? ''), null];
            }
            blocks[`b${n++}`] = block(`${legacyId}_${b.opcode}`, fields);
        }
    }
    const p = project(blocks);
    migrateProject(p);

    for (const [key, b] of Object.entries(p.targets[1].blocks)) {
        assert.ok(b.opcode.startsWith('spikeprime_'),
            `${key} did not reach the unified extension: ${b.opcode}`);
        const resolved = resolveOpcode(b.opcode);
        assert.equal(resolved.opcode, b.opcode, `${b.opcode} would migrate again`);
    }
    assert.equal(Object.keys(p.targets[1].blocks).length, 236);
});
