// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Show authored part IDs at each side of a joint rather than only generated body IDs. */
export const jointTargetContext = (joint, mechanism, world = 'Ground') => {
    const bodyName = id => {
        if (id === 'world') return world;
        const body = mechanism.bodies.find(b => b.id === id);
        const hub = (mechanism.hubs || []).find(h => h.body === id && body?.parts?.includes(h.id));
        return hub?.id || body?.parts?.[0] || id;
    };
    return `${bodyName(joint.body1)} ↔ ${bodyName(joint.body2)}`;
};
