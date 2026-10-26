// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {kernelSource,sha256} from './fixtures/bw-sim/floor-contact/kernel-source.mjs';
import {bodyBounds,rotate,floorObservation} from './fixtures/bw-sim/floor-contact/bounds.mjs';
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
test('Floor contact: native ground keeps box contacts and backs the thin surface',()=>{
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url),'utf8');
    const block=source.match(/\/\/ FLOOR1436_GROUND_BEGIN\n([\s\S]*?)\/\/ FLOOR1436_GROUND_END/)[1];
    const factory=runInNewContext(block+'\ncreateBoxColliderShape',{boxConvexRadius:h=>Math.min(.0005,.25*Math.min(...h))});
    const destroyed=[];let reject=false,cleared=0;
    class Vec3{constructor(...v){this.v=v;}}
    class Quat{constructor(...v){this.v=v;}}
    class BoxShape{constructor(half,convex){this.half=half;this.convex=convex;}}
    class BoxShapeSettings extends BoxShape{}
    class StaticCompoundShapeSettings{
        constructor(){this.children=[];}
        AddShape(position,rotation,shape,userData){this.children.push({position,rotation,shape,userData});}
        Create(){return {HasError:()=>reject,GetError:()=>'deliberate create error',Clear:()=>cleared++,Get:()=>this.children};}
    }
    const J={Vec3,Quat,BoxShape,BoxShapeSettings,StaticCompoundShapeSettings,destroy:v=>destroyed.push(v)};
    const body={id:'ground',motion:'static',parts:[],colliders:[{}],position:[0,-.01,0],rotation:[0,0,0,1]},col={halfExtents:[10,.01,10]};
    const made=factory(J,body,col);assert.equal(made.shape.length,1);
    const child=made.shape[0];assert.ok(child.shape instanceof BoxShapeSettings);
    assert.deepEqual(child.shape.half.v,[10,10,10]);assert.equal(child.shape.convex,.0005);
    assert.ok(Math.abs(child.position.v[1]+child.shape.half.v[1]-.01)<1e-12,'top height retained');
    assert.ok(child.position.v[1]-child.shape.half.v[1]<-19,'native box backs the slab');
    assert.deepEqual(child.rotation.v,[0,0,0,1]);assert.equal(child.userData,0);
    assert.equal(cleared,0,'result/settings stay alive until body ownership');
    made.releaseAfterBody[0]();J.destroy(made.releaseAfterBody[1]);assert.equal(cleared,1);
    for(const changed of [{...body,id:'platform'},{...body,parts:['plate']},{...body,motion:'dynamic'},{...body,rotation:[0,0,1,0]}])assert.ok(factory(J,changed,col).shape instanceof BoxShape);
    assert.ok(factory(J,body,{halfExtents:[5,.01,5]}).shape instanceof BoxShape);
    reject=true;assert.throws(()=>factory(J,body,col),/deliberate create error/);assert.equal(cleared,2);
    assert.equal(destroyed.filter(x=>x instanceof StaticCompoundShapeSettings).length,2,'both successful and failed settings released once');
});
test('Floor contact: a failed baseline can leave the footprint without erasing its series',()=>{
    const bodies=[{id:'a',colliders:[{shape:'box',halfExtents:[.005,.005,.005]}]}];
    const floor={half:10,bottom:-.02},pose={position:[20,-1,0],rotation:[0,0,0,1]};
    const outside=floorObservation(bodies,()=>pose,floor,1e-6);
    assert.ok(Number.isFinite(outside[0]));assert.deepEqual(outside.slice(1),[0,1,0]);
    const inside=floorObservation(bodies,()=>({...pose,position:[0,-1,0]}),floor,1e-6);
    assert.deepEqual(inside.slice(1),[0,0,1],'in-footprint escape is separately witnessed');
});
