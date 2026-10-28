// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Pure algebra for the provisional diagonal-body rotor approximation. This is not
// a replacement for a native coupled inertia: contacts still see inflated inertia.
export const rotorMatVec = (a, x) => a.map(row => row.reduce((s, v, i) => s + v * x[i], 0));
export const rotorAdd = (a, b) => a.map((row, i) => row.map((v, j) => v + b[i][j]));
export const rotorInverse = a => {
    const cof = [
        [a[1][1]*a[2][2]-a[1][2]*a[2][1], a[0][2]*a[2][1]-a[0][1]*a[2][2], a[0][1]*a[1][2]-a[0][2]*a[1][1]],
        [a[1][2]*a[2][0]-a[1][0]*a[2][2], a[0][0]*a[2][2]-a[0][2]*a[2][0], a[0][2]*a[1][0]-a[0][0]*a[1][2]],
        [a[1][0]*a[2][1]-a[1][1]*a[2][0], a[0][1]*a[2][0]-a[0][0]*a[2][1], a[0][0]*a[1][1]-a[0][1]*a[1][0]]
    ];
    const d = a[0].reduce((s, v, i) => s + v * cof[i][0], 0);
    if (!(d > 0) || !Number.isFinite(d)) throw new Error('rotor tensor must have a finite positive determinant');
    return cof.map(row => row.map(v => v / d));
};
export const rotorAxialMoment = (tensor, axis) => {
    const v = rotorMatVec(rotorInverse(tensor), axis);
    return 1 / axis.reduce((s, a, i) => s + a * v[i], 0);
};
export const rotorRankOne = (axis, x) => axis.map(a => axis.map(b => x * a * b));
/** x makes the diagonal pair's reduced axial moment equal mu + Jr. */
export const rotorPairAddition = (i1, i2, jr) => {
    if (jr === 0) return 0;
    const s = i1 + i2, b = s - 2 * (i1 * i2 / s + jr);
    const discriminant = Math.sqrt(b * b + 4 * jr * s);
    return b >= 0 ? 2 * jr * s / (discriminant + b) : (discriminant - b) / 2;
};
/** Rebuild from bare tensors, never subtract floating point deltas from live tensors.
 * Bodies map: id -> bare local tensor; absent means static/kinematic/world.
 * Multiple rotor additions are additive; no exact general multirotor modal claim.
 */
export function rotorTensorPlan(bodies, hinges) {
    const tensors = new Map([...bodies].map(([id, a]) => [id, a.map(row => [...row])]));
    for (const h of hinges) {
        if (!(h.jr > 0)) continue;
        const a = bodies.get(h.body1), b = bodies.get(h.body2);
        const x = a && b ? rotorPairAddition(rotorAxialMoment(a,h.axis1),rotorAxialMoment(b,h.axis2),h.jr) : h.jr;
        for (const [id, axis] of [[h.body1,h.axis1],[h.body2,h.axis2]]) {
            if (tensors.has(id)) tensors.set(id,rotorAdd(tensors.get(id),rotorRankOne(axis,x)));
        }
    }
    return tensors;
}
/** Connected dynamic rotor components, including explicit rotor-anchor admission.
 * A component touching a non-dynamic rotor endpoint has external reaction; applying
 * a common kick to only its moving subset would change its anchored hinge rates.
 */
export function rotorComponents(dynamic, hinges) {
    const links=new Map([...dynamic].map(id=>[id,new Set()])), anchored=new Set();
    for(const h of hinges){
        if(!(h.jr>0))continue;
        const a=links.has(h.body1),b=links.has(h.body2);
        if(a&&b){links.get(h.body1).add(h.body2);links.get(h.body2).add(h.body1);}
        else if(a||b)anchored.add(a?h.body1:h.body2);
    }
    const seen=new Set(),out=[];
    for(const id of links.keys()){
        if(seen.has(id)||!links.get(id).size)continue;
        const ids=[],todo=[id];
        while(todo.length){const v=todo.pop();if(seen.has(v))continue;seen.add(v);ids.push(v);todo.push(...links.get(v));}
        out.push({ids,anchored:ids.some(v=>anchored.has(v))});
    }
    return out;
}
/** Full-vector common rate: Σ Ibare * c = -P. A scalar axis kick is insufficient
 * for anisotropic tensors. Same c on all component bodies preserves every pair's
 * relative angular velocity. Input P is ONLY the current constraint-impulse error.
 */
export function rotorCommonRate(tensors, momentum) {
    const total=tensors.reduce(rotorAdd);
    return rotorMatVec(rotorInverse(total),momentum).map(v=>-v);
}
