// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EXPERIMENTAL_MODELS,EXPERIMENTAL_MODEL_DETAILS} from '../overlay/scratch-gui/src/lib/bw-sim/model/experimental-models.js';
import {loadModelLesson} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
import {repeatedToothPitch,compareRackAdvance} from '../scripts/lib/spiral-tooth-pitch.mjs';
const source=path=>readFileSync(new URL('../overlay/scratch-gui/'+path,import.meta.url),'utf8');
const model=source('static/sim-lab/models/spiral-scribe.ldr');
const selected=id=>new RegExp('^0 !BW ID '+id+'\\r?\\n([^\\r\\n]+)$','m').exec(model)[1].trim().split(/\s+/).at(-1);
const rackPart=selected('radial_rack'),pinionPart=selected('feed_pinion');
const catalog=JSON.parse(source('src/lib/bw-sim/part-meta/parts.json')).parts;
const teeth=catalog.find(p=>p.part===pinionPart).gear.teeth;
const groups=repeatedToothPitch(source('static/ldraw/parts/'+rackPart),'toothr.dat');
assert.ok(groups.length);assert.ok(groups.every(g=>g.pitchLdu===groups[0].pitchLdu));
const comparison=compareRackAdvance(groups[0].pitchLdu,teeth,1,0.4);
const entry=EXPERIMENTAL_MODELS.find(e=>e.file==='spiral-scribe.ldr');
const details=EXPERIMENTAL_MODEL_DETAILS['spiral-scribe.ldr'];
const number=(v,lang)=>v.toFixed(1).replace('.',lang==='de'?',':'.');

test('warning numbers follow the selected stock rack source and feed pinion',()=>{
 assert.equal(rackPart,'18942.dat');assert.equal(teeth,12);
 assert.equal(comparison.rackAdvanceMm.toFixed(1),'38.4');
 assert.ok(Math.abs(comparison.pitchCircleMm-12*Math.PI)<1e-10);
 assert.ok(comparison.differenceMm>0.7);
 for(const lang of ['en','de']) {
  assert.equal(entry.intro[lang],details.description[lang]);
  for(const text of [entry.intro[lang],details.description[lang]]) {
   assert.ok(text.includes(rackPart.replace('.dat','')));assert.ok(text.includes(String(teeth)));
   assert.ok(text.includes(number(comparison.rackAdvanceMm,lang)));
   assert.ok(text.includes(number(comparison.pitchCircleMm,lang)));
   assert.match(text,lang==='en'?/simulator.*drawn/s:/Simulator.*gezeichnete/s);
   assert.match(text,lang==='en'?/neither.*measurement/s:/keiner.*gemessen/s);
  }
 }
 assert.equal(entry.experimental,true);assert.equal(details.experimental,true);
});

for(const lang of ['en','de'])test(`${lang} lesson shows geometry versus simulator predictions without a physical failure claim`,async()=>{
 const lesson=await loadModelLesson(entry,lang,{fetcher:async path=>{
  assert.equal(path,`static/sim-lab/lessons/spiral-scribe.${lang}.json`);
  return {ok:true,json:async()=>JSON.parse(source(path))};
 }});
 assert.match(lesson.formula,lang==='en'?/^Ideal simulator model:/:/^Ideales Simulatormodell:/);
 for(const text of [lesson.formula,lesson.matters,lesson.answer]) {
  assert.ok(text.includes(number(comparison.rackAdvanceMm,lang)));
  assert.ok(text.includes(number(comparison.pitchCircleMm,lang)));
 }
 assert.ok(lesson.matters.includes(number(groups[0].pitchLdu*0.4,lang)));
 assert.match(lesson.matters,lang==='en'?/not a measurement/:/keine Messung/);
 assert.doesNotMatch(lesson.matters,/a real tooth mesh would not match|Ein echter Zahneingriff würde/);
 assert.doesNotMatch(lesson.why,/within 0\.001|auf 0,001/,'old baseline precision is not a current stock-model claim');
});

test('pitch audit selects actual model rack/pinion while preserving the four-rack benchmark',()=>{
 const script=new URL('../scripts/audit-spiral-tooth-pitch.mjs',import.meta.url);
 const run=spawnSync(process.execPath,[fileURLToPath(script)],{encoding:'utf8',timeout:8000});
 assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);
 assert.equal(report.active.rack,rackPart);assert.equal(report.active.pinion,pinionPart);
 assert.equal(report.active.teeth,teeth);assert.equal(report.active.rackAdvanceMm,comparison.rackAdvanceMm);
 assert.equal(report.parts.length,4);assert.equal(report.comparisons.length,4);
 const replacePart=(text,id,part)=>text.replace(new RegExp('(^0 !BW ID '+id+'\\r?\\n)([^\\r\\n]+)$','m'),(_,tag,row)=>{
  const fields=row.trim().split(/\s+/);fields[14]=part;return tag+fields.join(' ');
 });
 const changed=replacePart(replacePart(model,'radial_rack','32132.dat'),'feed_pinion','3648.dat');
 const intercept=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const model=fs.readFileSync(0,'utf8'),read=fs.readFileSync;
 fs.readFileSync=(path,...args)=>String(path).endsWith('/models/spiral-scribe.ldr')?model:read(path,...args);
 syncBuiltinESMExports();await import(process.argv[1]);`;
 const variant=spawnSync(process.execPath,['--input-type=module','-e',intercept,script.href],{encoding:'utf8',timeout:8000,input:changed});
 assert.equal(variant.status,0,variant.stderr);const actual=JSON.parse(variant.stdout);
 assert.equal(actual.active.rack,'32132.dat');assert.equal(actual.active.pinion,'3648.dat');
 assert.equal(actual.active.teeth,24);assert.ok(Math.abs(actual.active.rackAdvanceMm-76.8)<1e-10);
 assert.ok(Math.abs(actual.active.pitchCircleMm-24*Math.PI)<1e-10);
 const invalid=spawnSync(process.execPath,['--input-type=module','-e',intercept,script.href],
  {encoding:'utf8',timeout:8000,input:replacePart(model,'feed_pinion','missing-pinion.dat')});
 assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/missing selected pinion tooth count/);
});
