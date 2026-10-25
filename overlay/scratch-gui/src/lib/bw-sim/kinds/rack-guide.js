// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// A rack retained by its dedicated beam housing translates along the rail and
// cannot rotate. Unlike an axle bore, its rectangular section blocks twist.
import {shaftEngagement} from './pin-axle.js';
import {placedTooth} from './tooth-parts.js';
const lengthCheck=c=>Number.isFinite(c.length)&&c.length>0?[]:['a rack guide needs its engagement length (LDU)'];
export const RACK_GUIDE={kind:'rack-guide',validate:lengthCheck,
    pairs:[{with:'rack-slide',edge:()=> 'slider',match:(guide,rack)=>shaftEngagement(rack,guide)!==null}]};
export const RACK_SLIDE={kind:'rack-slide',validate:lengthCheck};
export const RACK_NEST={id:'rack-guide',kind:'rack-guide',detect:()=>({}),
    placedMesh(a,ma,b,mb){
        return [[a,ma,b,mb],[b,mb,a,ma]].some(([p,mp,q,mq])=>placedTooth(p,mp,'rack-guide').some(g=>placedTooth(q,mq,'rack-slide').some(r=>shaftEngagement(r.c,g.c)!==null)));
    }};
