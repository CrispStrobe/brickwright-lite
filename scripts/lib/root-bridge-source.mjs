// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHash} from 'node:crypto';
const check=(text,hash)=>{if(createHash('sha256').update(text).digest('hex')!==hash)throw Error('Root Bridge source differs from the reviewed rebuild');};
export function adaptRootBridgeModel(text){
 check(text,'bc21aac0bbd899b85acc974af60059586ad63d978dcd4aa7416ef5646c008357');
 // Keep the two drive geometries and every moving-link record unchanged.
 // The supplied 16L right rails/spines cross the left input and output's
 // swept volume. Use 10L rails and 11L spines, seat them on the existing
 // 20-LDU grid and move the near crossbar/column onto the x=80 support row.
 // A 15-LDU near stop keeps the full demonstrated 24–40 mm input range.
 let id=null;
 return text.split('\n').map(line=>{
  const match=/^0 !BW ID (.+)$/.exec(line);if(match)id=match[1];
  if(line.startsWith('1 ')){
   const fields=line.split(/\s+/);let dx=0;
   if(/^b_rail_/.test(id)){fields[14]='3737.dat';dx=20;}
   if(/^b_spine_/.test(id)){fields[14]='32525.dat';dx=20;}
   if(/^b_(?:seat|seat_pin|outer_bush)_-120_/.test(id))dx=60;
   if(/^b_(?:seat|seat_pin|outer_bush)_120_/.test(id))dx=-20;
   if(/^b_stop_near_/.test(id))dx=30;
   if(/^b_(?:end_node|end_pin|end_cross|column|column_node|column_pin)_-120(?:_|$)/.test(id))dx=80;
   if(dx){fields[2]=String(Number(fields[2])+dx);line=fields.join(' ');}
  }
  return line;
 }).join('\n').replace('0 Author: OpenAI','0 Author: CrispStrobe\n0 !LICENSE BSD-3-Clause');
}
export function adaptRootBridgeProgram(text){
 check(text,'79bb788101c85546fa6ebf538a6e7e6ec835e917d20676ac73ee12c791e76cae');
 // Preserve the source's real SPIKE default-stop policy. The finite Lab moves
 // intentionally share that same physical hub. The gallery owns reset; keep
 // the original target table, feedback, guards, speed and final pause.
 return text.replace('  lab reset\n','');
}
