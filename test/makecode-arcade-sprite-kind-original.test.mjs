import test from 'node:test';
import assert from 'node:assert/strict';
import {kindPrograms} from './fixtures/arcade-sprite-kind-programs.mjs';
import {TEXT_SPRITE_SOURCE_TEXT} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
for(const [name,source] of Object.entries(kindPrograms))test('unchanged original SpriteKind source program: '+name,async()=>{
 const text=name==='text';const files={'main.ts':source,...(text?{'text.ts':TEXT_SPRITE_SOURCE_TEXT}:{}),'pxt.json':JSON.stringify({dependencies:{device:'*'},files:[...(text?['text.ts']:[]),'main.ts']})};
 const observed=await runPxtArcade(files,{fakeClock:true});assert.equal(observed.done,1);
 if(name==='order')for(const [key,value] of Object.entries({player:1000,projectile:1,food:1001,enemy:1002,beforeKind:-1,between:1004,later:1005,alias:1005,afterKind:1005,calls:1,dynamicKind:1006}))assert.equal(observed[key],value,key);
 if(name==='numeric')for(const [key,value] of Object.entries({hits:1,negativeKind:-2.5,negativeCount:0,positiveKind:42.5,positiveCount:1,unchangedKind:42.5,omittedKind:-1,nullKind:-1}))assert.equal(observed[key],value,key);
 if(text)for(const [key,value] of Object.entries({textKind:1003,customKind:1004,observed:1003,next:1005}))assert.equal(observed[key],value,key);
});
