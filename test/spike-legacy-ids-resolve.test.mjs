// SPDX-License-Identifier: Apache-2.0
//
// The four retired SPIKE ids must still lead somewhere.
//
// The project loader rewrites them, but not every path into the VM goes
// through it — shareBlocksToTarget and direct loadExtensionURL calls do not —
// so the extension manager resolves them too. Without that, those paths reach
// the bare-id branch and log a missing implementation for an extension that is
// present under another name, and the blocks are dropped.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {quietConsole} from './helpers/quiet-console.mjs';
import {resolve, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);
const migration = await import('../overlay/scratch-gui/src/lib/spike-legacy-migration.js');

// The installer reports a migration it performed, and one of the tests below
// performs one. Those bytes would go straight to the runner's stdout pipe,
// where they are not diagnostics but corruption: the TAP stream stops
// deserialising and this file reports ZERO tests while still exiting clean.
// That is how it failed on CI — not as a red test, but as a silent absence
// the suite's own "every file reported tests" check had to catch.
quietConsole();

const managerSource = readFileSync(
    resolve(root, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');

test('the manager\'s inlined id list matches the canonical table', () => {
    // scratch-vm cannot import the table: this overlay is applied INTO
    // scratch-gui's node_modules, so no path from there reaches
    // scratch-gui/src/lib. Four strings are duplicated instead, and this is
    // what stops the copy from drifting away from the original.
    const inlined = managerSource.match(/const SPIKE_LEGACY_IDS = \[([^\]]*)\]/);
    assert.ok(inlined, 'extension-manager.js no longer inlines the legacy ids');
    const ids = [...inlined[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(ids.sort(), [...migration.LEGACY_IDS].sort());

    const unified = managerSource.match(/const SPIKE_UNIFIED_ID = '([^']+)'/);
    assert.ok(unified);
    assert.equal(unified[1], migration.UNIFIED_ID);
});

test('no GUI module reaches the VM overlay by a path the build cannot follow', () => {
    // The overlay lands in packages/scratch-gui/node_modules/scratch-vm, so a
    // `../../../scratch-vm/...` specifier resolves in this repo and not in the
    // built app — it compiled here and failed the editor build on CI. Nothing
    // in the GUI overlay may reach for it that way again.
    const offenders = [];
    const walk = dir => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(js|jsx|mjs)$/.test(entry.name)) continue;
            const text = readFileSync(full, 'utf8');
            if (/from '[^']*\.\.\/scratch-vm\//.test(text) ||
                /require\('[^']*\.\.\/scratch-vm\//.test(text)) {
                offenders.push(full.slice(root.length + 1));
            }
        }
    };
    walk(resolve(root, 'overlay/scratch-gui/src'));
    assert.deepEqual(offenders, []);
});

/**
 * One method's body, by brace matching.
 *
 * Not a fixed character window: a window is a gate that stops biting the
 * moment the method grows past it, silently, which is exactly what
 * test/gate-shapes.test.mjs refuses (WINDOWED-SEARCH).
 */
const methodBody = (source, name) => {
    const start = source.indexOf(`    ${name} (`);
    assert.ok(start > 0, `${name} not found`);
    const open = source.indexOf('{', start);
    assert.ok(open > start, `${name} has no body`);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    throw new Error(`${name} body is unterminated`);
};

test('the manager resolves a legacy id before it looks anything up', () => {
    // Order matters: the rewrite has to happen before the hasOwn checks, or
    // the legacy id misses both maps and falls through.
    for (const method of ['loadExtensionURL', 'loadExtensionIdSync']) {
        const body = methodBody(managerSource, method);
        const rewrite = body.indexOf('resolveExtensionId(');
        const firstLookup = body.indexOf('hasOwn(');
        assert.ok(rewrite > 0, `${method} does not resolve legacy ids`);
        assert.ok(firstLookup > 0, `${method} no longer looks an id up — re-read this test`);
        assert.ok(rewrite < firstLookup,
            `${method} looks the id up before resolving it`);
    }
});

test('the four retired ids no longer name a loadable module', () => {
    for (const legacyId of migration.LEGACY_IDS) {
        assert.ok(
            !managerSource.includes(`extensions/crispstrobe/${legacyId}/index.js`),
            `${legacyId} is still imported; it should resolve to spikeprime instead`);
    }
    assert.ok(managerSource.includes('extensions/crispstrobe/spikeprime/index.js'),
        'the unified extension must still be imported');
});

test('the retired bundles are gone from the tree', () => {
    for (const legacyId of migration.LEGACY_IDS) {
        const path = resolve(root, `overlay/scratch-vm/src/extensions/crispstrobe/${legacyId}`);
        assert.throws(() => readFileSync(resolve(path, 'index.js')),
            `${legacyId} still has a bundle; two extensions would answer to one hub`);
    }
});

test('the picker offers one SPIKE entry, not five', () => {
    const library = readFileSync(
        resolve(root, 'overlay/scratch-gui/src/lib/libraries/extensions/index.jsx'), 'utf8');
    const entries = [...library.matchAll(/extensionId: '([^']+)'/g)].map(m => m[1]);
    const spike = entries.filter(id =>
        id === migration.UNIFIED_ID || migration.LEGACY_IDS.includes(id));
    assert.deepEqual(spike, [migration.UNIFIED_ID],
        'the library should list the unified extension and none of the retired ids');
});

test('the load-time migration is installed on the VM, not at each call site', () => {
    // There are five callers of vm.loadProject in this app. The migration
    // hooks vm.deserializeProject instead, which is the one place they all
    // arrive and where the project is already a parsed object.
    const hoc = readFileSync(
        resolve(root, 'overlay/scratch-gui/src/lib/vm-manager-hoc.jsx'), 'utf8');
    assert.match(hoc, /installSpikeProjectMigration\(this\.props\.vm\)/);

    const installer = readFileSync(
        resolve(root, 'overlay/scratch-gui/src/lib/spike-project-migration.js'), 'utf8');
    assert.match(installer, /vm\.deserializeProject = function/,
        'the hook must be on deserializeProject, the single seam');
    assert.match(installer, /if \(vm\[INSTALLED\]\) return false;/,
        'it must be idempotent: several components initialise against one VM');
});

test('the installer is idempotent and survives a failing migration', async () => {
    // Exercised directly rather than through the JSX import, which would need
    // a React/webpack environment. The module is plain ESM apart from that.
    const {installSpikeProjectMigration} = await import(
        resolve(root, 'overlay/scratch-gui/src/lib/spike-project-migration.js'));

    const calls = [];
    const vm = {deserializeProject (json, zip) { calls.push([json, zip]); return Promise.resolve('ok'); }};

    assert.equal(installSpikeProjectMigration(vm), true);
    assert.equal(installSpikeProjectMigration(vm), false, 'a second install must not double-wrap');
    assert.equal(installSpikeProjectMigration(null), false);
    assert.equal(installSpikeProjectMigration({}), false);

    const project = {
        targets: [{blocks: {a: {opcode: 'spikeprimeble_getFaceUp', inputs: {}, fields: {}}}}],
        extensions: ['spikeprimeble']
    };
    await vm.deserializeProject(project, null);
    assert.equal(project.targets[0].blocks.a.opcode, 'spikeprime_getFaceUp');
    assert.deepEqual(project.extensions, ['spikeprime']);
    assert.equal(calls.length, 1, 'the original is still called');

    // A project that cannot be migrated must still be handed on: losing the
    // blocks that needed migrating is bad, losing the project is worse.
    // The installer reports the failure, so the report is silenced here
    // rather than left to print into the CI log as if something had gone
    // wrong with the run.
    const hostile = {get targets () { throw new Error('deliberate: unreadable project'); }};
    assert.equal(await vm.deserializeProject(hostile, null), 'ok');
});
