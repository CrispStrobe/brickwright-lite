import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {source} from './fixtures/arcade/sdk-image-literal-callables.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const sourceFiles={'main.ts':source,'pxt.json':JSON.stringify({name:'arcade-image-literal-proof',dependencies:{device:'*'},files:['main.ts']})};
const exportFiles=JSON.parse(fs.readFileSync(new URL('./fixtures/arcade/sdk-image-literal-current-export.json',import.meta.url),'utf8'));
const base={imageLiteralCalls:3,imageLiteralChanged:7,imageLiteralOriginal:1,imageLiteralLater:1,imageLiteralOutside:0,imageLiteralAliasSame:true,imageLiteralFresh:true,imageLiteralLaterFresh:true,imageLiteralScore:19};
const retain=(name,value)=>{const dir=process.env.SDK_IMAGE_LITERAL_ORIGINAL_RECEIPT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');};
const original=async(name,files,expected)=>{
 const result=await runPxtArcade(files,{fakeClock:true,waitForMain:true,waitForGlobals:expected,onCompilation:metadata=>{assert.deepEqual(metadata.files,files);assert.equal(metadata.built.success,true);assert.deepEqual(metadata.built.diagnostics,[]);retain(name+'-compilation',metadata);}});
 retain(name+'-observations',result);for(const [key,value]of Object.entries(expected))assert.equal(result[key],value,key);
};
test('selected original literal Image factories allocate freshly without alias mutation leaking into the template',async()=>{
 await original('source',sourceFiles,base);
});
test('selected original preserves the exact current renamed and pixel-edited Image literal export',async()=>{
 await original('export',exportFiles,{...base,imageLiteralOriginal:3,imageLiteralLater:3,imageLiteralScore:23});
});
