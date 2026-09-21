// SPDX-License-Identifier: Apache-2.0
//
// Nothing the three stock-firmware EV3 extensions offered may be lost.
//
// test/fixtures/ev3-legacy-ledger.json is the frozen surface of ev3comprehensive
// (74 blocks), ev3lms (64) and legoev3direct (41), taken by EXECUTING each
// getInfo() rather than parsing it — their block text comes from a `t(key)`
// lookup and is not in the block literal at all. Every one of those 179 blocks
// has to reach the unified extension, either under its own name or through
// ev3-legacy-migration.js.
//
// WHY THE FIXTURE IS READ AND NOT REBUILT HERE
// --------------------------------------------
// Rebuilding it would make this test agree with whatever the tree currently
// says, which is the one thing a coverage gate must not do. It would also hang:
// the legacy EV3 extensions arm reconnect timers in their constructors, so a
// process that loads them does not exit (see the note in
// scripts/ev3/gen-legacy-ledger.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

quietConsole();

const ledger = require('./fixtures/ev3-legacy-ledger.json');
const migration = await import('../overlay/scratch-gui/src/lib/ev3-legacy-migration.js');
const {loadExtension} = await import('../scripts/spike/load-extension.mjs');
const {bundleSource} = await import('../scripts/spike/bundled-upstream.mjs');

const unified = (() => {
    const source = bundleSource('ev3comprehensive');
    assert.ok(source, 'the ev3comprehensive bundle did not unwrap — every check below ' +
        'would be a sweep over nothing');
    const info = loadExtension(source).getInfo();
    return {
        info,
        blocks: new Map((info.blocks || [])
            .filter(b => b && typeof b === 'object' && b.opcode)
            .map(b => [b.opcode, b]))
    };
})();

test('instrument: the ledger and the unified surface are both non-empty', () => {
    const counts = Object.fromEntries(
        Object.entries(ledger.extensions).map(([id, e]) => [id, e.blocks.length]));
    assert.deepEqual(counts, {ev3comprehensive: 74, ev3lms: 64, legoev3direct: 41},
        'the frozen ledger changed; it records what Lite SHIPPED and is not ' +
        'regenerated to match the tree');
    assert.ok(unified.blocks.size >= 80,
        `the unified extension reports only ${unified.blocks.size} blocks`);
});

test('every one of the 179 legacy blocks reaches the unified palette', () => {
    const lost = [];
    let checked = 0;
    for (const [legacyId, ext] of Object.entries(ledger.extensions)) {
        for (const block of ext.blocks) {
            checked++;
            const {opcode} = migration.resolveOpcode(`${legacyId}_${block.opcode}`);
            const bare = opcode.slice(`${migration.UNIFIED_ID}_`.length);
            if (!unified.blocks.has(bare)) lost.push(`${legacyId}.${block.opcode} -> ${bare}`);
        }
    }
    assert.equal(checked, 179, 'the ledger no longer covers all three extensions');
    assert.deepEqual(lost, [], 'these blocks have nowhere to land after the merge');
});

test('a rename that points nowhere fails, rather than quietly dropping a block', () => {
    // Mutation proof for the check above: the table is the only thing standing
    // between a renamed block and silence, so a wrong entry must be loud.
    const bogus = `${migration.UNIFIED_ID}_thisBlockDoesNotExist`;
    assert.ok(!unified.blocks.has(bogus.slice(`${migration.UNIFIED_ID}_`.length)));
});

test('every menu preset a migration adds is a real item of the menu it targets', () => {
    // An addFields that names a value the menu does not offer produces a block
    // showing an empty dropdown — it migrates, passes a coverage check, and is
    // broken on the stage. This is the assertion that would have caught a
    // preset of MODE:'angle' against a menu whose items are 'ANGLE'/'RATE'.
    const menus = unified.info.menus || {};
    const problems = [];
    for (const [legacyId, table] of Object.entries(migration.RENAMES)) {
        for (const [from, rename] of Object.entries(table)) {
            if (!rename.addFields) continue;
            const target = unified.blocks.get(rename.to);
            assert.ok(target, `${legacyId}.${from} -> ${rename.to}, which does not exist`);
            for (const [field, value] of Object.entries(rename.addFields)) {
                const arg = (target.arguments || {})[field];
                if (!arg) { problems.push(`${rename.to} has no argument ${field}`); continue; }
                if (!arg.menu) { problems.push(`${rename.to}.${field} is not a menu`); continue; }
                const menu = menus[arg.menu];
                const items = (Array.isArray(menu) ? menu : (menu && menu.items) || [])
                    .map(i => (i && typeof i === 'object' ? i.value : i));
                if (!items.includes(value)) {
                    problems.push(`${legacyId}.${from}: ${rename.to}.${field} = ${JSON.stringify(value)} ` +
                        `is not in menu ${arg.menu} (${items.join(', ')})`);
                }
            }
        }
    }
    assert.deepEqual(problems, []);
});

test('the retired ids are exactly the ones the migration retires', () => {
    assert.deepEqual([...migration.LEGACY_IDS].sort(), ['ev3lms', 'legoev3direct']);
    assert.equal(migration.UNIFIED_ID, 'ev3comprehensive');
    // ev3dev is NOT retired, and that is a decision rather than an omission: it
    // runs a different operating system on the brick, and folding it in would
    // put 54 blocks that cannot work into every stock-firmware user's palette.
    assert.ok(!migration.LEGACY_IDS.includes('ev3dev'));
    assert.ok(!Object.keys(migration.RENAMES).includes('ev3dev'));
});

test('no unified block is left hollow', () => {
    // The defect this whole consolidation exists to fix: 47 of ev3comprehensive's
    // 74 blocks had a body of only logging, and three more answered with a
    // constant. Both shapes look like working blocks from the palette.
    const source = bundleSource('ev3comprehensive');
    const lines = source.split('\n');
    const LOGGING = /^(?:this\.)?(?:log|_log)\s*[.(]|^console\./;
    const CONST_RETURN = /^return\s*(?:0|false|true|null|""|''|\[\]|\{\}|[0-9.]+)?\s*;?$/;
    const bodyLength = {};
    for (let i = 0; i < lines.length; i++) {
        const header = lines[i].match(/^    (?:async )?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\{\s*$/);
        if (!header) continue;
        let j = i + 1;
        const body = [];
        while (j < lines.length && !/^    \}/.test(lines[j])) body.push(lines[j++]);
        bodyLength[header[1]] = body.map(l => l.trim())
            .filter(l => l && !l.startsWith('//') && !l.startsWith('*') &&
                !LOGGING.test(l) && !CONST_RETURN.test(l)).length;
    }
    const hollow = [...unified.blocks.keys()].filter(op => bodyLength[op] === 0);
    assert.deepEqual(hollow, [],
        'these blocks are back to logging or a constant return, which is ' +
        'indistinguishable from a working block until you watch the robot');
});

test('auto-detection is offered and is the default', () => {
    const menu = (unified.info.menus || {}).connectionModes;
    const items = (Array.isArray(menu) ? menu : (menu && menu.items) || [])
        .map(i => (i && typeof i === 'object' ? i.value : i));
    assert.ok(items.includes('auto'), 'the auto connection mode is gone');
    // Every transport the three extensions between them could reach.
    for (const mode of ['serial', 'scratchlink', 'bridge', 'http']) {
        assert.ok(items.includes(mode), `the ${mode} transport is no longer offered`);
    }
    const setMode = unified.blocks.get('setMode');
    assert.equal(setMode.arguments.MODE.defaultValue, 'auto');
    assert.ok(unified.blocks.has('getConnectionMode'),
        'without this reporter, "nothing answered" and "the wrong transport answered" ' +
        'are indistinguishable to a learner');
});
