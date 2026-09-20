// SPDX-License-Identifier: MPL-2.0
//
// Bring projects saved against the five old SPIKE extension ids forward to the
// one that replaced them, at the moment they are loaded.
//
// WHERE THIS HOOKS, AND WHY THERE
// -------------------------------
// `vm.loadProject` accepts a JSON string, a parsed object, an ArrayBuffer or a
// Blob, and there are five call sites for it in this app (the project fetcher,
// the file uploader, the Tauri bridge, the pseudocode importer, the bundle
// loader). Wrapping it would mean handling every input shape at every door.
//
// `vm.deserializeProject(projectJSON, zip)` is the one place they all arrive,
// and by then the project is a parsed object whatever it started as — a .sb3's
// ZIP has already been opened and its project.json read. So the rewrite
// happens once, on a plain object, and no call site needs to know.
//
// WHAT IT DOES NOT DO
// -------------------
// It does not write anything back to disk. The user's file on their machine is
// untouched; only the in-memory project is migrated. Saving afterwards writes
// the unified ids, which is the right moment for that to become permanent —
// when the user chose to save, not when they happened to open.
import {migrateProject} from './spike-legacy-migration.js';

const INSTALLED = Symbol.for('brickwright.spikeMigrationInstalled');

/**
 * Install the migration on a VM instance. Idempotent: the GUI builds one VM
 * and several components initialise against it, so this may be called more
 * than once and must patch only the first time.
 * @param {object} vm a scratch-vm instance
 * @returns {boolean} whether this call was the one that installed it
 */
const installSpikeProjectMigration = function (vm) {
    if (!vm || typeof vm.deserializeProject !== 'function') return false;
    if (vm[INSTALLED]) return false;

    const original = vm.deserializeProject.bind(vm);
    vm.deserializeProject = function (projectJSON, zip) {
        try {
            const moved = migrateProject(projectJSON);
            if (moved > 0) {
                // Worth saying out loud: a project that silently changes shape
                // on load is hard to tell from one that was always that way,
                // and this is the line someone will search for when a SPIKE
                // project behaves unexpectedly after the merge.
                // eslint-disable-next-line no-console
                console.info(
                    `[spike] migrated ${moved} block${moved === 1 ? '' : 's'} from the legacy ` +
                    'SPIKE extension ids to the unified spikeprime extension');
            }
        } catch (error) {
            // A project must still open. Failing to migrate costs the blocks
            // that needed migrating; throwing here would cost the project.
            // eslint-disable-next-line no-console
            console.error('[spike] could not migrate legacy SPIKE blocks:', error);
        }
        return original(projectJSON, zip);
    };

    vm[INSTALLED] = true;
    return true;
};

export default installSpikeProjectMigration;
export {installSpikeProjectMigration};
