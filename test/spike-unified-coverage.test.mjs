// SPDX-License-Identifier: Apache-2.0
//
// The consolidation's promise, as a test: the unified `spikeprime` extension
// still offers everything the five legacy SPIKE extensions offered.
//
// test/fixtures/spike-legacy-ledger.json is the frozen surface of those five —
// 236 blocks, their arguments, their menus, and their opcode methods, captured
// from the pinned sources before the merge. Every one of them is resolved
// through the migration table and checked against the unified extension's real
// getInfo(): the target opcode must exist, every legacy argument must survive
// (unchanged, renamed, or explicitly supplied), and every value a legacy menu
// could produce must still be a value the unified menu accepts.
//
// This is the test that must not be edited to go green. If it fails, either
// the unified extension dropped something or the migration table is wrong.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';
import {loadExtension, methodNames} from '../scripts/spike/load-extension.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

const ledger = require('./fixtures/spike-legacy-ledger.json');
const migration = await import('../overlay/scratch-gui/src/lib/spike-legacy-migration.js');

// The extensions log on load; none of it may reach fd 1.
quietConsole();
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator',
    {value: {language: 'en-US', userAgent: 'node'}, configurable: true, writable: true});
globalThis.document = {
    documentElement: {lang: 'en'},
    createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
    body: {appendChild () {}, removeChild () {}}
};
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = () => {};
globalThis.alert = () => {};
globalThis.setInterval = () => 0;

const bundlePath = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/index.js');
const wrapper = await readFile(bundlePath, 'utf8');
const source = JSON.parse(wrapper.slice(wrapper.indexOf('makeExt(') + 8, wrapper.lastIndexOf('"') + 1));
const unified = loadExtension(source);
const info = unified.getInfo();

/** Unified blocks by opcode. */
const blocks = new Map();
for (const b of info.blocks || []) {
    if (b && typeof b === 'object' && b.opcode && b.blockType !== 'label') blocks.set(b.opcode, b);
}

/** The values a unified menu accepts, or null when it is dynamic. */
const menuValues = function (name) {
    const menu = (info.menus || {})[name];
    if (!menu) return null;
    const items = Array.isArray(menu) ? menu : menu.items;
    if (typeof items === 'string') return null; // dynamic; judged at runtime
    return new Set((items || []).map(i => String(i && typeof i === 'object' ? i.value : i)));
};

/** The values a legacy menu could produce, from the frozen ledger. */
const legacyMenuValues = function (legacyId, name) {
    const menu = ledger.extensions[legacyId].menus[name];
    if (!menu) return null;
    if (!Array.isArray(menu.items)) return null;
    return menu.items.map(i => String(i && typeof i === 'object' ? i.value : i));
};

const unifiedMethods = new Set(methodNames(unified));

const everyLegacyBlock = [];
for (const [legacyId, ext] of Object.entries(ledger.extensions)) {
    for (const block of ext.blocks) everyLegacyBlock.push({legacyId, block});
}

test('the ledger still describes all five legacy extensions', () => {
    assert.deepEqual(
        Object.keys(ledger.extensions).sort(),
        ['legospikeprimeBLE', 'spikeprime', 'spikeprimeBTC', 'spikeprimeBridge', 'spikeprimeble'],
        'the frozen ledger is the record of what must not be lost; it may not shrink');
    assert.equal(everyLegacyBlock.length, 236,
        'the legacy surface was 236 blocks when it was frozen');
});

test('the unified extension keeps the id the whole family collapses into', () => {
    assert.equal(info.id, migration.UNIFIED_ID);
});

test('every legacy block resolves to a unified block that exists', () => {
    const missing = [];
    for (const {legacyId, block} of everyLegacyBlock) {
        const resolved = migration.resolveOpcode(`${legacyId}_${block.opcode}`);
        assert.ok(resolved, `${legacyId}_${block.opcode} is not recognised by the migration table`);
        const target = resolved.opcode.slice(`${migration.UNIFIED_ID}_`.length);
        if (!blocks.has(target)) missing.push(`${legacyId}_${block.opcode} -> ${target}`);
    }
    assert.deepEqual(missing, [], 'these legacy blocks migrate to opcodes the unified extension does not have');
});

test('every unified block has a method behind it', () => {
    const unbacked = [];
    for (const [opcode, block] of blocks) {
        const fn = block.func || opcode;
        if (!unifiedMethods.has(fn)) unbacked.push(opcode);
    }
    assert.deepEqual(unbacked, [], 'these blocks are in the palette with nothing to run');
});

test('every legacy argument survives the migration', () => {
    const lost = [];
    for (const {legacyId, block} of everyLegacyBlock) {
        const resolved = migration.resolveOpcode(`${legacyId}_${block.opcode}`);
        const target = blocks.get(resolved.opcode.slice(`${migration.UNIFIED_ID}_`.length));
        if (!target) continue; // already reported by the test above
        for (const argName of Object.keys(block.arguments || {})) {
            const renamed = (resolved.renameArgs || {})[argName] || argName;
            if (!Object.prototype.hasOwnProperty.call(target.arguments || {}, renamed)) {
                lost.push(`${legacyId}_${block.opcode}.${argName} -> ${target.opcode}.${renamed}`);
            }
        }
    }
    assert.deepEqual(lost, [], 'these legacy arguments have nowhere to go on the unified block');
});

test('every value a legacy menu could produce is still accepted', () => {
    const rejected = [];
    for (const {legacyId, block} of everyLegacyBlock) {
        const resolved = migration.resolveOpcode(`${legacyId}_${block.opcode}`);
        const target = blocks.get(resolved.opcode.slice(`${migration.UNIFIED_ID}_`.length));
        if (!target) continue;
        for (const [argName, arg] of Object.entries(block.arguments || {})) {
            if (!arg.menu) continue;
            const legacyValues = legacyMenuValues(legacyId, arg.menu);
            if (!legacyValues) continue;
            const renamed = (resolved.renameArgs || {})[argName] || argName;
            const targetArg = (target.arguments || {})[renamed];
            if (!targetArg || !targetArg.menu) continue;
            const accepted = menuValues(targetArg.menu);
            if (!accepted) continue; // dynamic menu
            const table = (resolved.mapField || {})[argName] || {};
            for (const value of legacyValues) {
                const mapped = Object.prototype.hasOwnProperty.call(table, value) ? table[value] : value;
                if (!accepted.has(String(mapped))) {
                    rejected.push(
                        `${legacyId}_${block.opcode}.${argName}="${value}"` +
                        ` -> ${target.opcode}.${renamed} (menu ${targetArg.menu}) has no "${mapped}"`);
                }
            }
        }
    }
    assert.deepEqual(rejected, [], 'these legacy menu choices would become invalid');
});

test('every value the migration injects is a value the target menu accepts', () => {
    const bad = [];
    for (const [legacyId, renames] of Object.entries(migration.RENAMES)) {
        for (const [opcode, rule] of Object.entries(renames)) {
            if (!rule.addFields) continue;
            const target = blocks.get(rule.to || opcode);
            if (!target) continue;
            for (const [argName, value] of Object.entries(rule.addFields)) {
                const arg = (target.arguments || {})[argName];
                if (!arg) {
                    bad.push(`${legacyId}_${opcode}: injects ${argName}, which ${target.opcode} has no slot for`);
                    continue;
                }
                if (!arg.menu) continue;
                const accepted = menuValues(arg.menu);
                if (accepted && !accepted.has(String(value))) {
                    bad.push(`${legacyId}_${opcode}: injects ${argName}="${value}", not in menu ${arg.menu}`);
                }
            }
        }
    }
    assert.deepEqual(bad, [], 'the migration would write values the unified blocks reject');
});

test('the migration table names only real legacy opcodes', () => {
    const stray = [];
    for (const [legacyId, renames] of Object.entries(migration.RENAMES)) {
        const known = new Set((ledger.extensions[legacyId] || {blocks: []}).blocks.map(b => b.opcode));
        for (const opcode of Object.keys(renames)) {
            if (!known.has(opcode)) stray.push(`${legacyId}_${opcode}`);
        }
    }
    assert.deepEqual(stray, [], 'the table renames opcodes that never existed');
});

test('no legacy menu loses any of its choices', () => {
    // Menus are looked up by name on the unified extension. Where a legacy menu
    // name survives, it must still offer at least what it used to — allowing
    // for the value rewrites the migration table declares.
    //
    // Two extensions spelled a menu named DIRECTION differently: the REPL ones
    // as the signed multipliers 1/-1, `legospikeprimeBLE` as the words
    // forward/backward. That is exactly what a declared mapField is for, so a
    // legacy value counts as kept if its mapped form is accepted.
    const remapsFor = (legacyId, menuName) => {
        const tables = [];
        for (const block of ledger.extensions[legacyId].blocks) {
            const rule = (migration.RENAMES[legacyId] || {})[block.opcode];
            if (!rule || !rule.mapField) continue;
            for (const [argName, arg] of Object.entries(block.arguments || {})) {
                if (arg.menu === menuName && rule.mapField[argName]) tables.push(rule.mapField[argName]);
            }
        }
        return tables;
    };

    const shrunk = [];
    for (const [legacyId, ext] of Object.entries(ledger.extensions)) {
        for (const [name, menu] of Object.entries(ext.menus)) {
            const accepted = menuValues(name);
            if (!accepted) continue; // renamed or dynamic; the per-block check covers it
            const tables = remapsFor(legacyId, name);
            for (const item of Array.isArray(menu.items) ? menu.items : []) {
                const value = String(item && typeof item === 'object' ? item.value : item);
                const forms = [value, ...tables.map(t => t[value]).filter(v => v !== undefined)];
                if (!forms.some(v => accepted.has(String(v)))) {
                    shrunk.push(`${legacyId}.${name}: lost "${value}"`);
                }
            }
        }
    }
    assert.deepEqual(shrunk, [], 'these menu choices disappeared');
});
