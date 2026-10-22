// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Bounded physical clearance revisions; exact raw sources remain in test fixtures.
export function reviseCounterturnSnapgate(id,text){
 if(!['counterturn','snapgate'].includes(id))return text;
 const lines=text.split(/\r?\n/),edit=(part,fn)=>{const i=lines.indexOf('0 !BW ID '+part);if(i<0||lines.lastIndexOf('0 !BW ID '+part)!==i)throw Error('Expected unique part '+part);const row=lines[i+1].split(' ');if(row[0]!=='1')throw Error('Expected placement '+part);fn(row);lines[i+1]=row.join(' ');};
 if(id==='counterturn'){
  edit('input_outer',r=>{if(r[2]!=='78')throw Error('Input retainer changed');r[2]='80';});
  edit('bevel_bottom',r=>{if(r[3]!=='22')throw Error('Vertical retainer changed');r[3]='24';});
  lines.push('0 // Adaptation: both gear retainers moved outward by 2 LDU (0.8 mm).');
 }else{
  for(const part of ['spring_cylinder','spring_rod'])edit(part,r=>{if(r[3]!=='-140')throw Error('Shock plane changed');r[3]='-142.5';});
  edit('anchor_retainer_155',r=>{if(r[3]!=='-155')throw Error('Anchor retainer changed');r[3]='-160';});
  edit('anchor_axle',r=>{if(r[14]!=='3737.dat')throw Error('Anchor axle changed');r[14]='3708.dat';});
  edit('worm_wheel_bearing_pin_-160_40',r=>{if(r[3]!=='-40')throw Error('Bearing pin changed');r[3]='-50';});
  let x,z;edit('rod_eye_pin',r=>{if(r[14]!=='3673.dat'||r[3]!=='-130')throw Error('Rod eye pin changed');r[14]='32073.dat';r[3]='-123.75';x=r[2];z=r[4];});
  for(const[tag,y]of[['outer',-162.5],['inner',-85]])lines.push('0 !BW ID rod_eye_retainer_'+tag,`1 72 ${x} ${y} ${z} 0.292371704723 -0.956304755963 0 0 0 -1 0.956304755963 0.292371704723 0 32123b.dat`);
  lines.push('0 // Adaptation: shock eyes moved axially 1 mm; anchor retainer moved 2 mm on a 12L axle.', '0 // Bearing pin seated at the beam face; rod eye uses a retained 5L axle and two half bushes.');
 }
 return lines.join('\n');
}
