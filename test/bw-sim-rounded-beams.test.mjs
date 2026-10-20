// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {primitivesOverlap} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const cylinder=(x,z)=>({shape:'cylinder',centre:[x,0,z],axis:[0,1,0],radius:9,halfHeight:10});
const box={shape:'box',centre:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],halfExtents:[9,10,9]};
test('round beam ends: exact parallel disk/box and disk/disk tests reject square-corner false collisions',()=>{
    assert.equal(primitivesOverlap(cylinder(16,16),box,0),false);
    assert.equal(primitivesOverlap(cylinder(14,14),box,0),true);
    assert.equal(primitivesOverlap(cylinder(0,0),cylinder(13,13),0),false);
    assert.equal(primitivesOverlap(cylinder(0,0),cylinder(12,12),0),true);
    const a={...cylinder(0,0),centre:[0,20,0]};
    assert.equal(primitivesOverlap(a,box,0),false,'flush end faces');
    const r=Math.SQRT1_2;
    const rotated={...box,axes:[[r,0,r],[0,1,0],[-r,0,r]]};
    assert.equal(primitivesOverlap(cylinder(22.6,0),rotated,0),false);
    assert.equal(primitivesOverlap(cylinder(20,0),rotated,0),true);
});
test('9L/11L beam collision ends follow the official 9 LDU semicircular geometry',()=>{
    const C=JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))).parts;
    for(const [part,end] of [['40490.dat',80],['32525.dat',100]]){
        const m=C.find(p=>p.part===part);
        assert.equal(m.colliders.length,3);
        assert.deepEqual(m.colliders[0].halfExtents,[9,10,end]);
        assert.deepEqual(m.colliders.slice(1).map(c=>c.position),[[0,0,-end],[0,0,end]]);
        for(const c of m.colliders.slice(1)){assert.equal(c.radius,9);assert.equal(c.halfHeight,10);}
        const source=readFileSync(new URL(`../overlay/scratch-gui/static/ldraw/parts/${part}`,import.meta.url),'utf8');
        assert.ok(source.includes(`0 -10 -${end} 9 0 0 0 20 0 0 0 -9 2-4cyli.dat`),'official outer end radius/thickness');
    }
});
