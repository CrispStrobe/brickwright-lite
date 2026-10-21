// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const I=[1,0,0,0,1,0,0,0,1],wheel={id:'wheel',part:'39367p01.dat',position:[0,0,0],rotation:I};
const check=(part,z,x=0,rotation=I)=>{const bush={id:'bush',part,position:[x,0,z],rotation},model={parts:[wheel,bush]};return [solidOverlaps(model,C,wheel),solidOverlaps(model,C,bush)].flat();};
test('official wheel recess accepts both seated full and half bushes on either side',()=>{
 for(const side of [-1,1])for(const [part,z]of [['3713.dat',20],['4265c.dat',15]])assert.deepEqual(check(part,side*z),[]);
});
test('wheel recess still rejects bushes penetrating hub, tyre or noncoaxial seats',()=>{
 for(const side of [-1,1])assert.ok(check('4265c.dat',side*12).length);
 assert.ok(check('3713.dat',20,60).length);
 assert.ok(check('4265c.dat',15,0,[0,0,1,0,1,0,-1,0,0]).length);
});
test('recess bounds are independently supported by every official wheel triangle',async()=>{
 const {flattenPart}=await import('../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js');
 const root=new URL('../overlay/scratch-gui/static/ldraw/',import.meta.url),read=p=>{try{return readFileSync(new URL(p.toLowerCase(),root),'latin1');}catch{return undefined;}};
 const polys=flattenPart('39367p01.dat',read).polys;assert.ok(polys.length>100);
 const clip=(poly,sign)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*a[2]-10.000001,db=sign*b[2]-10.000001;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,k)=>v+t*(b[k]-v)));}}return out;};
 const distance=poly=>{let lo=Infinity,positive=false,negative=false;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],cross=dx*(-a[1])-dy*(-a[0]);positive||=cross>1e-9;negative||=cross< -1e-9;const t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));lo=Math.min(lo,Math.hypot(a[0]+t*dx,a[1]+t*dy));}return positive&&negative?lo:0;};
 for(const sign of [-1,1]){let min=Infinity,count=0;for(const poly of polys){const p=clip(poly,sign);if(p.length>=3){min=Math.min(min,distance(p));count++;}}assert.ok(count>10);assert.ok(min>53,'entire outside-hub mesh stays beyond 53 LDU: '+min);}
});
