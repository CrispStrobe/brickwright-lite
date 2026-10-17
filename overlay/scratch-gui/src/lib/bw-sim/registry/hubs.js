// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The hub registry (docs/ROBOT-LAB-ARCHITECTURE.md §6.2): profile id → hub
// module, where a hub module is {profile: HubProfile, createVirtualHub(opts)}.
// Adding a hub family is its profile data plus one adapter module, registered
// in hubs/index.js — no edit to the bridge, the worker protocol, the compiler
// or the physics core, which only ever see VirtualHubs (hubs/hub-profile.js).
//
// A registry is an instance, not a module-level Map: the Sim Lab uses the
// built-in one (hubs/index.js), and a test builds its own with a fixture hub
// beside the built-ins without mutating anything shared.

import {validateHubProfile} from '../hubs/hub-profile.js';

export class HubRegistry {
    /** @param {{profile: object, createVirtualHub: Function}[]} [modules] */
    constructor (modules = []) {
        this.modules = new Map();
        for (const m of modules) this.register(m);
    }

    /** Adds a hub module; refuses an invalid profile or a second module for one id. */
    register (module) {
        if (!module || typeof module.createVirtualHub !== 'function') throw new TypeError('a hub module needs createVirtualHub(options)');
        const problems = validateHubProfile(module.profile);
        if (problems.length) throw new TypeError(`invalid hub profile: ${problems.join('; ')}`);
        if (this.modules.has(module.profile.id)) throw new Error(`hub profile '${module.profile.id}' is registered twice`);
        this.modules.set(module.profile.id, module);
        return this;
    }

    has (profileId) {
        return this.modules.has(profileId);
    }

    /** The module for a profile id; throws for an unknown one (a scene cannot run a hub nobody implements). */
    get (profileId) {
        const m = this.modules.get(profileId);
        if (!m) throw new Error(`no hub module for profile '${profileId}' (registered: ${[...this.modules.keys()].join(', ')})`);
        return m;
    }

    /** A new VirtualHub of that profile (options as the module takes them: id, and e.g. SPIKE's hubState). */
    create (profileId, options = {}) {
        return this.get(profileId).createVirtualHub(options);
    }

    profiles () {
        return [...this.modules.values()].map(m => m.profile);
    }

    /** A new registry with these modules added (the built-ins stay as they are). */
    with (...modules) {
        return new HubRegistry([...this.modules.values(), ...modules]);
    }
}
