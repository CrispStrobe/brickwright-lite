#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {MODEL_LESSONS} from '../overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js';
import {lessonId} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
const root=new URL('../',import.meta.url);
const {profiles}=JSON.parse(readFileSync(new URL('docs/data/robot-lab-lessons.json',root)));
const keys=new Set(MODELS.map(m=>m.id||m.file));
const dir=new URL('overlay/scratch-gui/static/sim-lab/lessons/',root);
mkdirSync(dir,{recursive:true});
for(const m of MODELS){
 const id=lessonId(m),physical=m.file.replace(/\.ldr$/,'');
 const p=profiles[id]||profiles[physical];
 if(!p)throw Error(`No authored lesson for ${id}`);
 for(const language of ['en','de']){
  const src=p[language];
  const data={version:1,id,language,...src,what:src.what+' '+MODEL_LESSONS[m.id||m.file].description[language],formula:typeof p.formula==='object'?p.formula[language]:p.formula,
   related:p.related.filter(k=>keys.has(k)&&k!==(m.id||m.file))};
  const text=JSON.stringify(data,null,2)+'\n',file=new URL(`${id}.${language}.json`,dir);
  if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==text)throw Error(`Stale lesson ${id}/${language}`);}else writeFileSync(file,text);
 }
}
process.stdout.write(`${MODELS.length} examples × two complete offline lessons\n`);
