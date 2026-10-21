// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {Box3} from 'three';

/** World bounds of the physical model, including moving motor hubs and excluding the floor. */
export const modelMeshBounds = ({scene, partMeshes, hubMeshes}) => {
    // Parts are local to their physics body groups. Box3 updates a mesh itself, but not its
    // ancestors: before the first render those groups' matrixWorld values are still identity.
    // Synchronise them also after a new physics pose, so Home/Fit and camera following agree.
    scene.updateMatrixWorld(true);
    const box = new Box3();
    for (const mesh of [...partMeshes.values(), ...hubMeshes.values()]) box.expandByObject(mesh);
    return box;
};

/** Follow the main frame's translation, never a bounding box changed by moving arms. */
export const cameraFollowBody = mechanism => mechanism.bodies.reduce((main, body) =>
    (body.parts?.length || 0) > (main?.parts?.length || 0) ? body : main, null)?.id || null;
