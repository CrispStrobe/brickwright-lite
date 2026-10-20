import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

export const circleSource=fs.readFileSync(new URL('./fixtures/arcade/image-circle-pixels.ts',import.meta.url),'utf8');
export const circleOracle=JSON.parse(fs.readFileSync(new URL('./fixtures/arcade/image-circle-pixels.json',import.meta.url),'utf8'));
const evidence=(name,value)=>{
    if(!process.env.ARCADE_CIRCLE_EVIDENCE)return;
    fs.mkdirSync(process.env.ARCADE_CIRCLE_EVIDENCE,{recursive:true});
    fs.writeFileSync(path.join(process.env.ARCADE_CIRCLE_EVIDENCE,name),JSON.stringify(value,(_key,v)=>v===undefined?{evidenceUndefined:true}:v,2));
};

test('selected original circle operations preserve complete clipped pixels, coercions, colors and image aliases',async()=>{
    const names=[...circleOracle.cases.map(value=>value.name),...Object.keys(circleOracle.aliases)];
    assert.equal(new Set(names).size,names.length);
    const observed=await runPxtArcade(circleSource,{fakeClock:true,waitForGlobals:{circleReady:1},
        inspectImageGlobals:names,onCompilation:packet=>evidence('compilation.json',packet)});
    evidence('observations.json',observed);
    assert.equal(observed.circleReady,1);
    assert.equal(observed.circleAliasSame,true);
    assert.equal(observed.circleCloneDifferent,true);
    for(const value of circleOracle.cases){
        assert.equal(value.pixels.length,value.width*value.height,value.name+' complete oracle');
        assert.deepEqual(observed.$images[value.name],{width:value.width,height:value.height,pixels:value.pixels},
            value.name+': '+value.method+' '+value.label);
    }
    for(const [name,image]of Object.entries(circleOracle.aliases))assert.deepEqual(observed.$images[name],image,name);
});
