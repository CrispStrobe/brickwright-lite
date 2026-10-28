import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifiedCallableCodecSource,CALLABLE_CODEC_PIN} from './helpers/callable-codec-source.mjs';
const source=qualifiedCallableCodecSource();
const wrapper=`const makeExt = require('../adapter');\nmodule.exports = makeExt(${JSON.stringify(source)});\n`;
const fixture=(pin=CALLABLE_CODEC_PIN,body=wrapper)=>({explicitSource:null,root:'/test',read:file=>file.endsWith('vendor-pins.json')?JSON.stringify({'arrays-values':pin}):body});
test('selected immutable bundled supplier supports the hosted codec factory control without an environment override',()=>{
    assert.equal(qualifiedCallableCodecSource(fixture()),source);
});
test('wrong pin, changed bytes, executable wrapper and unqualified explicit source fail closed',()=>{
    assert.throws(()=>qualifiedCallableCodecSource(fixture('foreign')),/qualified supplier pin/);
    assert.throws(()=>qualifiedCallableCodecSource(fixture(CALLABLE_CODEC_PIN,wrapper.replace('Arrays & Vectors','Changed'))),/qualified supplier bytes/);
    assert.throws(()=>qualifiedCallableCodecSource(fixture(CALLABLE_CODEC_PIN,"module.exports = makeExt(loadSource());")),/literal canonical/);
    assert.throws(()=>qualifiedCallableCodecSource({explicitSource:'/foreign',read:()=>source+'\n'}),/qualified supplier bytes/);
});
