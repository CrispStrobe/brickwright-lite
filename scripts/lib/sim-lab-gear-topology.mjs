// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Compare identities exactly and computed ratios within binary arithmetic
// roundoff. This is not an angle, speed or mechanical-ratio allowance.
export function sameGearTopology(actual,expected){
 const signature=cs=>cs.map(c=>({kind:c.kind,parts:[...c.parts].sort(),ratio:c.ratio,carrier:!!c.carrier})).sort((a,b)=>a.parts.join('|').localeCompare(b.parts.join('|')));
 const a=signature(actual),b=signature(expected);
 return a.length===b.length&&a.every((x,i)=>{
  const y=b[i];
  return x.kind===y.kind&&x.carrier===y.carrier&&JSON.stringify(x.parts)===JSON.stringify(y.parts)&&
   Number.isFinite(x.ratio)&&Number.isFinite(y.ratio)&&Math.abs(x.ratio-y.ratio)<=8*Number.EPSILON*Math.max(1,Math.abs(x.ratio),Math.abs(y.ratio));
 });
}
