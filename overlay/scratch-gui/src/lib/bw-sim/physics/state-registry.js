// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The per-step state registry (docs/ROBOT-LAB-ARCHITECTURE.md §6.4).
//
// Jolt's SaveState records the bodies, contacts and every constraint's own state
// (motor state and targets, accumulated impulses). Everything ELSE a step carries
// to the next lives in JavaScript, and a checkpoint that misses one piece of it
// makes the worker's redo differ from the in-thread run (sim-worker-protocol.js).
// So every module that keeps such state registers it here, once, at creation:
//
//   registry.register(key, {save: () => data, restore: data => void})
//
// `save()` returns structured-clone-safe data that must not alias live state (the
// module keeps stepping after the checkpoint); `restore(data)` puts it back, and
// re-applies to Jolt whatever Jolt does not record itself (a slider motor's force
// limit lives in its MotorSettings, which SaveState skips). The core's checkpoint()
// is Jolt's SaveState + registry.save(), rollback() the reverse.

/**
 * @typedef {{save: () => unknown, restore: (state: unknown) => void}} StateRegistrant
 */

export const createStateRegistry = () => {
    /** @type {{key: string, save: Function, restore: Function}[]} in registration order */
    const entries = [];
    return {
        /**
         * @param {string} key unique name of the state ('clock', 'hinges', 'sliders', …)
         * @param {StateRegistrant} registrant
         */
        register (key, {save, restore}) {
            if (typeof key !== 'string' || !key) throw new Error('state registrant needs a key');
            if (typeof save !== 'function' || typeof restore !== 'function') throw new Error(`state registrant '${key}' needs save() and restore()`);
            if (entries.some(e => e.key === key)) throw new Error(`state registrant '${key}' is registered twice`);
            entries.push({key, save, restore});
        },
        /** @returns {string[]} the registered keys, in order */
        keys: () => entries.map(e => e.key),
        /** @returns {[string, unknown][]} every registrant's state, in registration order */
        save: () => entries.map(e => [e.key, e.save()]),
        /** @param {[string, unknown][]} saved what save() returned */
        restore (saved) {
            if (!Array.isArray(saved) || saved.length !== entries.length) throw new Error('state registry: the checkpoint has other registrants than the core');
            saved.forEach(([key, state], i) => {
                if (entries[i].key !== key) throw new Error(`state registry: checkpoint has '${key}' where the core has '${entries[i].key}'`);
                entries[i].restore(state);
            });
        }
    };
};
