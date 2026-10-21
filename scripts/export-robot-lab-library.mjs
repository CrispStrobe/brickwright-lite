#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Export the shipped library with single-root MPD alternatives and verify their
// placements against the flat LDraw originals before creating the archive.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {MODELS,catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {MODEL_LESSONS} from '../overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {phasedMotorRead, phasedMotorSource} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/motor-phase.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
const [directory,archive]=process.argv.slice(2);
if(!directory||!archive)throw Error('Usage: export-robot-lab-library.mjs output-directory output.zip');
const root=new URL('../',import.meta.url),base=new URL('overlay/scratch-gui/static/sim-lab/',root),JSZip=createRequire(new URL('../packages/scratch-gui/package.json',import.meta.url))('jszip');
const C=catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',root))));
const files=new Map(),manifest=[],zip=new JSZip(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const put=(path,bytes)=>files.set(path,Buffer.from(bytes));
const readPart=p=>{try{return readFileSync(new URL('overlay/scratch-gui/static/ldraw/'+p,root),'latin1');}catch{return undefined;}};
for(const file of new Set(MODELS.map(m=>m.file))){
 const original=readFileSync(new URL('models/'+file,base),'utf8'),parsedOriginal=parseModel(original,{catalog:C}),owned=Object.entries(parsedOriginal.model.files||{}),aliases=new Map(),angles=new Map();let phase=null;
 const rootText=/^0 FILE /m.test(original)?original.split(/\r?\n/).slice(original.split(/\r?\n/).findIndex(l=>/^0 FILE /.test(l))+1).join('\n').split(/^0 (?:NOFILE|FILE)\b/m)[0]:original;
 for(const [name,text]of owned)put('models/'+name,text);
 if(owned.length){put('models/LICENSE.txt',readFileSync(new URL('parts/LICENSE.txt',base)));put('models/material-parts-lock.json',readFileSync(new URL('parts/parts-lock.json',base)));}
 const ldr=rootText.split(/\r?\n/).map(line=>{
  const angle=/^0 !BW ROTOR (.+)$/.exec(line);if(angle){phase=Number(angle[1]);return line;}
  if(!/^1\s/.test(line))return line;
  if(phase===null||!phase){phase=null;return line;}
  const words=line.split(/\s+/),part=words.slice(14).join(' '),alias=`bw-rotor${String(phase).replace('-','m').replace('.','p')} - ${part}`;
  const source=phasedMotorSource(part,readPart,C.get(part),phase).replace(/^0 Name: .+$/m,'0 Name: '+alias)
   .replace('see CAreadme.txt','see ../licenses/CAreadme.txt')+'\n0 // Initial output pose adapted by CrispStrobe; original part authors and CC BY licence retained.\n';
  aliases.set(alias,source);angles.set(alias,{part,phase});put('models/'+alias,source);phase=null;return words.slice(0,14).join(' ')+' '+alias;
 }).join('\n');
 for(const [alias]of aliases){
  const {part,phase}=angles.get(alias),reader=path=>aliases.get(path.replace(/^parts\//,''))??readPart(path);
  const actual=flattenPart(alias,reader),expected=flattenPart(part,phasedMotorRead(part,readPart,C.get(part),phase));
  assert.deepEqual(actual.missing,[],alias+' resolves');assert.deepEqual(actual.polys,expected.polys,alias+' exported rotor geometry');
 }
 // A flat export resolves authored material geometry through its sidecars;
 // an MPD resolves the same files inline. Check the complete child print too.
 const ownedMap=new Map(owned),ownedRead=path=>ownedMap.get(path.replace(/^(?:parts\/|p\/)/,''))??readPart(path);
 const sidecarRead=path=>files.get('models/'+path.replace(/^(?:parts\/|p\/)/,''))?.toString('utf8')??readPart(path);
 for(const [name]of owned){const expected=flattenPart(name,ownedRead),actual=flattenPart(name,sidecarRead);assert.deepEqual(expected.missing,[],name);assert.deepEqual(actual.missing,[],name);assert.deepEqual(actual.polys,expected.polys,name+' exported material geometry');assert.deepEqual(actual.polyColours,expected.polyColours,name+' exported print colours');}
 const mpd=`0 FILE ${file}\n${ldr}\n`+[...owned,...aliases].map(([name,source])=>`0 FILE ${name}\n${source}\n`).join('')+'0 NOFILE\n';
 const a=parseModel(original,{catalog:C}),flat=parseModel(ldr,{catalog:C}),b=parseModel(mpd,{catalog:C});
 assert.deepEqual(a.refusals,[],file);assert.deepEqual(flat.refusals,[],file);assert.deepEqual(b.refusals,[],file);
 assert.deepEqual(flat.model.parts,a.model.parts,file+' flat placements/ports/payloads/rotor angles');assert.deepEqual(b.model.parts,a.model.parts,file+' MPD placements/ports/payloads/rotor angles');
 assert.deepEqual(flat.model.belts,a.model.belts,file+' flat physical bands');assert.deepEqual(b.model.belts,a.model.belts,file+' MPD physical bands');
 put('models/'+file,ldr);put('models/'+file.replace(/\.ldr$/,'.mpd'),mpd);
 manifest.push({file,pieces:a.model.parts.length+(a.model.belts||[]).length,...(a.model.belts?.length?{rigidPlacements:a.model.parts.length,flexibleBands:a.model.belts.length}:{}),sourceSha256:hash(original),ldrSha256:hash(ldr),mpdSha256:hash(mpd)});
}
for(const name of ['CAreadme.txt','CAlicense.txt','CAlicense4.txt'])put('licenses/'+name,readFileSync(new URL('overlay/scratch-gui/static/ldraw/'+name,root)));
for(const program of new Set(MODELS.map(m=>m.example).filter(Boolean)))put('programs/'+program,readFileSync(new URL('programs/'+program,base)));
for(const optional of ['axis-plotter-curves.bw','axis-plotter-pixel-costume.bw','orbit-mixer-steps.bw','phase-bridge-steps.bw','magnetic-chess-capture.bw'].filter(n=>!n.startsWith('magnetic-chess')||MODELS.some(m=>m.file==='magnetic-chess.ldr')))put('programs/'+optional,readFileSync(new URL('programs/'+optional,base)));
for(const folder of ['lessons','licenses'])for(const name of readdirSync(new URL(folder+'/',base)).sort())put(folder+'/'+name,readFileSync(new URL(folder+'/'+name,base)));
const catalog=MODELS.map(m=>({...m,...MODEL_LESSONS[m.id||m.file]}));
put('catalog.json',JSON.stringify(catalog,null,2)+'\n');put('manifest.json',JSON.stringify({examples:MODELS.length,assemblies:manifest.length,models:manifest},null,2)+'\n');
put('LICENSE-BSD-3-Clause.txt',readFileSync(new URL('LICENSE',root)));
put('README.txt',`Brickwright Robot Lab — fixed model library\n\n${MODELS.length} example choices; ${manifest.length} distinct assemblies. Each assembly has a flat\nLDraw .ldr and equivalent single-root .mpd; programs and EN/DE lessons are included.\nOpen either model format in Brickwright or an editor with the standard LDraw library.\nThe app loads example programs into blocks automatically; press Run to start.\n\nOriginal models are BSD-3-Clause. Owner-supplied designs are credited to\nCrispStrobe; individual notices are in licenses/. Referenced LDraw part files\nretain their own authors and licences and are resolved by the viewer library.\nThe included motor pose .dat files retain LDraw’s CC BY attribution; see\nlicenses/CAreadme.txt and CAlicense4.txt. The MPDs embed these rotor poses. Authored BSD material DAT sidecars and\ntheir licence are also included; the Chess MPD embeds its material geometry.\n\nAtlas Arm: 237 pieces, motors A/B/D; reset before the bounded program.\nSwitchback Lift: 341 pieces including one free ball, motors A/B/D.\nStraight Eight: 113 pieces, motor A; keep the crank within ±60°.\nMean Machine: 212 pieces, motors A/B; four signed-mean experiments.\nStepworks: 240 pieces including a free pallet, motor A; reset after three transfers.\nStride Lab: 75 pieces, motor A; approximate straight working stroke.\nTwinpoint: 117 pieces, motors A/B; coordinated circle and bounded line.\nButterfly: 224 pieces, motor A; one guided flap.\nTempo Loop: 85 pieces, motor A; changing instantaneous speed ratio.\nTilt Lab: 161 pieces including a free ball, motors A/B; use ±6° A / ±10° B.\nAxis Plotter: 256 pieces, motors A/B/C; reset before each drawing.\nPhase Bridge: 144 explicit placements (146 with two inferred crosses), one motor.\nOrbit Mixer: 161 pieces, motors A/B; planetary orientation control.\nMagnetic Chess: 1,208 physical pieces (1,203 LEGO, glass, four bonded gaskets), A/B/C.\nSarrus Lift: 144 pieces, motor A; keep the linkage between 20 and 70 degrees.\nQuickstroke: 111 pieces, motor A; three continuous turns each way.\nEllipse Engine: 169 pieces, motor A; orthogonal trammel, two 112 x 48 mm marker ellipses.\nScale Echo: 148 pieces, motors A/B; two-to-one pantograph, reset before bounded moves.\nTurnwise: 127 pieces, motor A; unequal-angle steering bench, asymmetric bounded targets.\n\nQualification is simulation-based, not a physical LEGO building test.\n`);
for(const [path,bytes]of files){const target=resolve(directory,path);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,bytes);zip.file('brickwright-fixed-models/'+path,bytes);}
mkdirSync(resolve(archive,'..'),{recursive:true});writeFileSync(archive,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
process.stdout.write(`${manifest.length} verified LDR/MPD pairs, ${MODELS.length} examples, ${files.size} files\n`);
