// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

import {Scene, Group, Mesh, MeshStandardMaterial, BoxGeometry, PlaneGeometry, DoubleSide} from 'three';
import {partGeometry} from './part-geometry.js';
import {lduToWorld} from '../contracts.js';
import {quatFromMat3} from '../mech/vec.js';

// worldMat for flipped geometry: Flip*R*Flip
const worldMatFlipped = R => [
    R[0], -R[1], -R[2],
    -R[3], R[4], R[5],
    -R[6], R[7], R[8]
];

const hexToRgb = hex => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
};

/**
 * Build a headless three.js scene for the Sim Lab.
 * @param {{model: any, mechanism: any, read: (p:string)=>string|undefined, colors: Map<number,{value:string,edge:string,alpha:number}>}} opts
 * @returns {{scene: Scene, bodyGroups: Map<string,Group>, partMeshes: Map<string,Mesh>, ground: Mesh|null, dispose: ()=>void}}
 */
export const buildSimScene = ({model, mechanism, read, colors}) => {
    const scene = new Scene();
    const bodyGroups = new Map();
    const partMeshes = new Map();
    const createdGeometries = new Set();
    const createdMaterials = new Set();
    let ground = null;

    // Body groups at t=0 pose
    for (const b of mechanism.bodies) {
        const g = new Group();
        g.position.set(b.position[0], b.position[1], b.position[2]);
        g.quaternion.set(b.rotation[0], b.rotation[1], b.rotation[2], b.rotation[3]);
        g.name = b.id;
        scene.add(g);
        bodyGroups.set(b.id, g);
    }

    // Helper: find body id for a part id (handles motor #out)
    const findBodyForPart = partId => {
        for (const b of mechanism.bodies) {
            if (b.parts.includes(partId)) return b.id;
            // For motor, the housing body contains the motor id, output body contains id+#out
            // The output body's parts will have id+#out, but we want housing for mesh
            // So if partId is motor id, we should find housing body, not output
            // Check if b.parts includes partId+#out, then this b is output, not housing
            // We want housing, so we skip output bodies for mesh creation
            // Instead, we will explicitly handle motor below
        }
        return null;
    };

    // For motor handling: collect motor part ids (those that have two bodies: housing and #out)
    const motorIds = new Set();
    for (const b of mechanism.bodies) {
        for (const pid of b.parts) {
            if (pid.includes('#out')) {
                const base = pid.split('#')[0];
                motorIds.add(base);
            }
        }
    }

    for (const pl of model.parts) {
        // Motor: one mesh in housing body (note: drive hub does not visibly spin yet)
        const isMotor = motorIds.has(pl.id);
        // Find housing body: the body that contains pl.id (not #out)
        let bodyId = null;
        for (const b of mechanism.bodies) {
            if (b.parts.includes(pl.id)) {
                bodyId = b.id;
                break;
            }
        }
        if (!bodyId) continue;
        const body = mechanism.bodies.find(b => b.id === bodyId);
        const group = bodyGroups.get(bodyId);
        if (!group) continue;

        const geo = partGeometry(pl.part, read, colors);
        if (geo) createdGeometries.add(geo);
        // Material with placed colour
        const colInfo = colors.get(pl.color ?? 16) || colors.get(16);
        const matColor = colInfo ? colInfo.value : '#ffffff';
        const matAlpha = colInfo ? colInfo.alpha : 1;
        const material = new MeshStandardMaterial({
            color: matColor,
            roughness: 0.6,
            metalness: 0.1,
            transparent: matAlpha < 1,
            opacity: matAlpha,
            vertexColors: true
        });
        createdMaterials.add(material);

        const mesh = new Mesh(geo, material);
        mesh.name = pl.id;
        // Position/rotation: fixed offset from body
        const partWorldPos = lduToWorld(pl.position);
        // World quaternion for flipped geometry: Flip*R*Flip
        const worldMat = worldMatFlipped(pl.rotation);
        const partWorldQuat = quatFromMat3(worldMat);
        // Offset from body (body position is COM, rotation identity)
        const bodyPos = body.position;
        // mesh position = partWorldPos - bodyPos (body rotation identity)
        mesh.position.set(partWorldPos[0] - bodyPos[0], partWorldPos[1] - bodyPos[1], partWorldPos[2] - bodyPos[2]);
        mesh.quaternion.set(partWorldQuat[0], partWorldQuat[1], partWorldQuat[2], partWorldQuat[3]);
        mesh.layers.set(0);
        group.add(mesh);
        partMeshes.set(pl.id, mesh);
    }

    // Ground plane at ground body's top
    const groundBody = mechanism.bodies.find(b => b.motion === 'static' && b.id === 'ground');
    if (groundBody) {
        const geo = new BoxGeometry(2, 0.02, 2);
        const mat = new MeshStandardMaterial({color: '#c0c0c0', roughness: 0.9});
        createdGeometries.add(geo);
        createdMaterials.add(mat);
        const mesh = new Mesh(geo, mat);
        mesh.position.set(groundBody.position[0], groundBody.position[1], groundBody.position[2]);
        mesh.quaternion.set(groundBody.rotation[0], groundBody.rotation[1], groundBody.rotation[2], groundBody.rotation[3]);
        mesh.name = 'ground';
        mesh.layers.set(0);
        scene.add(mesh);
        ground = mesh;
    }

    const dispose = () => {
        // Dispose ground geometry/material and per-mesh materials; part geometries are cached
        if (ground) {
            ground.geometry.dispose();
            if (Array.isArray(ground.material)) ground.material.forEach(m => m.dispose());
            else ground.material.dispose();
        }
        for (const m of createdMaterials) {
            // Materials for part meshes are per-mesh, dispose them
            if (m && typeof m.dispose === 'function') m.dispose();
        }
        scene.clear();
    };

    return {scene, bodyGroups, partMeshes, ground, dispose};
};

/**
 * Apply a physics snapshot to the scene.
 * @param {{scene: any, bodyGroups: Map<string,Group>|Record<string,Group>, partMeshes: Map<string,Mesh>|Record<string,Mesh>, ground: any}} built
 * @param {{bodyIds: string[], bodies: Float32Array}} snapshot
 */
export const applySnapshot = (built, snapshot) => {
    const {bodyGroups} = built;
    const {bodyIds, bodies} = snapshot;
    const getGroup = id => {
        if (bodyGroups instanceof Map) return bodyGroups.get(id);
        return bodyGroups[id];
    };
    for (let i = 0; i < bodyIds.length; i++) {
        const id = bodyIds[i];
        const group = getGroup(id);
        if (!group) continue;
        const off = i * 7;
        group.position.set(bodies[off], bodies[off + 1], bodies[off + 2]);
        group.quaternion.set(bodies[off + 3], bodies[off + 4], bodies[off + 5], bodies[off + 6]);
    }
};
