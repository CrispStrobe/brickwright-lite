// SPDX-License-Identifier: BSD-3-Clause
// Conservative world-space collider AABB; never modifies an engine pose.
export function rotate(q, v) {
    const [x,y,z,w] = q, [a,b,c] = v;
    const tx = 2*(y*c-z*b), ty = 2*(z*a-x*c), tz = 2*(x*b-y*a);
    return [a+w*tx+y*tz-z*ty, b+w*ty+z*tx-x*tz, c+w*tz+x*ty-y*tx];
}
export function bodyBounds(body, pose) {
    if (!pose || [...pose.position, ...pose.rotation].some(v => !Number.isFinite(v))) throw Error('Non-finite body pose');
    const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
    for (const col of body.colliders) {
        const offset = rotate(pose.rotation, col.position || [0,0,0]);
        const axes = [[1,0,0],[0,1,0],[0,0,1]].map(v => rotate(pose.rotation, rotate(col.rotation || [0,0,0,1], v)));
        for (let k=0;k<3;k++) {
            let extent;
            if (col.shape === 'box') extent = col.halfExtents.reduce((s,h,i) => s+h*Math.abs(axes[i][k]), 0);
            else if (col.shape === 'sphere') extent = col.radius;
            else if (col.shape === 'cylinder') extent = col.halfHeight*Math.abs(axes[1][k])+col.radius*Math.sqrt(Math.max(0,1-axes[1][k]**2));
            else throw Error('Unsupported collider: '+col.shape);
            const center = pose.position[k]+offset[k];
            lo[k] = Math.min(lo[k],center-extent); hi[k] = Math.max(hi[k],center+extent);
        }
    }
    return {lo,hi};
}
