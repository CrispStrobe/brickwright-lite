// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Explicit adhesive against a substrate. Bare surfaces do not bond together.
// Rigid idealisation; no adhesive strength or payload rating is inferred.
import {vecDot,vecDist,COS_1_DEG} from '../mech/vec.js';
const validate=c=>Number.isFinite(c.data?.areaMm2)&&c.data.areaMm2>0?[]:['bond face needs a positive bonded areaMm2'];
export const BOND_FACE={kind:'bond-face',validate,pairs:[{with:'bond-surface',edge:()=> 'rigid',match:(a,b)=>vecDist(a.position,b.position)<=.5&&vecDot(a.axis,b.axis)<-COS_1_DEG}]};
export const BOND_SURFACE={kind:'bond-surface',validate};
