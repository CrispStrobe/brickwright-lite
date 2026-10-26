// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Compare a duration against its declared one-frame allowance. A fixed-period
// clock is a count of ticks; subtracting late floating timestamps can put an
// exact boundary just below itself. Recognize only an integer tick span within
// binary arithmetic roundoff. Non-grid observations keep the direct comparison.
export function withinSampledFrame(start,end,frameMs,requiredMs){
 if(![start,end,frameMs,requiredMs].every(Number.isFinite)||end<start||frameMs<=0)return false;
 const duration=end-start,ticks=Math.round(duration/frameMs);
 const roundoff=8*Number.EPSILON*(Math.abs(start)+Math.abs(end)+frameMs)*(ticks+1);
 if(Math.abs(duration-ticks*frameMs)<=roundoff)return ticks+1>=requiredMs/frameMs;
 return duration+frameMs>=requiredMs;
}
