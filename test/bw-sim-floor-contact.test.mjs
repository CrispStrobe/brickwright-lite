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
    // The release tag is the producer's own URL segment (bw.9 is published under
    // bw.9-qualified-20261029, not v<version>); the lockfile must resolve the same bytes.
    assert.equal(pinURL.pathname,'/CrispStrobe/JoltPhysics.js/releases/download/'+manifest.engine.releaseTag+'/jolt-physics-'+manifest.engine.version+'.tgz');
    const lock=JSON.parse(readFileSync(new URL('../packages/scratch-gui/package-lock.json',import.meta.url),'utf8')).packages['node_modules/jolt-physics'];
    assert.deepEqual({version:lock.version,resolved:lock.resolved,integrity:lock.integrity},{version:manifest.engine.version,resolved:pinURL.href,integrity:manifest.engine.integrity});
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
const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url),'utf8');
const helperBlock=source.match(/\/\/ FLOOR1436_GROUND_BEGIN\n([\s\S]*?)\/\/ FLOOR1436_GROUND_END/)[1];
const helpers=runInNewContext(helperBlock+'\n({floorSweepPlan,floorLowestY,withFloorSweeps})',{CCD_MAX_COLLIDERS:8});
const ground={id:'ground',motion:'static',parts:[],colliders:[{shape:'box',halfExtents:[10,.01,10]}],position:[0,-.01,0],rotation:[0,0,0,1]};
const compound={id:'compound',motion:'dynamic',colliders:Array.from({length:9},()=>({shape:'box',halfExtents:[.005,.005,.005]}))};
test('Floor contact: adaptive plan preserves explicit policies and collision exclusions',()=>{
    const mechanism={bodies:[ground,compound,{...compound,id:'simple',colliders:compound.colliders.slice(0,8)}],noCollide:[]};
    const plan=(m=mechanism,e={},p=new Map())=>helpers.floorSweepPlan(m,e,p);
    assert.equal(plan().top,0);assert.deepEqual(Array.from(plan().bodies,b=>b.id),['compound']);
    assert.ok(Math.abs(plan({...mechanism,bodies:[{...ground,position:[0,-.1692,0]},compound]}).top+.1592)<1e-12,'model-derived floor height retained');
    assert.equal(plan(mechanism,{discrete:true}),null);assert.equal(plan(mechanism,{ccdMaxColliders:9}),null);
    for(const g of [{...ground,id:'platform'},{...ground,parts:['plate']},{...ground,rotation:[0,0,1,0]},
        {...ground,colliders:[{shape:'box',halfExtents:[5,.01,5]}]}])assert.equal(plan({...mechanism,bodies:[g,compound]}),null);
    const excluded={...mechanism,noCollide:[['ground','compound']]};
    assert.equal(plan(excluded).bodies.length,0);
    assert.equal(plan(excluded,{},new Map([['ground|compound',{}]])).bodies.length,1,'part-local exception keeps native whole pair enabled');
    assert.equal(plan({...mechanism,noCollide:[['compound','ground']]}).bodies.length,0);
});
test('Floor contact: collider support agrees with independent rotated bounds',()=>{
    const q=[0,0,Math.SQRT1_2,Math.SQRT1_2];
    for(const col of [{shape:'box',halfExtents:[1,2,3]}, {shape:'sphere',radius:.4},
        {shape:'cylinder',radius:.3,halfHeight:.8}]) {
        for(const rotation of [[0,0,0,1],q,[.5,.5,.5,.5]]) {
            const body={colliders:[{...col,position:[.3,-.2,.1],rotation:q}]},position=[0,4,0];
            assert.ok(Math.abs(helpers.floorLowestY(body,position,rotation)-bodyBounds(body,{position,rotation}).lo[1])<1e-12);
        }
    }
    assert.equal(helpers.floorLowestY(compound,[20,-1,0],[0,0,0,1]),Infinity,'outside finite floor');
    const separated={colliders:[{shape:'sphere',radius:.1,position:[20,-5,0]},{shape:'sphere',radius:.1,position:[0,1,0]}]};
    assert.equal(helpers.floorLowestY(separated,[0,0,0],[0,0,0,1]),.9,'off-floor collider does not invent a floor threat');
});
test('Floor contact: actual step selector copies binding-owned values and sweeps only threatening downward motion',()=>{
    const functionText=source.slice(source.indexOf('    const floorRiskBodies = () => {'),source.indexOf('\n    // Self-collision is local'));
    let y=.25,velocityY=-20,gets=0,destroys=0;
    const floorPlan={top:0,bodies:[compound]};
    const vector=values=>({GetX:()=>values[0],GetY:()=>values[1],GetZ:()=>values[2],GetW:()=>values[3]});
    const select=runInNewContext(helperBlock+'\n'+functionText+'\nfloorRiskBodies',{
        CCD_MAX_COLLIDERS:8,LEGO_PENETRATION_SLOP_M:.0002,LEGO_SPECULATIVE_CONTACT_M:.002,
        floorSweep:floorPlan,dtFixed:.005,bodyMap:new Map([['compound',{bodyID:'actual-id'}]]),
        J:{destroy:()=>destroys++},bodyInterface:{GetLinearVelocity:()=>vector([0,velocityY,0]),
            GetPosition:()=>{gets++;return vector([0,y,0]);},GetRotation:()=>vector([0,0,0,1])}
    });
    assert.equal(select().length,0,'falling but clear of floor');
    y=.05;assert.deepEqual(Array.from(select()),['actual-id'],'fast floor crossing is swept');
    velocityY=1;assert.equal(select().length,0,'upward motion unchanged');
    velocityY=-.01;assert.equal(select().length,0,'sub-slop resting jitter unchanged');
    floorPlan.top=-.1592;velocityY=-.2;y=-.14;assert.equal(select().length,0,'above actual shifted surface');
    y=-.159;assert.deepEqual(Array.from(select()),['actual-id'],'risk uses model-derived surface');
    assert.equal(gets,4);assert.equal(destroys,0,'binding-owned static values must never be destroyed');
});
test('Floor contact: temporary quality restores on native, selection and cleanup failure',()=>{
    const events=[],stepError=new Error('native step'),restoreError=new Error('restore');
    const set=(id,q)=>events.push([id,q]);
    assert.equal(helpers.withFloorSweeps(['a','b'],set,'D','LC',()=>{events.push('step');return 7;}),7);
    assert.deepEqual(events,[['a','LC'],['b','LC'],'step',['b','D'],['a','D']]);
    events.length=0;
    assert.throws(()=>helpers.withFloorSweeps(['a'],set,'D','LC',()=>{throw stepError;}),e=>e===stepError);
    assert.deepEqual(events,[['a','LC'],['a','D']]);
    events.length=0;
    assert.throws(()=>helpers.withFloorSweeps(['a','b'],(id,q)=>{set(id,q);if(id==='b'&&q==='LC')throw stepError;},'D','LC',()=>assert.fail('step after setup failure')),e=>e===stepError);
    assert.deepEqual(events,[['a','LC'],['b','LC'],['b','D'],['a','D']]);
    events.length=0;
    assert.throws(()=>helpers.withFloorSweeps(['a','b'],(id,q)=>{set(id,q);if(id==='b'&&q==='D')throw restoreError;},'D','LC',()=>{throw stepError;}),e=>Array.from(e.errors).includes(stepError)&&Array.from(e.errors).includes(restoreError));
    assert.deepEqual(events,[['a','LC'],['b','LC'],['b','D'],['a','D']],'cleanup continues after one restoration fails');
});
test('Floor contact: a failed baseline can leave the footprint without erasing its series',()=>{
    const bodies=[{id:'a',colliders:[{shape:'box',halfExtents:[.005,.005,.005]}]}];
    const floor={half:10,bottom:-.02},pose={position:[20,-1,0],rotation:[0,0,0,1]};
    const outside=floorObservation(bodies,()=>pose,floor,1e-6);
    assert.ok(Number.isFinite(outside[0]));assert.deepEqual(outside.slice(1),[0,1,0]);
    const inside=floorObservation(bodies,()=>({...pose,position:[0,-1,0]}),floor,1e-6);
    assert.deepEqual(inside.slice(1),[0,0,1],'in-footprint escape is separately witnessed');
});
