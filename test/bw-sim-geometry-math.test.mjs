// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {length3, windingNumber} from './helpers/model-geometry-math.mjs';
/** Generalised winding number of the mesh at p (part frame). */
const referenceWinding = (T, p) => {
    let sum = 0;
    for (let i = 0; i < T.length; i += 9) {
        const ax = T[i] - p[0], ay = T[i + 1] - p[1], az = T[i + 2] - p[2];
        const bx = T[i + 3] - p[0], by = T[i + 4] - p[1], bz = T[i + 5] - p[2];
        const cx = T[i + 6] - p[0], cy = T[i + 7] - p[1], cz = T[i + 8] - p[2];
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
        const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
        const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
        sum += 2 * Math.atan2(det, den);
    }
    return sum / (4 * Math.PI);
};

test('three-component length agrees with the robust reference, including exceptional magnitudes', () => {
    const vectors = [[0,0,0],[-0,0,0],[3,4,0],[Infinity,NaN,0],[NaN,1,0],[1e308,1e308,1e-308],[1e-320,1e-320,1e-320]];
    for (let exponent = -320; exponent <= 308; exponent += 7) for (let i = 0; i < 13; i++) vectors.push([1,-2,3].map((v,k)=>v*Math.sin(i+k+.3)*10**exponent));
    for (const v of vectors) {
        const expected = Math.hypot(...v), actual = length3(...v);
        if (!Number.isFinite(expected) || expected===0) assert.ok(Object.is(actual,expected), String(v));
        else assert.ok(Math.abs(actual-expected)<=4*Number.EPSILON*expected, String(v));
    }
});
const cube = () => {
    const triangles=[];
    for(let axis=0;axis<3;axis++)for(const sign of[-1,1]) {
        const u=(axis+1)%3,v=(axis+2)%3,face=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const p=[0,0,0];p[axis]=sign;p[u]=a;p[v]=b;return p;});
        if(sign<0)face.reverse();triangles.push(face[0],face[1],face[2],face[0],face[2],face[3]);
    }
    return new Float64Array(triangles.flat());
};
test('closed solid retains inside/outside winding and the original triangle decisions', () => {
    const T=cube();
    assert.ok(Math.abs(windingNumber(T,[0,0,0])-1)<1e-12);
    assert.ok(Math.abs(windingNumber(T,[3,2,4]))<1e-12);
    for(let i=0;i<300;i++) {
        const p=[Math.sin(i*.7)*2.7,Math.cos(i*.3)*2.3,Math.sin(i*.13)*3.1],a=referenceWinding(T,p),b=windingNumber(T,p);
        assert.equal(b>.5,a>.5);assert.ok(Math.abs(a-b)<1e-12);
    }
});
test('an open mesh at the decision boundary retains the original robust result', () => {
    const half=cube().slice(0,54);
    for(const offset of[0,-1e-12,1e-12,-1e-9,1e-9,-1e-7,1e-7]) {
        const p=[offset,0,0],expected=referenceWinding(half,p),actual=windingNumber(half,p);
        assert.equal(actual>.5,expected>.5);
        if(Math.abs(expected-.5)<1e-8)assert.equal(actual,expected);
    }
});
