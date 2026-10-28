// SPDX-License-Identifier: Apache-2.0
//
// Old EV3 projects open, and open MEANING THE SAME THING.
//
// A migration that merely renames opcodes passes a coverage check and can
// still change a program: legoev3direct spelled several readings as one block
// per mode where the unified extension has a menu, so `gyro [PORT] angle`
// becomes `gyro sensor [PORT] [MODE]` — and if MODE is not preset, the block
// silently reads whatever the menu defaults to. These tests are about the
// fields, not the names.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {quietConsole} from './helpers/quiet-console.mjs';

const require = createRequire(import.meta.url);
quietConsole();

const m = await import('../overlay/scratch-gui/src/lib/ev3-legacy-migration.js');
const ledger = require('./fixtures/ev3-legacy-ledger.json');

test('a retired id resolves; the surviving one is left alone', () => {
    assert.equal(m.resolveOpcode('legoev3direct_motorOn').opcode, 'ev3comprehensive_motorRun');
    assert.equal(m.resolveOpcode('ev3lms_compileToRBF').opcode, 'ev3comprehensive_compileToRBF');
    // The flagship's own blocks must pass through untouched — this is the
    // common case, and a table that rewrote them would be churn at best.
    assert.equal(m.resolveOpcode('ev3comprehensive_motorRun').opcode, 'ev3comprehensive_motorRun');
    assert.deepEqual(m.resolveOpcode('ev3comprehensive_motorRun').addFields, {});
    // An unrelated extension is not this migration's business.
    assert.equal(m.resolveOpcode('pen_clear').opcode, 'pen_clear');
    assert.equal(m.resolveOpcode('ev3dev_ev3Beep').opcode, 'ev3dev_ev3Beep');
});

test('mode-per-block readings keep their meaning through the preset', () => {
    const cases = [
        ['legoev3direct_getGyroAngle', 'gyroSensor', {MODE: 'angle'}],
        ['legoev3direct_getGyroRate', 'gyroSensor', {MODE: 'rate'}],
        ['legoev3direct_getColor', 'colorSensor', {MODE: 'color'}],
        ['legoev3direct_getAmbientLight', 'colorSensor', {MODE: 'ambient'}],
        ['legoev3direct_getReflectedLight', 'colorSensor', {MODE: 'reflected'}],
        ['legoev3direct_getUltrasonicDistance', 'ultrasonicSensor', {UNIT: 'cm'}]
    ];
    for (const [saved, opcode, fields] of cases) {
        const resolved = m.resolveOpcode(saved);
        assert.equal(resolved.opcode, `ev3comprehensive_${opcode}`, saved);
        assert.deepEqual(resolved.addFields, fields, saved);
    }
});

test('a preset never overwrites a value the project already carries', () => {
    // Migrating twice must be a no-op the second time. Without the guard, a
    // user who had changed the mode would have their choice replaced by the
    // preset on the next load.
    const block = {opcode: 'legoev3direct_getGyroAngle', fields: {}};
    assert.equal(m.migrateBlock(block), true);
    block.fields.MODE = ['rate', null];
    assert.equal(m.migrateBlock(block), false, 'the second pass changed something');
    assert.deepEqual(block.fields.MODE, ['rate', null], 'the user\'s choice was clobbered');
});

test('a whole project moves: blocks, monitors and the extensions list', () => {
    const project = {
        extensions: ['legoev3direct', 'ev3lms', 'pen'],
        targets: [{blocks: {
            a: {opcode: 'legoev3direct_getGyroAngle', fields: {}},
            b: {opcode: 'legoev3direct_getNXTLight'},
            c: {opcode: 'ev3comprehensive_motorRun'},
            d: ['a list reporter, not a block']
        }}],
        monitors: [{opcode: 'legoev3direct_getUltrasonicDistance'}]
    };
    const moved = m.migrateProject(project);
    assert.equal(moved, 3, 'two blocks and one monitor');
    assert.deepEqual(project.extensions, ['ev3comprehensive', 'pen'],
        'the two retired ids collapse into one, without duplicating it');
    assert.equal(project.targets[0].blocks.a.opcode, 'ev3comprehensive_gyroSensor');
    assert.deepEqual(project.targets[0].blocks.a.fields.MODE, ['angle', null]);
    assert.equal(project.targets[0].blocks.b.opcode, 'ev3comprehensive_nxtLight');
    assert.equal(project.targets[0].blocks.c.opcode, 'ev3comprehensive_motorRun');
    assert.deepEqual(project.monitors[0].params, {UNIT: 'cm'});
});

test('every rename names a block the legacy ledger actually had', () => {
    // The table is hand-written, so a typo on the FROM side is a rename that
    // never fires — invisible, because the block just keeps its old opcode and
    // then fails to load.
    const unknown = [];
    for (const [legacyId, table] of Object.entries(m.RENAMES)) {
        const had = new Set((ledger.extensions[legacyId] || {blocks: []}).blocks.map(b => b.opcode));
        for (const from of Object.keys(table)) {
            if (!had.has(from)) unknown.push(`${legacyId}.${from}`);
        }
    }
    assert.deepEqual(unknown, [], 'these rename entries name blocks that never existed');
});

test('migration survives rubbish without throwing', () => {
    // It runs inside deserializeProject; throwing would cost the project.
    assert.equal(m.migrateProject(null), 0);
    assert.equal(m.migrateProject({}), 0);
    assert.equal(m.migrateProject({targets: [null, {}, {blocks: null}]}), 0);
    assert.equal(m.migrateBlock(null), false);
    assert.equal(m.migrateBlock({}), false);
});
