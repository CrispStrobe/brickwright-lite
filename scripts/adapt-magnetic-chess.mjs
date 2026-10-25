#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {join} from 'node:path';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {OWNED_PART_FILES} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/owned-parts.js';
const [directory,output]=process.argv.slice(2);if(!directory||!output)throw Error('Usage: adapt-magnetic-chess.mjs reviewed-source-directory output-directory');
const HASHES={
  "magnetic-chess.mpd": "383a070d622488032236a9bc6e8fc6a44f686b9cba17a1ab87c5f45c4b23de4c",
  "chess_knight_nominal.bw": "252c493b7e894281d360478fdcdb6c2d631e3e2bc0201900c863a56389ddedfb",
  "chess_demo_nominal.bw": "3cc65497cd244888f4c41e7431f09f7c4b8cfd650fa27539989d03ba40dcd325",
  "extension-contract.json": "b59b8a91fefbedb1b30f6e8836ccb0a6c0e63097e9044fbc3dd80da5c4e7b329"
};
const source=name=>{const bytes=readFileSync(join(directory,name));if(createHash('sha256').update(bytes).digest('hex')!==HASHES[name])throw Error('Source differs: '+name);return bytes.toString();};
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
let text=source('magnetic-chess.mpd').replaceAll('chess_motor_a_pose.dat','54696p01.dat').replaceAll('chess_motor_c_pose.dat','54696p01.dat');
const parsed=parseModel(text,{catalog:C}),model=parsed.model;if(parsed.refusals.length!==9||parsed.refusals.some(r=>r.code!=='unknown-part')||model.decor?.length!==9||model.decor.some(d=>d.part!=='chess_custom_board_underside_print.dat'&&!/^board_registration_[xz]_-?1_-?1\.dat$/.test(d.part)))throw Error(JSON.stringify(parsed.refusals));
const removed=new Set(['A_frame_retainer_500_94.5','A_frame_retainer_520_94.5','A_frame_retainer_600_94.5','A_frame_retainer_620_94.5','B_vertical_mount_upper_-60','B_vertical_mount_upper_60']);
if(model.parts.filter(p=>removed.has(p.id)).length!==6)throw Error('Changed stator retainers');
model.parts=model.parts.filter(p=>!removed.has(p.id)&&!p.id.startsWith('board_registration_'));
for(const p of model.parts){if(p.id==='motorA')p.rotorAngle=11.25;if(p.id==='motorC')p.rotorAngle=180;if(/^[bw]_(?:pawn|knight|bishop|rook|queen|king)_/.test(p.id))p.load=true;if(p.id.startsWith('z_moving_rail_'))p.slides=Array.from({length:9},(_,i)=>'h'+i);}
for(const z of [500,600])model.parts.push({id:'A_stator_keyed_tie_'+z,part:'41677.dat',color:4,position:[94.5,284,z],rotation:[0,1,0,-1,0,0,0,0,1]});
model.parts.push({id:'B_stator_keyed_tie',part:'32251.dat',color:4,position:[290,120.5,-60],rotation:[1,0,0,0,1,0,0,0,1]});
if(model.decor.filter(d=>d.part==='chess_custom_board_underside_print.dat').length!==1)throw Error('Changed board printing');delete model.decor;delete model.steps;
model.files=Object.fromEntries(OWNED_PART_FILES.map(name=>[name,readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/parts/'+name,import.meta.url),'utf8')]));
model.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/magnetic-chess.txt'};
text=serializeModel(model,{name:'magnetic-chess.ldr',title:'Magnetic Chess — finite-force transporter'});
const p=prepareModel(text,C,{mat:'plain'});if(p.model.parts.length!==1208||p.issues.some(i=>i.code!=='locked-hinges')||p.mechanism.actuators.length!==3)throw Error(JSON.stringify(p.issues));
mkdirSync(output,{recursive:true});writeFileSync(join(output,'magnetic-chess.ldr'),text);
for(const [input,id]of [['chess_knight_nominal.bw','magnetic-chess'],['chess_demo_nominal.bw','magnetic-chess-capture']]){
 let program='# Magnetic Chess — CrispStrobe, BSD-3-Clause.\n# Reset first; native encoder feedback and finite, unmeasured magnetic attraction.\n# C raises the pickup; retracting it releases the independent piece.\nDEVICE SPIKE\nGLOBAL targetA = 0\nGLOBAL targetB = 0\nGLOBAL targetC = 0\n\nWHEN flag clicked:\n  lab start\n  lab stop motor A hold\n  lab stop motor B hold\n  lab stop motor C hold\n  wait 1 seconds\n';
 for(const line of source(input).split(/\r?\n/)){let m;
  if((m=/^\s*run motor ([ABC]) (counterclockwise|clockwise) ([\d.]+) degrees\s*$/.exec(line))){const [,port,d,n]=m;program+=`  set target${port} to target${port} ${d==='clockwise'?'+':'-'} ${n}\n  broadcast "chess ${port}" and wait\n`;}
  else if((m=/^\s*wait ([\d.]+) seconds\s*$/.exec(line)))program+=`  wait ${m[1]} seconds\n`;
  else if(!/^(?:\s*#.*|\s*|DEVICE SPIKE|WHEN flag clicked:|\s*set motor (?:stop action [ABC] hold|speed [ABC] 5))$/.test(line))throw Error('Unreviewed command '+line);
 }
 for(const port of ['A','B','C']){
  program+=`\nWHEN I receive "chess ${port}":\n`;
  if(port==='C')program+='  lab run motor C for (targetC - (lab motor C angle)) degrees at 90 degrees per second\n';
  else program+=`  IF targetC > 90 THEN:\n    lab run motor ${port} for (target${port} - (lab motor ${port} angle)) degrees at 90 degrees per second\n  ELSE:\n    lab run motor ${port} for (target${port} - (lab motor ${port} angle)) degrees at 240 degrees per second\n`;
  program+=`  lab stop motor ${port} hold\n  IF (abs of (target${port} - (lab motor ${port} angle))) > 2 THEN:\n    lab stop motor A hold\n    lab stop motor B hold\n    lab stop motor C hold\n    stop all\n`;
 }
 writeFileSync(join(output,id+'.bw'),program);
}
console.log('Magnetic Chess: 1203 LEGO placements + glass + four bonded gaskets; three native motors');
