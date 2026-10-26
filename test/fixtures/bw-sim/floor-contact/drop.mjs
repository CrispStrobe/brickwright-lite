// SPDX-License-Identifier: BSD-3-Clause
import assert from 'node:assert/strict';
import {createPhysicsCore,loadJolt} from '../../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {bodyBounds} from './bounds.mjs';
export async function runCompoundDrop(manifest) {
    const colliders=Array.from({length:9},(_,i)=>({shape:'box',halfExtents:[.005,.005,.005],position:[(i%3-1)*.012,0,(Math.floor(i/3)-1)*.012]}));
    const body={id:'compound',motion:'dynamic',position:[0,.25,0],rotation:[0,0,0,1],massKg:.2,parts:[],colliders};
    const ground={id:'ground',motion:'static',position:[0,-.01,0],rotation:[0,0,0,1],massKg:0,parts:[],colliders:[{shape:'box',halfExtents:[10,.01,10]}],friction:.8,restitution:0};
    const core=createPhysicsCore(await loadJolt(),{version:1,gravity:[0,-9.81,0],bodies:[ground,body],joints:[],gears:[],diagnostics:[]},{stepHz:200});
    const rows=[];let escapedSteps=0,firstEscape=null,lastEscapeStep=0;
    try {
        const groundPose=core.bodyPose(ground.id);
        assert.ok(groundPose.position.every((v,i)=>Math.abs(v-ground.position[i])<manifest.floorEscapeEpsilonM),'logical ground origin retained');
        core.observeFixedSteps(({t})=>{
            const bounds=bodyBounds(body,core.bodyPose(body.id));
            const outside=Number(bounds.lo[0]<-10||bounds.hi[0]>10||bounds.lo[2]<-10||bounds.hi[2]>10);
            rows.push([t,bounds.hi[1],0,outside,Number(!outside&&bounds.hi[1]<-.02-manifest.floorEscapeEpsilonM)]);
            if(bounds.hi[1]<-.02-manifest.floorEscapeEpsilonM){escapedSteps++;firstEscape??=t;lastEscapeStep=rows.length;}
        });
        core.setBodyVelocity(body.id,[0,-20,0],[0,0,0]);
        for(let i=0;i<2000;i++)core.step(manifest.dtSeconds);
        return {floor:{top:0,bottom:-.02,half:10},bodyIds:[body.id],finishedAt:null,programCompleted:false,
            observedUntilMs:rows.at(-1)[0]*1000,escapedSteps,insideEscapedSteps:rows.filter(row=>row[4]>0).length,firstEscape,firstInsideEscape:rows.find(row=>row[4]>0)?.[0]??null,lastEscapeStep,
            groundPose,initialHeightM:body.position[1],initialVelocity:[0,-20,0],colliderCount:9,rows};
    } finally {core.destroy();}
}
