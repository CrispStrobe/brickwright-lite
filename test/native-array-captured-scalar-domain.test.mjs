import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains,lowerNativeArrayBinaryHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true),profile=GENERATED_HELPER_PROFILES.ordinary;
const inspect=source=>{const program=parseMakeCodeTs(helper+';'+source,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
const good=source=>{const result=inspect(source);assert.equal(result.proof.reason,null,source);assert.equal(result.proof.helpers.size,1,source);assert.equal(result.proof.current(),true);return result;};
const bad=source=>{const result=inspect(source);assert.equal(result.proof.helpers.size,0,source);assert.equal(typeof result.proof.reason,'string',source);};

test('captured scalar identifiers preserve actual primitive and Undefined normal values without granting initialization',()=>{
    good('let trace:string;function tick(){trace=__bwBinaryAdd(trace,"g")}trace="";tick()');
    good('let count:number;class Box {tick(){count=__bwBinaryAdd(count,1)}}count=0;let box=new Box();box.tick()');
    const {program,proof}=good('let value:any;function read(){return __bwBinaryAdd(value,"!")}let before=read();value="later"');
    const lowered=lowerNativeArrayBinaryHelpers(program,profile);
    assert.deepEqual(lowered.unsupported,[]);
    const fn=lowered.program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='read');
    assert.equal(fn.body[0].value.type,'NativeArrayValueBinary');
    assert.deepEqual(fn.body[0].value.left,{type:'Identifier',name:'value'},'actual early read remains executable');
    assert.equal(proof.current(),true);
});

test('captured scalar admission still requires complete actual primitive writers and refuses local TDZ or Array authority',()=>{
    for(const later of ['foreign()','{}','[5]','sprites.create(img`1`,0)'])
        bad('let value:any="";function read(){return __bwBinaryAdd(value,"!")}let before=read();value='+later);
    bad('let value:any="";function read(){return __bwBinaryAdd(value,"!")}foreign(function(){value={}});read()');
    bad('function read(value:any){return __bwBinaryAdd(value,"!")}game.onUpdate(read)');
    bad('function read(){let result=__bwBinaryAdd(value,1);let value=2;return result}read()');
    bad('let value:any;function read(){return __bwBinaryAdd(value,"!")}read()');
    const {program,proof}=good('let value:any="";function read(){return __bwBinaryAdd(value,"!")}read()');
    const declaration=program.body.find(node=>node.type==='Declaration').decls[0];
    declaration.init={type:'Object',props:[]};
    assert.equal(proof.current(),false,'source writer mutation still invalidates retained proof');
    assert.equal(inspectNativeArrayBinaryDomains(program,profile).helpers.size,0,'fresh object writer cannot borrow old scalar facts');
});
