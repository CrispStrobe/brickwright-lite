import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {source} from './fixtures/arcade/sdk-image-fill-callables.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const sourceFiles={'main.ts':source,'pxt.json':JSON.stringify({name:'arcade-image-fill-proof',dependencies:{device:'*'},files:['main.ts']})};
const exportFiles=JSON.parse(fs.readFileSync(new URL('./fixtures/arcade/sdk-image-fill-current-export.json',import.meta.url),'utf8'));
const retain=(name,value)=>{const dir=process.env.SDK_IMAGE_FILL_ORIGINAL_RECEIPT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');};
const original=async(name,files,color)=>{
 const expected={fillCalls:1,fillTop:2,fillLeft:color,fillBottom:color,fillRight:2};
 const result=await runPxtArcade(files,{fakeClock:true,waitForMain:true,waitForGlobals:expected,inspectImageGlobals:['fillImage'],onCompilation:metadata=>{assert.deepEqual(metadata.files,files);assert.equal(metadata.built.success,true);assert.deepEqual(metadata.built.diagnostics,[]);retain(name+'-compilation',metadata);}});
 retain(name+'-observations',result);for(const[key,value]of Object.entries(expected))assert.equal(result[key],value,key);
 assert.deepEqual(result.$images,{fillImage:{width:3,height:3,pixels:[2,2,2,color,color,2,color,color,2]}});
};
test('selected original Image fill and clipped rectangle preserve all pixels and once-only callback effects',async()=>{
 await original('source',sourceFiles,5);
});
test('selected original preserves the exact connected color-edited Image fill export',async()=>{
 await original('export',exportFiles,9);
});
