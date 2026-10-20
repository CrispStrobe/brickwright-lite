import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseCallableBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-bindings.js';
import {createSdkImageSourceTypes} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-image-source-types.js';
import {instantiateCallableSignature} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-signatures.js';
import {parseCallableType} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-type-syntax.js';
const sdk=()=>({kind:'sdk',name:'Image'}),named=name=>({kind:'named',name});
test('SDK Image type resolution is opt-in and retains actual nominal and method generic shadows',()=>{
 for(const source of ['class Holder{constructor(p:Image){} copy(p:Image):Image{return p}}','class Image{constructor(){}}class Holder{constructor(p:Image){}}','class Holder{constructor(){} apply<Image>(p:Image):Image{return p}}']){
  const program=parseMakeCodeTs(source,{retainCallableMetadata:true}),lexical=analyseCallableBindings(program),types=createSdkImageSourceTypes(program,lexical,{enabled:true}),ordinary=createSdkImageSourceTypes(program,lexical);
  const method=lexical.functions.find(scope=>scope.node.name==='copy'||scope.node.name==='apply');
  assert.deepEqual(ordinary.annotation('Image',method),named('Image'));
  assert.deepEqual(types.annotation('Image',method),source.includes('class Image')||source.includes('apply<Image>')?named('Image'):sdk());
 }
 assert.deepEqual(parseCallableType('Image'),named('Image'));
});
test('SDK Image signature substitution is exact and never equates nominal Image or other SDK names',()=>{
 const signature={kind:'callable',parameters:[{name:'input',optional:false,type:named('T')}],result:named('T')};
 const result=instantiateCallableSignature(signature,[{name:'T',constraint:'',defaultType:''}],[sdk()]);assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.signature.result,sdk());
 const exact={kind:'callable',parameters:[{name:'input',optional:false,type:sdk()}],result:sdk()};
 for(const type of [named('Image'),named('number'),{kind:'sdk',name:'Sprite'},{...sdk(),extra:true}])assert.ok(instantiateCallableSignature(exact,[],[type]).unsupported.length);
});
