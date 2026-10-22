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
 // End seats retain the full demonstrated 24–40 mm input range.
 let id=null;
 const candidate=text.split('\n').map(line=>{
  const match=/^0 !BW ID (.+)$/.exec(line);if(match)id=match[1];
  if(line.startsWith('1 ')){
   const fields=line.split(/\s+/);let dx=0;
   if(/^foundation_/.test(id))dx=10;
   if(/^b_rail_/.test(id)){fields[14]='3737.dat';dx=20;}
   if(/^b_spine_/.test(id)){fields[14]='32525.dat';dx=20;}
   if(/^b_(?:seat|seat_pin|outer_bush)_-120_/.test(id))dx=60;
   if(/^b_(?:seat|seat_pin|outer_bush)_120_/.test(id))dx=-20;
   if(/^b_(?:end_node|end_pin|end_cross|column|column_node|column_pin)_-120(?:_|$)/.test(id))dx=80;
   if(/^b_(?:end_node|end_pin|end_cross|column|column_node|column_pin)_120(?:_|$)/.test(id))dx=-60;
   if(dx){fields[2]=String(Number(fields[2])+dx);line=fields.join(' ');}
  }
  return line;
 }).join('\n').replace('0 Author: OpenAI','0 Author: CrispStrobe\n0 !LICENSE BSD-3-Clause');
 // Re-seat the far crossbar on an unused spine bore. Omit the redundant
 // near columns and overlapping inner collars. Each remaining sole receives
 // a 1x1 Technic brick, avoiding the wide studded feet's intersections with
 // neighbouring girders. Shift only the foundation by half a stud to engage
 // the central studs; the mechanism's mathematical datum remains unchanged.
 const output=[],feet=new Set();let skip=false;
 for(const line of candidate.split('\n')){
  const match=/^0 !BW ID (.+)$/.exec(line);
  if(match){id=match[1];skip=/_foot_brick_/.test(id)||/^b_stop_(near|far)_/.test(id)||/^b_column(?:_node)?_-120(?:_|$)/.test(id);}
  if(skip&&(/^(?:0 !BW ID |1 )/.test(line)))continue;
  output.push(line);
  if(line.startsWith('1 ')&&/_sole_node_/.test(id)){
   const fields=line.split(/\s+/),x=Number(fields[2]),z=Number(fields[4])+20*Number(fields[11]);
   const key=x+','+z;if(feet.has(key))continue;feet.add(key);
   output.push('0 !BW ID foot_'+x+'_'+z,'1 71 '+x+' 380 '+z+' 1 0 0 0 1 0 0 0 1 6541.dat');
  }
 }
 return output.join('\n');
}
export function adaptRootBridgeProgram(text){
 check(text,'79bb788101c85546fa6ebf538a6e7e6ec835e917d20676ac73ee12c791e76cae');
 // Preserve the source's real SPIKE default-stop policy. The finite Lab moves
 // intentionally share that same physical hub. The gallery owns reset; keep
 // the original target table, feedback, guards, speed and final pause.
 return text.replace('  lab reset\n','');
}
