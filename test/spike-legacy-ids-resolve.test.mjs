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
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);
const migration = require('../overlay/scratch-vm/src/extension-support/spike-legacy-migration.js');

const managerSource = readFileSync(
    resolve(root, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');

test('the manager resolves a legacy id before it looks anything up', () => {
    // Order matters: the rewrite has to happen before the hasOwn checks, or
    // the legacy id misses both maps and falls through.
    for (const method of ['loadExtensionURL', 'loadExtensionIdSync']) {
        const start = managerSource.indexOf(`    ${method} (`);
        assert.ok(start > 0, `${method} not found`);
        const body = managerSource.slice(start, start + 400);
        const rewrite = body.indexOf('resolveExtensionId(');
        const firstLookup = body.indexOf('hasOwn(');
        assert.ok(rewrite > 0, `${method} does not resolve legacy ids`);
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
    const hostile = {get targets () { throw new Error('boom'); }};
    assert.equal(await vm.deserializeProject(hostile, null), 'ok');
});
