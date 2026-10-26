// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const tensor = value => Array.isArray(value) && value.length === 3 && value.every(vector);

/** Read one authored rigid assembly. No simulator sampling or mutation occurs. */
export const inspectAssembly = (session, bodyId) => {
    const body = session?.mechanism?.bodies.find(b => b.id === bodyId);
    if (!body || !session.core?.bodyDynamics) return null;
    const observation = session.core.bodyDynamics(bodyId);
    if (!observation || !Number.isFinite(observation.configuredMassKg) || observation.configuredMassKg < 0 ||
        observation.configuredMassKg !== body.massKg || !vector(observation.centerOfMassWorld) ||
        !['static', 'dynamic'].includes(observation.motion)) return null;
    if (observation.motion === 'dynamic' && (!(observation.solverMassKg > 0) || !Number.isFinite(observation.solverMassKg) ||
        !tensor(observation.inertiaKgM2))) return null;
    return {...observation, bodyId, parts: (body.parts || []).slice(),
        centerOfMassWorld: observation.centerOfMassWorld.slice(),
        inertiaKgM2: observation.motion === 'dynamic' ? observation.inertiaKgM2.map(row => row.slice()) : null,
        solverMassKg: observation.motion === 'dynamic' ? observation.solverMassKg : null};
};
