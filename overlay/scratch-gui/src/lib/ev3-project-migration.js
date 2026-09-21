// SPDX-License-Identifier: MPL-2.0
//
// Bring projects saved against the retired EV3 extension ids forward to the
// one that replaced them, at the moment they are loaded.
//
// Same hook and the same reasoning as spike-project-migration.js:
// `vm.deserializeProject` is the single door every loader arrives at with a
// parsed project object, whatever shape it started as, so the rewrite happens
// once and no call site has to know. Nothing is written back to disk; saving
// afterwards makes it permanent, which is the right moment — when the user
// chose to save, not when they happened to open.
import {migrateProject} from './ev3-legacy-migration.js';

const INSTALLED = Symbol.for('brickwright.ev3MigrationInstalled');

/**
 * Install the migration on a VM instance. Idempotent.
 * @param {object} vm a scratch-vm instance
 * @returns {boolean} whether this call was the one that installed it
 */
const installEv3ProjectMigration = function (vm) {
    if (!vm || typeof vm.deserializeProject !== 'function') return false;
    if (vm[INSTALLED]) return false;

    const original = vm.deserializeProject.bind(vm);
    vm.deserializeProject = function (projectJSON, zip) {
        try {
            const moved = migrateProject(projectJSON);
            if (moved > 0) {
                // A project that silently changes shape on load is hard to
                // tell from one that was always that way; this is the line
                // someone will search for.
                // eslint-disable-next-line no-console
                console.info(
                    `[ev3] migrated ${moved} block${moved === 1 ? '' : 's'} from the retired ` +
                    'EV3 extension ids to ev3comprehensive');
            }
        } catch (error) {
            // A project must still open. Failing to migrate costs the blocks
            // that needed migrating; throwing would cost the project.
            // eslint-disable-next-line no-console
            console.error('[ev3] could not migrate legacy EV3 blocks:', error);
        }
        return original(projectJSON, zip);
    };

    Object.defineProperty(vm, INSTALLED, {value: true, enumerable: false});
    return true;
};

export default installEv3ProjectMigration;
