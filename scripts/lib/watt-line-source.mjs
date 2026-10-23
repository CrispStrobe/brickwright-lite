// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
/** Clear the moving coupler/pin from the real rail top; keep all planar pivot spans. */
export function adaptWattLine(source){
 assert.equal(createHash('sha256').update(source).digest('hex'), '42ac6e7819b0cfb103c5a94690f04b9a2b24bca904c4e09144918c46b19476df');
 const moved={coupler:-100,output_arm:-120,pivot_C:-110,pivot_D:-110,pivot_B:-80};
 let id;
 const lines=source.split('\n').map(line=>{
  if(line.startsWith('0 !BW ID '))id=line.slice(9);
  if(line.startsWith('1 ')&&Object.hasOwn(moved,id)){
   const fields=line.split(/\s+/);fields[3]=String(moved[id]);
   if(id==='pivot_B')fields[14]='32556a.dat';
   return fields.join(' ');
  }
  return line;
 });
 const text=lines.join('\n')
  .replace('1 25 100 -60 -60 0 0 1 0 1 0 -1 0 0 32524.dat','1 25 100 -60 -50 1 0 0 0 0 1 0 -1 0 3702.dat')
  .replace('1 25 100 -60 60 0 0 1 0 1 0 -1 0 0 32524.dat','1 25 100 -60 50 1 0 0 0 0 -1 0 1 0 3702.dat');
 return text.replace('0 STEP\n0 Assembly stage 5',
  '0 !BW ID output_pier_clearance_top\n1 71 200 -100 80 1 0 0 0 1 0 0 0 1 32316.dat\n'+
  '0 !BW ID output_pier_clearance_pin_40\n1 0 200 -90 40 0 1 0 1 0 0 0 0 -1 2780.dat\n'+
  '0 !BW ID output_pier_clearance_pin_120\n1 0 200 -90 120 0 1 0 1 0 0 0 0 -1 2780.dat\n'+
  '0 STEP\n0 Assembly stage 5');
}
