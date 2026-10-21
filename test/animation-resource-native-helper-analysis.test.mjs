import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {encodeAnimationJres,decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {animationAssetArray} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-asset-array.js';
import {mapGeneratedSourceArray,GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const nativeEntry=()=>encodeAnimationJres({id:'animation0',namespace:'myAnimations',name:'Walk',width:16,height:16,intervalMs:100,
    frames:[{pixels:Array(256).fill(2)},{pixels:Array(256).fill(5)}]});
const files=main=>({'main.ts':main,'pxt.json':JSON.stringify({name:'Owned staged animation',dependencies:{device:'*'},files:['main.ts','images.g.jres']}),
    'images.g.jres':JSON.stringify({Walk:encodeAnimationJres({id:'Walk',name:'Walk',width:16,height:16,intervalMs:100,
        frames:[{pixels:Array(256).fill(2)},{pixels:Array(256).fill(5)}]})})});
const prepared=main=>{
    const imported=arcadeToPseudocode(files(main),{target:'arcade',animationResources:true});
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
    for(const costume of imported.costumes||[]){if(costume.mode==='add')creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name);else creator.applyCustomSVG(costume.sprite,costume.svg);}
    const options={animationDocuments:imported.animationResources.map(resource=>resource.document),
        costumeSvg:target=>imported.costumes.find(costume=>costume.sprite===target.name)?.svg};
    return {imported,creator,options};
};

test('actual resource programs export native scalar helpers without erasing their native asset references',()=>{
    const art=Array(16).fill('2121212121212121').join('\n');
    const original=`let made=0
let touched=0
sprites.onCreated(SpriteKind.Player,function(sprite){made+=1})
sprites.onOverlap(SpriteKind.Player,SpriteKind.Projectile,function(left,right){touched+=1})
let actor=sprites.createProjectileFromSide(img\`${art}\`,0,0)
actor.setPosition(80,60)
animation.runImageAnimation(actor,assets.animation\`Walk\`,100,true)
let players=sprites.allOfKind(SpriteKind.Player).length`;
    for(const source of [original,'let frames=assets.animation`Walk`;let count=0;function tick(){count++}tick();let observed=count']){
        const {creator,options}=prepared(source),before=structuredClone(creator.project),exported=projectToArcade(creator.project,options);
        assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        assert.deepEqual(creator.project,before,'analysis does not rewrite authored inputs or effects');
        assert.match(exported.files['main.ts'],/assets\.animation`animation0`/,'actual native tag is retained in emitted source');
        assert.match(exported.files['main.ts'],/function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
        const resources=JSON.parse(exported.files['images.g.jres']),entry=Object.entries(resources).find(([,value])=>value.mimeType==='application/mkcd-animation');
        assert.ok(entry);const decoded=decodeAnimationJres(entry[1],{key:entry[0]});
        assert.equal(decoded.frames.length,2);assert.equal(decoded.frames[0].pixels[0],2);assert.equal(decoded.frames[1].pixels[0],5);
    }
});

test('private analysis view refuses unknown substituted shadowed assets and never grants flat primitive Image arrays',()=>{
    // Invoke the actual non-exported transformation for source-level controls;
    // production has only its fresh assembled-string parse as a caller.
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js',import.meta.url),'utf8');
    const start=source.indexOf('function nativeAdditionAnimationView('),end=source.indexOf('\nimport {ANIMATION_COMPANION_PATH',start);
    assert.ok(start>=0&&end>start);
    const view=new Function('animationAssetArray','decodeAnimationJres','mapGeneratedSourceArray','return ('+source.slice(start,end)+'\n);')(
        animationAssetArray,decodeAnimationJres,mapGeneratedSourceArray);
    const addition=nativeArrayAddHelperSource('__bwBinaryAdd',true,true),resources=[{nativeId:'animation0',nativeEntry:nativeEntry()}];
    const analyse=(body,inputs=resources)=>{
        const program=parseMakeCodeTs(addition+';'+body,GENERATED_HELPER_PROFILES.ordinary),before=structuredClone(program);
        const next=view(program,inputs);assert.deepEqual(program,before,'the original source AST is unchanged');
        return inspectNativeArrayBinaryDomains(next,GENERATED_HELPER_PROFILES.ordinary);
    };
    const literal='let images=assets.animation`animation0`;let scalar=__bwBinaryAdd(1,2)';
    const positive=analyse(literal);assert.equal(positive.reason,null);assert.equal(positive.helpers.size,1);assert.equal(positive.arrayHelpers.size,0);assert.equal(positive.current(),true);
    for(const [body,inputs]of [[literal,[]],[literal,[{nativeId:'different',nativeEntry:nativeEntry()}]],
        [literal.replace('animation0','missing'),resources],[literal.replace('animation0','${foreign()}'),resources],
        ['let assets=foreign;'+literal,resources],['function shadow(assets:any){return 1};'+literal,resources],
        ['let alias=assets;'+literal,resources],['assets.animation=foreign;'+literal,resources],
        [literal.replace('assets.animation','assets.unknown'),resources]])assert.equal(analyse(body,inputs).helpers.size,0,body);
    const images=analyse('let images=assets.animation`animation0`;let alias=images;let text=__bwBinaryAdd(alias,"!")');
    assert.equal(images.helpers.size,0);assert.match(images.reason,/flat primitive/,'Image elements never become primitive join operands');
});
