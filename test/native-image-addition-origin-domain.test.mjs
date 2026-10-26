import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains,inspectNativeArrayBinaryDomains,lowerNativeArrayBinaryHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const inspect=source=>{
    const program=parseMakeCodeTs(helper+';'+source,profile);
    const before=JSON.stringify(program);
    const proof=inspectNativeAdditionExportDomains(program,profile);
    assert.equal(JSON.stringify(program),before,'the private observation view must not mutate emitted source');
    return {program,proof};
};
const good=source=>{
    const result=inspect(source);
    assert.equal(result.proof.reason,null,source);
    assert.equal(result.proof.helpers.size,1);
    assert.equal(result.proof.arrayHelpers.size,0,'retain ordinary + for the complete non-Array family');
    assert.equal(result.proof.current(),true);
    return result;
};
const bad=source=>assert.equal(inspect(source).proof.helpers.size,0,source);

test('actual Image additions use the ordinary helper independently of unrelated Arrays',()=>{
    for(const prefix of ['', 'let unrelated=[img`2`,img`3`];','let unrelated=[1,2];','let unrelated=[null,true,undefined,"x"];'])
        good(prefix+'let picture=img`1`;let result=__bwBinaryAdd(picture,2);');
    good('let picture=image.create(2,1);picture.fill(5);let clone=picture.clone();function echo(value:Image){return value;}let alias=echo(picture);let text=__bwBinaryAdd(alias,"");let sum=__bwBinaryAdd(picture,clone);');
});

test('every caller in the same helper family must be non-Array',()=>{
    bad('let picture=img`1`;let text=__bwBinaryAdd(picture,2);let list=[1,2];let joined=__bwBinaryAdd(list,2);');
    bad('function plus(value:any){return __bwBinaryAdd(value,2);}plus(img`1`);plus([1,2]);');
    bad('function plus(value:any){return __bwBinaryAdd(value,2);}plus(img`1`);plus(3);');
});

test('an authored candidate join helper cannot import as ordinary Image addition',()=>{
    const program=parseMakeCodeTs(helper+';let picture=img`1`;let result=__bwBinaryAdd(picture,2);',profile);
    const before=JSON.stringify(program),proof=inspectNativeArrayBinaryDomains(program,profile);
    assert.equal(proof.helpers.size,0);
    const lowered=lowerNativeArrayBinaryHelpers(program,profile);
    assert.equal(lowered.program,program);
    assert.ok(lowered.unsupported.length,'the original Image.join behavior must not be erased');
    assert.equal(JSON.stringify(program),before);
});

test('Image origin selection executes original unary and arithmetic bodies instead of type-only zeros',()=>{
    const choose='function choose(value:number){if(value===0)return undefined;return img`1`;}';
    good('function number(value:any):number{return +value;}'+choose+'let result=__bwBinaryAdd(choose(number(1)),2);');
});

test('unknown calls and replaced Image operations cannot borrow a nominal Image fact',()=>{
    for(const source of [
        'let picture:Image=foreign();let text=__bwBinaryAdd(picture,2);',
        'let picture=img`1`;foreign(picture);let text=__bwBinaryAdd(picture,2);',
        'let picture=img`1`;picture.clone=foreign;let text=__bwBinaryAdd(picture,2);',
        'let picture=img`1`;Object.prototype.valueOf=foreign;let text=__bwBinaryAdd(picture,2);'
    ])bad(source);
});

test('observed original-source mutation permanently expires an Image admission',()=>{
    const {program,proof}=good('let picture=img`1`;let result=__bwBinaryAdd(picture,2);');
    const declaration=program.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='picture'));
    const original=declaration.decls[0].init;
    declaration.decls[0].init={type:'Undefined'};
    assert.equal(proof.current(),false);
    declaration.decls[0].init=original;
    assert.equal(proof.current(),false,'restore cannot revive a revoked observation');
});


test('exporter independently proves actual primitive index arithmetic shared with Image calls',()=>{
    const source='function remainder(left:any,right:any):number{return left%right;}let picture=img`1`;let index=__bwBinaryAdd(remainder(Math.round(0),1),1);let coerced=remainder(picture,2);let text=__bwBinaryAdd(picture,2);';
    const {program}=good(source);
    assert.notEqual(inspectNativeArrayBinaryDomains(program,profile).reason,null,'strict import keeps the original authored Image.join refusal');
    bad(source.replace('remainder(picture,2)','remainder([picture],2)'));
    bad(source.replace('Math.round(0)','foreign()'));
});

test('callable pixel consumers use actual visited primitive additions and preserve source lifetime',()=>{
    const source='class Factory{read:()=>number;constructor(){this.read=()=>{return __bwBinaryAdd(1,2)}}}let factory=new Factory();let total=__bwBinaryAdd(factory.read(),1);';
    const program=parseMakeCodeTs(helper+';'+source,GENERATED_HELPER_PROFILES.metadata);
    const proof=inspectNativeAdditionExportDomains(program,GENERATED_HELPER_PROFILES.metadata);
    assert.equal(proof.helpers.size,1);assert.equal(proof.arrayHelpers.size,0);assert.equal(proof.current(),true);
    const original=program.body.at(-1).decls[0].init.args[1].value;
    program.body.at(-1).decls[0].init.args[1].value='4';assert.equal(proof.current(),false);
    program.body.at(-1).decls[0].init.args[1].value=original;assert.equal(proof.current(),false,'restoration never revives a consumed proof');
});

test('callable additions cannot borrow unvisited, incompatible or escaping caller observations',()=>{
    for(const source of [
        'class Factory{read:(x:Image)=>number;constructor(){this.read=(x:Image)=>{return __bwBinaryAdd(x.getPixel(0,0),2)}}}let factory=new Factory();',
        'class Factory{read:(x:any)=>any;constructor(){this.read=(x:any)=>{return __bwBinaryAdd(x,2)}}}let factory=new Factory();factory.read(img`1`);factory.read([1]);',
        'class Factory{read:(x:Image)=>number;constructor(){this.read=(x:Image)=>{return __bwBinaryAdd(x.getPixel(0,0),2)}}}let factory=new Factory();foreign(factory);factory.read(img`1`);'
    ]){
        const program=parseMakeCodeTs(helper+';'+source,GENERATED_HELPER_PROFILES.metadata);
        assert.equal(inspectNativeAdditionExportDomains(program,GENERATED_HELPER_PROFILES.metadata).helpers.size,0,source);
    }
});
