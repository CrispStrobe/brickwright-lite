// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {kernelSource,sha256} from './fixtures/bw-sim/floor-contact/kernel-source.mjs';
import {bodyBounds,rotate} from './fixtures/bw-sim/floor-contact/bounds.mjs';
const root=new URL('./fixtures/bw-sim/floor-contact/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
test('Floor contact: exact public served inputs and kernel identities',()=>{
    for(const f of manifest.inputs){const b=readFileSync(new URL(f.file,root));assert.equal(b.length,f.bytes);assert.equal(sha256(b),f.sha256);}
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url),'utf8');
    const producer=readFileSync(new URL('../scripts/integrate.mjs',import.meta.url),'utf8');
    assert.equal(manifest.engine.pinSource,'scripts/integrate.mjs');
    const pinURL=new URL(producer.match(/const JOLT_PHYSICS_URL = '([^']+)'/)[1]);
    assert.equal(pinURL.hostname,'github.com');
    assert.equal(pinURL.pathname,'/CrispStrobe/JoltPhysics.js/releases/download/v'+manifest.engine.version+'/jolt-physics-'+manifest.engine.version+'.tgz');
    assert.equal(producer.match(/const JOLT_PHYSICS_INTEGRITY = '([^']+)'/)[1],manifest.engine.integrity);
    assert.equal(kernelSource(source,'candidate',manifest),source);
    const baseline=readFileSync(new URL('baseline-jolt-core.js',root),'utf8');
    assert.equal(sha256(kernelSource(source,'baseline',manifest,baseline)),manifest.kernel.baselineSha256);
    assert.equal(kernelSource(source+'\n','candidate',manifest),source+'\n');
    assert.throws(()=>kernelSource(source,'baseline',manifest,baseline+'\n'));
    assert.throws(()=>kernelSource(source,'invented',manifest));
});
test('Floor contact: conservative rotated collider bounds detect whole-body escape',()=>{
    const body={colliders:[{shape:'box',position:[0,1,0],halfExtents:[1,2,3]}]},pose={position:[0,-10,0],rotation:[0,0,0,1]};
    assert.deepEqual(bodyBounds(body,pose),{lo:[-1,-11,-3],hi:[1,-7,3]});
    assert.deepEqual(rotate([0,0,0,1],[1,2,3]),[1,2,3]);
    const q=[0,0,Math.SQRT1_2,Math.SQRT1_2],b=bodyBounds({colliders:[{shape:'box',halfExtents:[1,2,3]}]},{position:[0,0,0],rotation:q});
    assert.ok(Math.abs(b.hi[1]-1)<1e-12);assert.ok(Math.abs(b.hi[0]-2)<1e-12);
    assert.throws(()=>bodyBounds(body,{...pose,position:[0,NaN,0]}));
});
test('Floor contact: the control removes only the nine passive-chain parts',()=>{
    const parts=file=>{
        const result=new Map();let id;
        for(const line of readFileSync(new URL(file,root),'utf8').split(/\r?\n/)){
            if(line.startsWith('0 !BW ID '))id=line.slice(9);
            if(line.startsWith('1 ')){assert.ok(id&&!result.has(id));result.set(id,line);id=null;}
        }
        return result;
    };
    const intact=parts('inputs/intact.ldr'),single=parts('inputs/single-chain.ldr');
    assert.equal(intact.size,144);assert.equal(single.size,135);
    assert.deepEqual([...intact.keys()].filter(id=>!single.has(id)).sort(),[
        'b_deck_pin','b_elbow_pin','b_fork_crosspin_40','b_fork_crosspin_80',
        'b_fork_spacer_40','b_fork_spacer_80','b_lower_fork_-1','b_lower_fork_1','b_upper_link'
    ]);
    for(const [id,line] of single)assert.equal(line,intact.get(id),'remaining geometry unchanged: '+id);
});
test('Floor contact: actual shape factory preserves authored boxes and plane height',()=>{
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url),'utf8');
    const block=source.match(/\/\/ FLOOR1436_GROUND_BEGIN\n([\s\S]*?)\/\/ FLOOR1436_GROUND_END/)[1];
    const factory=runInNewContext(block+'\ncreateBoxColliderShape',{boxConvexRadius:h=>Math.min(.0005,.25*Math.min(...h))});
    const destroyed=[];
    class Vec3{constructor(...v){this.v=v;}}
    class Plane{constructor(normal,constant){this.normal=normal;this.constant=constant;}}
    class PlaneShape{constructor(plane,material,extent){this.plane=plane;this.material=material;this.extent=extent;}}
    class BoxShape{constructor(half,convex){this.half=half;this.convex=convex;}}
    const J={Vec3,Plane,PlaneShape,BoxShape,destroy:v=>destroyed.push(v)};
    const body={id:'ground',motion:'static',parts:[],colliders:[{}],position:[0,-.01,0],rotation:[0,0,0,1]},col={halfExtents:[10,.01,10]};
    const shape=factory(J,body,col);assert.ok(shape instanceof PlaneShape);
    assert.deepEqual(shape.plane.normal.v,[0,1,0]);assert.equal(shape.plane.constant,-.01);
    assert.equal(shape.extent,10);assert.deepEqual(destroyed,[shape.plane,shape.plane.normal]);
    for(const changed of [{...body,id:'platform'},{...body,parts:['plate']},{...body,motion:'dynamic'},{...body,rotation:[0,0,1,0]}])assert.ok(factory(J,changed,col) instanceof BoxShape);
    assert.ok(factory(J,body,{halfExtents:[5,.01,5]}) instanceof BoxShape);
});
