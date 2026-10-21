// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
export const TIDAL_PRESETS = [
    {id: 'tidal-trio', key: 'tidal-trio.ldr', offsets: [0, 120, 240]},
    {id: 'tidal-trio-together', key: 'tidal-trio-together', offsets: [0, 0, 0]},
    {id: 'tidal-trio-alternating', key: 'tidal-trio-alternating', offsets: [0, 180, 0]},
    {id: 'tidal-trio-reverse', key: 'tidal-trio-reverse', offsets: [0, 240, 120]}
];
const DEG = 180 / Math.PI;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (v, s) => v.map(x => x * s);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = ([a,b,c], [x,y,z]) => [b*z-c*y, c*x-a*z, a*y-b*x];
const mul = ([x,y,z,w], [a,b,c,d]) => [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj = ([x,y,z,w]) => [-x,-y,-z,w];
const rotate = (q, v) => mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const carry = (pose, initial, v) => add(pose.position,rotate(mul(pose.rotation,conj(initial.rotation)),sub(v,initial.position)));
const modulo = a => ((a + 180) % 360 + 360) % 360 - 180;
const body = (m, id) => { const b = m.bodies.find(b => b.parts.includes(id)); assert.ok(b, id); return b; };
const connects = (j, a, b) => [j.body1,j.body2].includes(a) && [j.body1,j.body2].includes(b);
/** Solve the specified 16/48/32/48 mm loop independently of Jolt's hinge angles. */
export const judgeTidalRun = (id, r) => {
    const preset = TIDAL_PRESETS.find(p => p.id === id);
    assert.ok(preset);
    assert.deepEqual(r.unsupported, []);
    assert.deepEqual(r.issues.map(i => i.code), ['locked-hinges','locked-hinges','locked-hinges']);
    const flags = r.issues.flatMap(i => i.parts).filter(p => /^rocker[012]$/.test(p)).sort();
    assert.deepEqual(flags, ['rocker0','rocker1','rocker2']);
    const {mechanism: m, track, hubId} = r;
    assert.ok(track.length > 100);
    const base = body(m,'hub');
    assert.equal(base.id, hubId);
    assert.equal(body(m,'motor0').id, base.id, 'hub is pinned to the chassis');
    for (const f of track) {
        const root = f.bodies[hubId];
        for (const p of Object.values(f.bodies)) {
            assert.ok([...p.position,...p.rotation].every(Number.isFinite));
            assert.ok(Math.hypot(...sub(p.position,root.position)) < .5, 'assembly remains together');
        }
        const up = rotate(mul(root.rotation,conj(base.rotation)),[0,1,0]);
        assert.ok(up[1] > .995, 'chassis stays upright');
    }
    const results = {};
    for (let lane = 0; lane < 3; lane++) {
        const port = 'ABC'[lane];
        const a = m.actuators.find(a => a.port === port);
        const motor = m.joints.find(j => j.id === a.joint);
        const crank = body(m,`crank${lane}`), coupler = body(m,`coupler${lane}`), rocker = body(m,`rocker${lane}`);
        const pin = m.joints.find(j => connects(j,crank.id,coupler.id));
        const pivot = m.joints.find(j => connects(j,base.id,rocker.id));
        const end = m.joints.find(j => connects(j,coupler.id,rocker.id));
        assert.ok(pin && pivot && end, 'four real revolute joints');
        const ex0 = sub(pivot.point,motor.point);
        const planar = sub(ex0,scale(motor.axis,dot(ex0,motor.axis)));
        assert.ok(Math.abs(Math.hypot(...planar)-.048)<1e-7,'48 mm fixed pivots');
        const ex = scale(planar,1/.048), ey = cross(motor.axis,ex);
        const angles = []; let closure = 0, crankError = 0;
        for (const f of track) {
            const q = mul(f.bodies[base.id].rotation,conj(base.rotation));
            const x = rotate(q,ex), y = rotate(q,ey);
            const o = carry(f.bodies[base.id],base,motor.point);
            const g = carry(f.bodies[base.id],base,pivot.point);
            const c = carry(f.bodies[crank.id],crank,pin.point);
            const e = carry(f.bodies[rocker.id],rocker,end.point);
            const theta = f.joints[a.joint].angle;
            const cx = .016*Math.cos(theta), cy = .016*Math.sin(theta);
            crankError = Math.max(crankError,Math.hypot(dot(sub(c,o),x)-cx,dot(sub(c,o),y)-cy));
            const vx = cx-.048, vy = cy, h = Math.hypot(vx,vy);
            const along = (.032**2-.048**2+h*h)/(2*h);
            const across = Math.sqrt(Math.max(0,.032**2-along**2));
            const expectedX = along*vx/h + across*vy/h;
            const expectedY = along*vy/h - across*vx/h;
            const actual = [dot(sub(e,g),x),dot(sub(e,g),y)];
            closure = Math.max(closure,Math.hypot(actual[0]-expectedX,actual[1]-expectedY));
            angles.push(Math.atan2(actual[1],actual[0])*DEG);
        }
        const sweep = Math.max(...angles)-Math.min(...angles);
        assert.ok(crankError < .0002, `${port} crank follows motor: ${crankError}`);
        assert.ok(closure < .00025, `${port} four-bar closure residual: ${closure}`);
        assert.ok(Math.abs(sweep-63.06789)<.6, `${port} rocker sweep: ${sweep}`);
        const input = track.at(-1).joints[a.joint].angle*DEG;
        assert.ok(Math.abs(modulo(input-preset.offsets[lane])) < 1 && Math.abs(input) > 540, `${port} continuous crank rotation: ${input}`);
        results[port] = {inputDeg: input, rockerSweepDeg: sweep, closureMm: closure*1000, crankErrorMm: crankError*1000};
    }
    const a = m.actuators.find(a => a.port === 'A');
    let phaseError = 0;
    for (const f of track.filter(f => f.joints[a.joint].angle > Math.PI && Math.abs(f.joints[a.joint].velocity) > .4)) {
        for (let lane=1;lane<3;lane++) {
            const b=m.actuators.find(a=>a.port==='ABC'[lane]);
            phaseError=Math.max(phaseError,Math.abs(modulo((f.joints[b.joint].angle-f.joints[a.joint].angle)*DEG-preset.offsets[lane])));
        }
    }
    assert.ok(phaseError < 3, `phase offsets track: ${phaseError}`);
    assert.ok(Object.values(track.at(-1).busy).every(b => !b), 'program stops all motors');
    return {...results, phaseErrorDeg: phaseError};
};
