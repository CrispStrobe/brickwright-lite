import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {pixelsToSvg,svgToPixels,ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {source as literalSource} from './fixtures/arcade/sdk-image-literal-callables.mjs';

// Authored test artwork, not a reconstruction of the missing official GUI graph.
const pixels=[3,0,0,4],svg=pixelsToSvg({width:2,height:2,pixels:Uint8Array.from(pixels)});
const rgba=Uint8ClampedArray.from(pixels.flatMap(index=>index===0?[0,0,0,0]:[
    ...ARCADE_PALETTE[index].slice(1).match(/../g).map(hex=>parseInt(hex,16)),255]));
const target=(creator,name='Game')=>creator.project.targets.find(t=>!t.isStage&&t.name===name);
function parse(code) {
    const creator=new Creator();creator.parse(code);assert.deepEqual(creator.warnings,[]);return creator;
}
function art(creator,name='Game') {
    assert.equal(creator.applyCustomSVG(name,svg),true);
    assert.deepEqual(Array.from(svgToPixels(creator.assets.get(target(creator,name).costumes[0].assetId).data).pixels),pixels);
}
function simple(body='arcade set score player (1) to (3)',other=false) {
    const creator=parse(`DEVICE ARCADE\nGLOBAL probe\nGLOBAL selector\nSPRITE Game:\nWHEN flag clicked:\n  hide\n  ${body}\n${other?'SPRITE Other:\nWHEN flag clicked:\n  hide\n':''}`);
    // A serialized current-project fixture after its authored hide, not VM execution.
    target(creator).visible=false;art(creator);if(other)art(creator,'Other');return creator;
}
function options(creator,kind='svg') {
    return {
        costumeSvg:(t,c)=>t.name==='Game'&&kind!=='svg'?null:creator.assets.get(c.assetId)?.data,
        ...(kind==='rgba'?{costumeRgba:t=>t.name==='Game'?{width:2,height:2,rgba}:null}:{})
    };
}
function exportUnchanged(creator,kind='svg') {
    const project=JSON.stringify(creator.project),assets=[...creator.assets].map(([id,a])=>[id,a.data]);
    const result=projectToArcade(creator.project,options(creator,kind));
    assert.equal(JSON.stringify(creator.project),project,'export never edits current project/art descriptors');
    assert.deepEqual([...creator.assets].map(([id,a])=>[id,a.data]),assets,'export never edits owned asset bytes');return result;
}
const hasGame=result=>/let GameSprite = sprites\.create\(/.test(result.ts);
function gameArt(result) {
    assert.equal(hasGame(result),true,'current Game identity remains an actual exported actor');
    const image=/let GameSprite = sprites\.create\(img`([\s\S]*?)`/.exec(result.ts) ||
        /let GameCostumes: Image\[\] = \[\s*img`([\s\S]*?)`/.exec(result.ts);
    assert.ok(image,'actual authored Game image survives');assert.equal(image[1].replace(/\s/g,''),'3..4');
}

test('actual literal Creator graph: dormant readable Game SVG/RGBA leaves full no-art export unchanged',()=>{
    const imported=importProjectFiles({'main.ts':literalSource},{target:'arcade'});assert.deepEqual(imported.unsupported,[]);
    const creator=parse(imported.code);
    for(const upload of imported.costumes||[]) {
        assert.equal(upload.mode==='add'?creator.addCustomSVGCostume(upload.sprite,upload.svg,upload.name):creator.applyCustomSVG(upload.sprite,upload.svg),true);
    }
    target(creator).visible=false;art(creator);
    const baseline=exportUnchanged(creator,'none');assert.deepEqual(baseline.unsupported,[]);assert.equal(hasGame(baseline),false);
    for(const kind of ['svg','rgba']) {
        const actual=exportUnchanged(creator,kind);assert.deepEqual(actual.unsupported,[]);
        assert.deepEqual(actual.files,baseline.files,'full export equality, no text stripping or oracle edit');
    }
});

test('unrun literal import with its proved startup hide also remains a program host',()=>{
    const imported=importProjectFiles({'main.ts':literalSource},{target:'arcade'});assert.deepEqual(imported.unsupported,[]);
    const creator=parse(imported.code);for(const upload of imported.costumes||[]) {
        assert.equal(upload.mode==='add'?creator.addCustomSVGCostume(upload.sprite,upload.svg,upload.name):creator.applyCustomSVG(upload.sprite,upload.svg),true);
    }
    assert.equal(target(creator).visible,true,'normal Creator initial state is deliberately untouched');art(creator);
    assert.ok(Object.values(target(creator).blocks).some(b=>b.opcode==='looks_hide'),'actual imported startup hide exists');
    const baseline=exportUnchanged(creator,'none');assert.equal(hasGame(baseline),false);
    for(const kind of ['svg','rgba'])assert.deepEqual(exportUnchanged(creator,kind).files,baseline.files);
});

for(const [name,change] of [
    ['hide parent',(hat,hide)=>{hide.parent='foreign';}],
    ['hide inputs',(hat,hide)=>{hide.inputs.EXTRA=[1,[10,'effect']];}],
    ['hide fields',(hat,hide)=>{hide.fields.EXTRA=['value',null];}],
    ['hide mutation',(hat,hide)=>{hide.mutation={tag:'extra'};}],
    ['hide shadow',(hat,hide)=>{hide.shadow=true;}],
    ['hide topLevel',(hat,hide)=>{hide.topLevel=true;}],
    ['hat parent',hat=>{hat.parent='foreign';}],
    ['hat shadow',hat=>{hat.shadow=true;}],
    ['hat topLevel',hat=>{hat.topLevel=false;}]
])test('unrun host proof refuses malformed '+name,()=>{
    const creator=simple(),game=target(creator);game.visible=true;
    const hat=Object.values(game.blocks).find(b=>b.opcode==='event_whenflagclicked'),hide=game.blocks[hat.next];
    assert.equal(hide.opcode,'looks_hide');change(hat,hide);gameArt(exportUnchanged(creator));
});
test('every actual startup hat must immediately hide before unrun artwork can be dormant',()=>{
    const creator=simple(),game=target(creator);game.visible=true;
    game.blocks.secondStart={opcode:'arcade_whenSourceStarts',parent:null,next:null,inputs:{},fields:{},shadow:false,topLevel:true};
    gameArt(exportUnchanged(creator));
});

test('visible authored Game keeps its real artwork and position',()=>{
    const creator=parse('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade set score player (1) to (3)');
    art(creator);Object.assign(target(creator),{visible:true,x:30,y:-12});
    const result=exportUnchanged(creator);gameArt(result);assert.match(result.ts,/GameSprite\.setPosition\(30 \/ 3 \+ 80, 60 - -12 \/ 3\)/);
});
for(const body of ['go to x: 12 y: 9','show','next costume','pen down'])test('hidden authored Game retains self semantics: '+body,()=>{
    const result=exportUnchanged(simple(body));gameArt(result);
});

// Real SB3 input shapes on current Creator-owned targets. These fixtures exercise
// cross-target ownership without invoking native primitives or an SDK runtime.
const selectors=[
    ['motion_goto','TO','TO','motion_goto_menu'],['motion_glideto','TO','TO','motion_glideto_menu'],['motion_pointtowards','TOWARDS','TOWARDS','motion_pointtowards_menu'],
    ['sensing_touchingobject','TOUCHINGOBJECTMENU','TOUCHINGOBJECTMENU','sensing_touchingobjectmenu'],
    ['sensing_distanceto','DISTANCETOMENU','DISTANCETOMENU','sensing_distancetomenu'],['sensing_of','OBJECT','OBJECT','sensing_of_object_menu'],
    ['control_create_clone_of','CLONE_OPTION','CLONE_OPTION','control_create_clone_of_menu']
];
function reference(creator,[opcode,socket,field,menuOpcode],mode='static',name='Game',ownerName='Other') {
    const owner=target(creator,ownerName),blocks=owner.blocks;
    const [hatId,hat]=Object.entries(blocks).find(([,b])=>b.opcode==='event_whenflagclicked');
    assert.ok(hatId);const reporter=opcode.startsWith('sensing_'),id='authored-reference',menu='authored-menu',dynamic='authored-selector';
    const base={next:null,fields:{},inputs:{},shadow:false,topLevel:false};
    blocks[menu]={...base,opcode:menuOpcode,parent:id,shadow:true,fields:{[field]:[name,null]}};
    blocks[id]={...base,opcode,parent:hatId,inputs:{[socket]:[1,menu]}};
    if(opcode==='motion_glideto')blocks[id].inputs.SECS=[1,[4,'1']];
    if(opcode==='sensing_of')blocks[id].fields.PROPERTY=['x position',null];
    if(mode!=='static') {
        const [variableId]=Object.entries(creator.project.targets.find(t=>t.isStage).variables).find(([,v])=>v[0]==='selector');
        blocks[dynamic]={...base,opcode:'data_variable',parent:id,fields:{VARIABLE:['selector',variableId]}};
        blocks[id].inputs[socket]=mode==='dynamic'?[2,dynamic]:[3,dynamic,menu];
    }
    if(reporter) {
        const [variableId]=Object.entries(creator.project.targets.find(t=>t.isStage).variables).find(([,v])=>v[0]==='probe');
        const set='authored-set';blocks[set]={...base,opcode:'data_setvariableto',parent:hatId,fields:{VARIABLE:['probe',variableId]},inputs:{VALUE:[3,id,[10,'']]}};
        blocks[id].parent=set;hat.next=set;
    } else hat.next=id;
    return {owner,id,menu};
}
for(const selection of selectors)for(const mode of ['static','dynamic','obscured'])test(`${selection[0]} ${mode} foreign selector preserves Game identity`,()=>{
    const creator=simple(undefined,true);
    reference(creator,selection,mode,mode==='obscured'?'Other':'Game');
    assert.equal(hasGame(exportUnchanged(creator)),true,'unknown/obscured input cannot erase current Game identity');
});
for(const selection of selectors)test(`${selection[0]} known Other selector does not allocate dormant Game`,()=>{
    const creator=simple(undefined,true);reference(creator,selection,'static','Other');
    assert.equal(hasGame(exportUnchanged(creator)),false);
});
test('same menu ID in another target cannot borrow the host menu selection',()=>{
    const creator=simple(undefined,true),{menu}=reference(creator,selectors[0]);
    // A distinct inert extension menu avoids a local motion opcode retaining Game by itself.
    target(creator).blocks[menu]={opcode:'authored_menu',next:null,parent:null,inputs:{},fields:{TO:['Other',null]},shadow:true,topLevel:false};
    gameArt(exportUnchanged(creator));
});
for(const mode of ['static','dynamic','obscured'])test('host clone identity remains for '+mode+' selector',()=>{
    const creator=simple();reference(creator,selectors.at(-1),mode,'_myself_','Game');gameArt(exportUnchanged(creator));
});
test('an ordinary nonGame authored sprite remains an actor',()=>{
    const creator=simple(undefined,true),result=exportUnchanged(creator);assert.equal(hasGame(result),false);assert.match(result.ts,/let OtherSprite = sprites\.create\(img`/);
});
test('Game artwork used by frameImage remains an Image resource without a Game actor',()=>{
    const creator=parse('DEVICE ARCADE\nGLOBAL probe\nSPRITE Reader:\nWHEN flag clicked:\n  hide\n  set probe to (arcade frame image array "hostFrames" index (0) template "Game" start 0 count 1)\nSPRITE Game:\nWHEN flag clicked:\n  hide');
    target(creator).visible=false;art(creator);
    assert.notEqual(target(creator,'Reader'),target(creator),'resource consumer is a different actual target');
    const result=exportUnchanged(creator);assert.deepEqual(result.unsupported,[]);assert.equal(hasGame(result),false);
    assert.match(result.ts,/img`\s*3 \.\s*\. 4\s*`/,'exact resource pixels survive');
});

// Use the actual imported prefix, preserving its current variable IDs and scope.
// Only one selected graph property changes in each negative control.
function literalPrelude() {
    const imported=importProjectFiles({'main.ts':literalSource},{target:'arcade'});assert.deepEqual(imported.unsupported,[]);
    const creator=parse(imported.code);
    for(const upload of imported.costumes||[])assert.equal(upload.mode==='add'?
        creator.addCustomSVGCostume(upload.sprite,upload.svg,upload.name):creator.applyCustomSVG(upload.sprite,upload.svg),true);
    const game=target(creator);assert.equal(game.visible,true);art(creator);
    const [hatId,hat]=Object.entries(game.blocks).find(([,b])=>b.topLevel&&b.opcode==='arcade_whenSourceStarts');
    const prefix=[],seen=new Set();let id=hat.next;
    while(['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(game.blocks[id]?.opcode)) {
        assert.equal(seen.has(id),false);seen.add(id);prefix.push({id,node:game.blocks[id]});id=game.blocks[id].next;
    }
    assert.equal(prefix.filter(row=>row.node.opcode==='arcade_declareSourceScalar').length,9);
    assert.equal(prefix.filter(row=>row.node.opcode==='arcade_declareSourceReference').length,1);
    assert.equal(game.blocks[id].opcode,'looks_hide');return {creator,game,hatId,hat,prefix,hideId:id,hide:game.blocks[id]};
}
function preludeRefused(fixture) {
    let result;
    try {result=exportUnchanged(fixture.creator);}
    catch(error) {
        // A named existing whole-project semantic refusal is also conservative;
        // an incidental JS crash is not evidence of startup-host rejection.
        assert.match(String(error.message),/source scalar|source reference|declaration|variable binding|foreign|cyclic|constraint|callable lexical|class callable/i);
        return;
    }
    if(result.unsupported.some(message=>/source scalar|source reference|cyclic.*declaration/i.test(message)))return;
    gameArt(result);
}
function connectedVariable(fixture) {
    const row=fixture.prefix[0],variable=row.node.inputs.VARIABLE[1],id='actual-prefix-variable';
    assert.equal(variable[0],12);
    fixture.game.blocks[id]={opcode:'data_variable',parent:row.id,next:null,shadow:false,topLevel:false,inputs:{},fields:{VARIABLE:[variable[1],variable[2]]}};
    row.node.inputs.VARIABLE=[3,id,[10,'']];return fixture.game.blocks[id];
}
for(const [name,change] of [
    ['extra socket',f=>{f.prefix[0].node.inputs.EXTRA=[1,[10,'unread effect']];}],
    ['extra field',f=>{f.prefix[0].node.fields.EXTRA=['unread value',null];}],
    ['wrong variable owner',f=>{
        const variable=f.prefix[0].node.inputs.VARIABLE[1],stage=f.creator.project.targets.find(t=>t.isStage);
        const foreign=target(f.creator,'image');assert.ok(foreign);foreign.variables[variable[2]]=stage.variables[variable[2]];delete stage.variables[variable[2]];
    }],
    ['wrong variable name',f=>{f.prefix[0].node.inputs.VARIABLE[1][1]='notTheBoundVariable';}],
    ['unsupported scalar type',f=>{f.prefix[0].node.fields.TYPE[0]='Opaque';}],
    ['unsupported reference type',f=>{f.prefix.find(row=>row.node.opcode==='arcade_declareSourceReference').node.fields.TYPE[0]='MissingCurrentClass';}],
    ['wrong physical parent',f=>{f.prefix[1].node.parent=f.hatId;}],
    ['declaration topLevel',f=>{f.prefix[1].node.topLevel=true;}],
    ['declaration shadow',f=>{f.prefix[1].node.shadow=true;}],
    ['declaration mutation',f=>{f.prefix[1].node.mutation={extra:'not metadata'};}],
    ['prefix cycle',f=>{f.prefix.at(-1).node.next=f.prefix[0].id;}],
    ['reporter wrong parent',f=>{connectedVariable(f).parent=f.hatId;}],
    ['reporter topLevel',f=>{connectedVariable(f).topLevel=true;}],
    ['reporter shadow',f=>{connectedVariable(f).shadow=true;}],
    ['reporter extra input',f=>{connectedVariable(f).inputs.EXTRA=[1,[10,'unread effect']];}],
    ['reporter extra field',f=>{connectedVariable(f).fields.EXTRA=['unread value',null];}],
    ['reporter wrong name',f=>{connectedVariable(f).fields.VARIABLE[0]='notTheBoundVariable';}]
])test('literal metadata prelude refuses '+name,()=>{const fixture=literalPrelude();change(fixture);preludeRefused(fixture);});

test('literal metadata prelude accepts the current owned plain variable reporter',()=>{
    const fixture=literalPrelude();connectedVariable(fixture);
    const baseline=exportUnchanged(fixture.creator,'none'),actual=exportUnchanged(fixture.creator);
    assert.deepEqual(actual.unsupported,[]);assert.equal(hasGame(actual),false);assert.deepEqual(actual.files,baseline.files);
});
function moveBeforeHide(fixture,id) {
    const blocks=fixture.game.blocks,node=blocks[id],oldParent=blocks[node.parent],oldNext=blocks[node.next];
    assert.equal(oldParent.next,id);oldParent.next=node.next;if(oldNext)oldNext.parent=node.parent;
    const last=fixture.prefix.at(-1);last.node.next=id;node.parent=last.id;node.next=fixture.hideId;fixture.hide.parent=id;
}
for(const mode of ['setter','call'])test('literal metadata prelude refuses '+mode+' before hide',()=>{
    const fixture=literalPrelude(),blocks=fixture.game.blocks;let id=fixture.hide.next;
    while(id) {
        const node=blocks[id],input=node.inputs?.VALUE?.[1],value=typeof input==='string'?blocks[input]:null;
        if(mode==='setter'&&node.opcode==='data_setvariableto'||mode==='call'&&node.opcode==='arcade_setLocal'&&value?.opcode==='arcade_callCallable')break;
        id=node.next;
    }
    assert.ok(id,'actual imported '+mode+' exists after hide');moveBeforeHide(fixture,id);preludeRefused(fixture);
});
