// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Restitution per material PAIR (contracts.js MATERIALS, restitutionOf). Jolt combines two bodies'
// restitution as max(e1, e2): a brick hitting a tyre would bounce like ABS on ABS. The Brickwright Jolt fork
// (jolt-physics 1.1.0-bw.3, MaterialPairs in its JoltJS.h) takes a combine table instead: a body's material is
// the low 8 bits of its user data, and a contact between two bodies with materials gets the table's entry.
// Bodies without a material (hand-built mechanisms) keep Jolt's max rule. The table is one per Jolt module
// (the combine function is a C++ function pointer): every core installs the same entries.
import {MATERIALS, restitutionOf} from '../contracts.js';

/** Material name → its index in the table (1-based: 0 is "no material"). */
export const MATERIAL_INDEX = new Map(Object.keys(MATERIALS).map((name, i) => [name, i + 1]));

/**
 * Fill the fork's table from MATERIALS and make `physicsSystem` combine restitution through it.
 * @returns {boolean} false with a Jolt build that has no MaterialPairs (then Jolt's max rule applies)
 */
export const installMaterialPairs = (J, physicsSystem) => {
    if (!J.MaterialPairs || typeof J.MaterialPairs.prototype.sInstall !== 'function') return false;
    for (const [a, i] of MATERIAL_INDEX) {
        for (const [b, k] of MATERIAL_INDEX) J.MaterialPairs.prototype.sSetRestitution(i, k, restitutionOf(a, b));
    }
    J.MaterialPairs.prototype.sInstall(physicsSystem);
    return true;
};
