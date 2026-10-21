// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Declared, unmeasured face-attraction approximation. No mating edge, latch or
// collision exclusion: independent objects move only through finite forces.
import {toothConnectors} from './tooth-parts.js';
import {lduToWorld,dirToWorld} from '../contracts.js';
export const DEFAULT_MAGNET_FIELD=Object.freeze({referenceForceN:.3,referenceGapM:.0028,softeningM:.002,rangeM:.014,taperStartM:.008,maxForceN:1});
export const validateMagnetField = field => {
 const p={...DEFAULT_MAGNET_FIELD,...field};
 return Object.values(p).every(v=>typeof v==='number'&&Number.isFinite(v))&&p.referenceForceN>=0&&p.maxForceN>=0&&p.referenceGapM>0&&p.softeningM>0&&p.rangeM>p.taperStartM&&p.taperStartM>p.referenceGapM?[]:['magnetic field needs finite nonnegative forces and 0 < referenceGap < taperStart < range, with positive softening'];
};
export const MAGNET_FACE={kind:'magnet-face',validate:c=>{
 const out=['emitter','target'].includes(c.data?.role)?[]:['magnet face data.role must be emitter or target'];
 return out.concat(validateMagnetField(c.data?.field));
}};
export const MAGNET={id:'magnetic-field',kind:'magneticField',bodies:()=>[],detect:({nodes,islands})=>{
 const faces=toothConnectors(nodes,islands,'magnet-face'),sources=faces.filter(f=>f.data.role==='emitter'),targets=faces.filter(f=>f.data.role==='target'),couplings=[];
 for(const a of sources)for(const b of targets)if(a.islandId!==b.islandId)couplings.push({body1:a.islandId,body2:b.islandId,point1:lduToWorld(a.c.position),point2:lduToWorld(b.c.position),normal1:dirToWorld(a.c.axis),normal2:dirToWorld(b.c.axis),field:{...DEFAULT_MAGNET_FIELD,...a.data.field},parts:[a.partId,b.partId]});
 return {couplings};
},validate:(c,m)=>{
 const errors=validateMagnetField(c.field);
 if(c.body1===c.body2||![c.body1,c.body2].every(id=>m.bodies.some(b=>b.id===id)))errors.push('magnetic field needs two distinct existing bodies');
 for(const key of ['point1','point2','normal1','normal2'])if(!Array.isArray(c[key])||c[key].length!==3||!c[key].every(Number.isFinite))errors.push(`${key} must be a finite 3-vector`);
 for(const key of ['normal1','normal2'])if(Array.isArray(c[key])&&Math.abs(Math.hypot(...c[key])-1)>1e-6)errors.push(`${key} must be a unit vector`);
 return errors;
}};
