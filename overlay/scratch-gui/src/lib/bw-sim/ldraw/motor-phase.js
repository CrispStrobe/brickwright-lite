// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {flattenPart,bounds,parseLDraw,apply,SEARCH_DIRS,refKey} from './ldraw-geometry.js';
import {partMotorJoint} from '../contracts.js';
import {phasePoint,phaseVector} from '../model/motor-phase.js';
export const driveHubRef=(name,read,meta)=>{
 const centres=(partMotorJoint(meta)?.movingColliders||[]).map(i=>meta.colliders[i]?.position).filter(Boolean);if(!centres.length)return -1;
 let text;for(const dir of SEARCH_DIRS){text=read(dir+refKey(name));if(text!==undefined)break;}if(text===undefined)return -1;
 let best=-1,volume=Infinity;parseLDraw(text).refs.forEach((r,i)=>{const polys=flattenPart(r.file,read).polys.map(p=>p.map(v=>apply(r.x,v)));if(!polys.length)return;
  const b=bounds(polys),v=b.max.reduce((n,x,k)=>n*(x-b.min[k]),1);if(v<volume&&centres.every(c=>c.every((x,k)=>x>=b.min[k]-1e-6&&x<=b.max[k]+1e-6))){best=i;volume=v;}});return best;
};
export const phasedMotorSource=(name,read,meta,degrees)=>{
 let source;for(const dir of SEARCH_DIRS){source=read(dir+refKey(name));if(source!==undefined)break;}
 const j=partMotorJoint(meta),ref=driveHubRef(name,read,meta);if(!degrees||!j||ref<0)return source;
 let n=0;return source.split(/\r?\n/).map(line=>{
  if(!/^1\s/.test(line)||n++!==ref)return line;const w=line.trim().split(/\s+/),t=w.slice(2,5).map(Number),m=w.slice(5,14).map(Number);
  const p=phasePoint(t,j,degrees),columns=[0,1,2].map(k=>phaseVector([m[k],m[k+3],m[k+6]],j.axis,degrees));
  const matrix=[0,1,2].flatMap(row=>columns.map(c=>c[row]));const fmt=x=>String(Math.round(x*1e9)/1e9);
  return ['1',w[1],...p.map(fmt),...matrix.map(fmt),...w.slice(14)].join(' ');
 }).join('\n');
};
export const phasedMotorRead=(name,read,meta,degrees=0)=>{
 if(!degrees)return read;const source=phasedMotorSource(name,read,meta,degrees),key=refKey(name);return path=>(refKey(path)===key||refKey(path)==='parts/'+key)?source:read(path);
};
