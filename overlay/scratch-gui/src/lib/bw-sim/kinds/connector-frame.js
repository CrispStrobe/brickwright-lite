// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// A clipped stud primitive starts inside the roof. Its clutch plane is offset
// along the stud axis; keep the measured primitive origin in metadata.
import {mat3MulVec3,vecNormalize} from '../mech/vec.js';
export const connectorSeatPosition = c => c.position.map((v,k)=>v+c.axis[k]*(c.data?.seatOffsetLdu||0));
export const connectorNormal = (c,rotation) => c.data?.normal ? vecNormalize(mat3MulVec3(rotation,c.data.normal)) : null;

export const connectorSeatLength = c => c.length === undefined ? undefined : c.length - (c.data?.seatOffsetLdu||0);
