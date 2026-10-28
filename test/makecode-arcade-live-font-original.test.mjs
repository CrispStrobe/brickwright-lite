import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const source=readFileSync(new URL('./fixtures/arcade/live-font-identity-resource.ts',import.meta.url),'utf8');
test('selected original live Font identity, metrics, glyph resources, mutation and complete image observations',async()=>{
    const result=await runPxtArcade(source,{inspectImageGlobals:['fontPicture','fontMutatedPicture','fontMissingPicture']});
    for(const name of ['fontIdentity','fontSelectionASCII','fontSelectionWide','fontScaleSame','fontScaleNew','fontScaledDataSame','fontDataReplacementSame','fontOldScaledDataSame'])assert.equal(result[name],true,name);
    assert.equal(result.fontScaledWidth,12);assert.equal(result.fontScaledHeight,16);assert.equal(result.fontScaledMultiplier,2);
    assert.equal(result.fontMutationVisible,9);assert.equal(result.fontScaledMetricSnapshot,12);
    assert.equal(result.fontGlyphRestore,result.fontGlyphBefore);
    for(const name of ['font5','font8','font12'])assert.equal(result[name+'Hex'].length,result[name+'Length']*2);
    for(const image of Object.values(result.$images)){assert.equal(image.width,32);assert.equal(image.height,24);assert.equal(image.pixels.length,768);}
});
