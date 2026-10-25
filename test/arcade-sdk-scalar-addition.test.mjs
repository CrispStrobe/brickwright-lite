import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const properties=['x','y','vx','vy','ax','ay','fx','fy','left','right','top','bottom'];
const factory='sprites.create(img`1`, SpriteKind.Player)';
const parse=source=>parseMakeCodeTs(source,{retainParentheses:true});
function nodes(value,out=[]){
    if(!value||typeof value!=='object')return out;
    if(Array.isArray(value)){for(const item of value)nodes(item,out);return out;}
    out.push(value);
    for(const [key,item]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(key))nodes(item,out);
    return out;
}
function inspect(source,property='x'){
    const program=parse(source),read=nodes(program).findLast(node=>node.type==='Member'&&node.name===property&&node.object?.name==='shot');
    assert.ok(read,source);
    return {program,read,graph:analyseSourceValueProducers(program,{ordinaryPrimitiveSdkNumbers:true})};
}
const isNumber=({graph,read})=>assert.deepEqual([...graph.typesAt(read)],['Number']);
const refused=source=>{const {graph,read}=inspect(source);assert.notDeepEqual([...graph.typesAt(read)],['Number'],source);};
const native=source=>inspectNativeArrayBinaryDomains(parseMakeCodeTs(
    nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';'+source,GENERATED_HELPER_PROFILES.ordinary));

test('actual Sprite factories prove numeric properties without publishing Sprite or Array certificates',()=>{
    for(const create of ['sprites.create(img`1`)',factory,
        'sprites.createProjectileFromSide(img`1`, -40, 0)',
        'sprites.createProjectileFromSprite(img`1`, null, -40, 0)']){
        for(const property of properties){
            const result=inspect(`let shot=${create};let result=shot.${property}`,property);
            isNumber(result);
            assert.equal(result.graph.typesAt(result.read.object).has('Number'),false);
            assert.equal(result.graph.typesAt(result.read.object).has('Sprite'),false);
        }
    }
    const dimensions=inspect(`let shot=${factory};let result=shot.width`,'width');
    assert.notDeepEqual([...dimensions.graph.typesAt(dimensions.read)],['Number']);
});

test('projectiles retain actual source aliases, numeric methods and all property writers',()=>{
    isNumber(inspect(`let origin=${factory};let source=origin;
let shot=sprites.createProjectileFromSprite(img\`1\`, source, -40, 0);
shot.setPosition(10,20);shot.setVelocity(-4,5);shot.x=12;shot.x+=1;let result=shot.x`));
    for(const edit of [
        `let shot=${factory};shot.x="bad" as any;let result=shot.x`,
        `let shot=${factory};let alias=shot;alias.x={} as any;let result=shot.x`,
        `let shot=${factory};shot["x"]=12;let result=shot.x`,
        `let shot=${factory};unknown(shot);let result=shot.x`,
        `let shot=${factory};shot=foreign();let result=shot.x`,
        `let shot=sprites.createProjectileFromSprite(img\`1\`, foreign(), -40,0);let result=shot.x`,
        `let shot=sprites.createProjectileFromSide(img\`1\`, foreign(),0);let result=shot.x`,
        `let shot=${factory};shot.setPosition(foreign(),20);let result=shot.x`
    ])refused(edit);
});

test('shadowed and replaced factories or incomplete receiver initialization do not prove Number',()=>{
    for(const source of [
        `let sprites=foreign();let shot=${factory};let result=shot.x`,
        `sprites.create=foreign;let shot=${factory};let result=shot.x`,
        `let api=sprites;api.create=foreign;let shot=${factory};let result=shot.x`,
        `let shot:Sprite=foreign();let result=shot.x`,
        `let origin:Sprite;let shot=sprites.createProjectileFromSprite(img\`1\`,origin,-40,0);origin=${factory};let result=shot.x`,
        `let shot=${factory};let result=shot.x;shot=null as any`
    ])refused(source);
});

test('canonical null resets require direct construction before every actual use',()=>{
    for(const source of [
        `let shot:Sprite=null;shot=${factory};let result=shot.x`,
        `let shot:Sprite;shot=null;shot=${factory};let result=shot.x`,
        `function launch(){let shot:Sprite=null;shot=${factory};let result=shot.x}launch()`
    ])isNumber(inspect(source));
    for(const source of [
        `let shot:Sprite=null;if(flag)shot=${factory};let result=shot.x`,
        `let shot:Sprite=null;let result=shot.x;shot=${factory}`,
        `let shot:Sprite=null;let alias=shot;shot=${factory};let result=shot.x`,
        `let shot:Sprite=null;shot=${factory};if(flag)shot=null;let result=shot.x`,
        `let shot:Sprite=null;function use(){return shot.x}use();shot=${factory}`,
        `let shot:Sprite=null;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){let result=shot.x});shot=${factory}`
    ])refused(source);
});

test('SDK Arrays and unknown results never acquire ordinary-addition fallback authority',()=>{
    for(const value of ['sprites.allOfKind(SpriteKind.Player)','tiles.getTilesByType(img`1`)','externalFactory()','img`1`']){
        const result=native(`let result=__bwBinaryAdd(${value},"!")`);
        assert.equal(typeof result.reason,'string',value);
        assert.equal(result.helpers.size,0,value);
        assert.notEqual(result.ordinaryFallback,true,value);
    }
    const primitive=native('let result=__bwBinaryAdd(1,2)');
    assert.equal(primitive.reason,null);
    const flat=native('let values=[1,2];let result=__bwBinaryAdd(values,"!")');
    assert.equal(flat.reason,null);
    assert.equal(flat.arrayHelpers.has('__bwBinaryAdd'),true);
});

test('captured scalar writers and genuine controller entries preserve independent initialization',()=>{
    const source=`let shot=${factory};let result=0;
shot.setPosition(40,60);
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){shot.x=40+Math.clamp(-2,10,99);result=shot.x});`;
    isNumber(inspect(source));
    refused(source.replace(`let shot=${factory};let result=0;`,`let shot:Sprite;let result=0;`)+`shot=${factory};`);
    refused(source.replace('controller.A.onEvent(ControllerButtonEvent.Pressed','foreign.onEvent(ControllerButtonEvent.Pressed'));
});

test('observed source edits permanently expire numeric property facts',()=>{
    const result=inspect(`let shot=${factory};let result=shot.x`);
    isNumber(result);
    result.read.name='data';
    assert.deepEqual([...result.graph.typesAt(result.read)],[]);
    result.read.name='x';
    assert.deepEqual([...result.graph.typesAt(result.read)],[]);
    const fresh=analyseSourceValueProducers(result.program,{ordinaryPrimitiveSdkNumbers:true});
    assert.deepEqual([...fresh.typesAt(result.read)],['Number']);
});

test('SDK scalar blocks, Code, own-asset SB3 and fresh export/reimport retain current editable values',async()=>{
    const source=`let shot=${factory};shot.setPosition(40,60);let result=shot.x;result+=0`;
    const build=source=>{
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.errors,[]);
        for(const costume of imported.costumes)assert.equal(creator.applyCustomSVG(costume.sprite,costume.svg),true);
        return creator;
    };
    const exportCurrent=creator=>{
        const out=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(out.unsupported,[]);return out;
    };
    const first=build(source),out=exportCurrent(first);
    exportCurrent(build(out.files));
    const bytes=await(await first.generateSB3()).arrayBuffer(),zip=await JSZip.loadAsync(bytes);
    const saved=JSON.parse(await zip.file('project.json').async('string'));
    const blocks=saved.targets.flatMap(target=>Object.values(target.blocks));
    assert.ok(blocks.some(block=>block.opcode==='arcade_spriteProperty'&&block.fields.PROPERTY[0]==='x'));
    const code=first.decompile(saved);assert.match(code,/property x/);
    const editedCode=code.replace('x 40 y 60','x 41 y 60');assert.notEqual(editedCode,code);
    const next=new Creator();next.parse(editedCode);assert.deepEqual(next.warnings,[]);assert.deepEqual(next.errors,[]);
    // Edit actual pixels through the public asset API, independently of Code.
    const imported=arcadeToPseudocode(source);
    for(const costume of imported.costumes){
        assert.match(costume.svg,/#ffffff/i);
        assert.equal(next.applyCustomSVG(costume.sprite,costume.svg.replace(/#ffffff/gi,'#ff2121')),true);
    }
    const edited=exportCurrent(next);
    assert.match(edited.ts,/\.setPosition\(41, 60\)/);
    assert.match(edited.ts,/img`\s*2\s*`/);
    exportCurrent(build(edited.files));
});
