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

/** Keep finite whole-scene evidence even after a failing baseline leaves the
 * footprint. Separately count escapes that happened while still over the floor.
 */
export function floorObservation(bodies, poseOf, floor, epsilon) {
    let minTop=Infinity,worst=-1,outside=0,insideEscaped=0;
    for(let i=0;i<bodies.length;i++) {
        const bounds=bodyBounds(bodies[i],poseOf(bodies[i].id));
        const off=bounds.lo[0]<-floor.half||bounds.hi[0]>floor.half||bounds.lo[2]<-floor.half||bounds.hi[2]>floor.half;
        if(off)outside++;
        else if(bounds.hi[1]<floor.bottom-epsilon)insideEscaped++;
        if(bounds.hi[1]<minTop){minTop=bounds.hi[1];worst=i;}
    }
    if(!Number.isFinite(minTop))throw Error('No finite dynamic collider bounds');
    return [minTop,worst,outside,insideEscaped];
}
