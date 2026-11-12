import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectJsonToArcade,projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createAnimationFrameArrayProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-frame-array-producers.js';
import {ownedAnimationLiteral,unusedAnimationLookups} from '../overlay/scratch-gui/src/lib/bw-makecode/static-animation-resource-emission.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {ANIMATION_COMPANION_PATH} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-companion.js';
import {STRING_ARRAY_SETTINGS_PATH,STRING_ARRAY_SETTINGS_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/string-array-settings.generated.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

const id='12345678-1234-4234-8234-123456789abc';
const document=()=>{
    const frames=[2,8].map((colour,index)=>({id:`f${index}`,durationMs:100,activeLayerId:'pixels',
        layers:[{id:'pixels',name:'Pixels',locked:false,type:'pixel',visible:true,opacity:1,
            content:{kind:'pixels',value:{width:2,height:1,pixels:[colour,colour]}}}]}));
    return {version:4,layers:frames[0].layers,activeLayerId:'pixels',
        animation:{resource:{id,name:'Walk'},activeFrameId:'f0',frames}};
};
const project=(operation='fresh frames',resource=`"${id}"`,extra='')=>{
    const creator=new Creator();creator.parse(`DEVICE ARCADE
GLOBAL first
GLOBAL second
GLOBAL key = "${id}"
WHEN arcade source starts:
  set first to (arcade animation ${operation} resource ${resource})
  set second to (arcade animation ${operation} resource ${resource})
${extra}`);
    for(const key of ['warnings','errors','unparsed'])assert.deepEqual(creator[key],[],key);
    return creator.project;
};
const entries=project=>project.targets.flatMap(target=>Object.values(target.blocks)
    .filter(node=>node.opcode==='arcade_animationAssetFreshFrames').map(node=>({target,node})));
const nodes=root=>{
    const all=[];const walk=value=>{
        if(!value||typeof value!=='object')return;
        if(value.type)all.push(value);
        for(const item of Object.values(value))if(Array.isArray(item))item.forEach(walk);else walk(item);
    };walk(root);return all;
};
const clean=(input,options={animationDocuments:[document()]})=>{
    const result=projectJsonToArcade(JSON.stringify(input),options);
    assert.deepEqual(result.unsupported,[]);return result;
};
const freshAssignments=result=>nodes(parseMakeCodeTs(result.ts)).filter(node=>node.type==='Assignment'&&
    node.left?.type==='Identifier'&&['first','second'].includes(node.left.name));
const lookupDefinitions=result=>parseMakeCodeTs(result.ts).body.filter(node=>node.type==='FunctionDeclaration'&&
    /^__bwAnimation(?:FreshFrames|Frames|Interval)_*$/.test(node.name));

test('owned current JSON emits a distinct native fresh expression at every actual use',()=>{
    const input=project(),before=JSON.stringify(input),result=clean(input);
    assert.equal(JSON.stringify(input),before);
    const assignments=freshAssignments(result);assert.equal(assignments.length,2);
    for(const assignment of assignments){assert.equal(assignment.right.type,'Template');assert.equal(assignment.right.tag,'assets.animation');}
    assert.notEqual(assignments[0].right,assignments[1].right,'separate evaluations, no shared variable or memoization');
    assert.equal(assignments[0].right.value,assignments[1].right.value,'same actual encoded resource');
    assert.equal(lookupDefinitions(result).length,0,'all unused owned lookup definitions removed');
    const resources=JSON.parse(result.files['images.g.jres']);
    const decoded=decodeAnimationJres(resources[`myAnimations.${assignments[0].right.value}`]);
    assert.deepEqual(decoded.frames.map(frame=>Array.from(frame.pixels)),[[2,2],[8,8]]);
    assert.match(result.ts,/let __bwAnimationFrames0: Image\[\] = assets\.animation`/,'original allocation retained');
    const companion=JSON.parse(result.files[ANIMATION_COMPANION_PATH]);
    assert.equal(companion.resources[0].nativeId,`myAnimations.${assignments[0].right.value}`);
    assert.deepEqual(companion.resources[0].nativeProjection.frames,[[2,2],[8,8]]);
});

test('old AST API and old API with branded input retain original lookup evaluation and ABI',()=>{
    const input=project(),options={animationDocuments:[document()],snapshotCallbacks:true};
    for(const value of [input,createProjectJsonSnapshot(JSON.stringify(input))]){
        const result=projectToArcade(value,options);assert.deepEqual(result.unsupported,[]);
        assert.equal(lookupDefinitions(result).length,3);
        for(const assignment of freshAssignments(result))assert.equal(assignment.right.type,'Call');
        assert.match(result.ts,/console\.log\("Animation resource unavailable: " \+ id\)/);
    }
});

test('dynamic shared and unavailable resources retain lookups logging and undefined fallback',()=>{
    for(const [operation,resource,method] of [['fresh frames','(key)','FreshFrames'],['frames',`"${id}"`,'Frames'],
        ['fresh frames','"missing"','FreshFrames']]){
        const result=projectJsonToArcade(JSON.stringify(project(operation,resource)),{animationDocuments:[document()]});
        assert.equal(lookupDefinitions(result).length,3);
        for(const assignment of freshAssignments(result)){
            assert.equal(assignment.right.type,'Call');assert.match(assignment.right.callee.name,new RegExp(`Animation${method}`));
        }
        assert.match(result.ts,/console\.log/);assert.match(result.ts,/return undefined/);
        if(resource==='"missing"')assert.ok(result.unsupported.some(reason=>reason.includes('unavailable')));
        else assert.deepEqual(result.unsupported,[]);
    }
});

test('actual selector publication and duplicate identity gates join only current normalized resources',()=>{
    const input=project();
    for(const {target,node} of entries(input)){
        const key=`selector${Object.keys(target.blocks).length}`;
        target.blocks[key]={opcode:'arcade_menu_animationAssets',parent:Object.keys(target.blocks).find(key=>target.blocks[key]===node),
            topLevel:false,shadow:true,next:null,mutation:null,
            inputs:{},fields:{animationAssets:[id,null]}};
        node.inputs.RESOURCE=[1,key];
    }
    assert.equal(lookupDefinitions(clean(input)).length,0);
    const callable=new Creator();callable.parse(`DEVICE ARCADE
GLOBAL first
DEFINE inspect (assets):
  set first to (arcade animation fresh frames resource "${id}")
WHEN arcade source starts:
  inspect (0)
`);
    for(const key of ['warnings','errors','unparsed'])assert.deepEqual(callable[key],[],key);
    const scoped=projectJsonToArcade(JSON.stringify(callable.project),{animationDocuments:[document()]});
    assert.equal(lookupDefinitions(scoped).length,3,'caller namespace is not a global asset lookup proof');
    const invalid=document();invalid.animation.activeFrameId='missing';
    for(const documents of [[document(),document()],[invalid]]){
        const result=projectJsonToArcade(JSON.stringify(project()),{animationDocuments:documents});
        assert.equal(lookupDefinitions(result).length,3);
        for(const assignment of freshAssignments(result))assert.equal(assignment.right.type,'Call');
    }
});

test('emitted mapped native entry and companion retain palette and name collision identity',()=>{
    const first=document(),second=document();second.animation.resource.id='22345678-1234-4234-8234-123456789abc';
    second.animation.resource.name='Walk';
    const palette=[...ARCADE_PALETTE];[palette[2],palette[8]]=[palette[8],palette[2]];
    const result=clean(project(),{animationDocuments:[first,second],costumePalette:()=>palette});
    const assignment=freshAssignments(result)[0],nativeID=assignment.right.value;
    const decoded=decodeAnimationJres(JSON.parse(result.files['images.g.jres'])[`myAnimations.${nativeID}`]);
    assert.deepEqual(decoded.frames.map(frame=>Array.from(frame.pixels)),[[8,8],[2,2]],'mapped encoded pixels, not raw document literals');
    const companion=JSON.parse(result.files[ANIMATION_COMPANION_PATH]);
    assert.equal(new Set(companion.resources.map(resource=>resource.nativeName)).size,2);
    assert.deepEqual(companion.resources.find(resource=>resource.nativeId===`myAnimations.${nativeID}`).nativeProjection.frames,[[8,8],[2,2]]);
});

test('descriptor boundary refuses inherited slots and foreign block membership without invoking getters',()=>{
    for(const key of ['mutation','next','fields','inputs','shadow'])for(const inherited of ['getter','data']){
        const input=project(),entry=entries(input)[0];delete entry.node[key];
        const snapshot=createProjectJsonSnapshot(JSON.stringify(input)),actual=entries(snapshot)[0];
        let calls=0,result;
        Object.defineProperty(Object.prototype,key,inherited==='getter'?{configurable:true,get(){calls++;return key==='mutation'||key==='next'?null:{};}}:
            {configurable:true,writable:true,value:key==='mutation'||key==='next'?null:{}});
        try {result=ownedAnimationLiteral(snapshot,actual.target,actual.node);}finally{delete Object.prototype[key];}
        assert.equal(result,false,key);assert.equal(calls,0,key);
    }
    const input=project(),{target,node}=entries(input)[0];delete target.blocks[Object.keys(target.blocks).find(key=>target.blocks[key]===node)];
    let calls=0,result;Object.defineProperty(Object.prototype,'foreignProducer',{configurable:true,get(){calls++;return node;}});
    try {result=ownedAnimationLiteral(input,target,node);}finally{delete Object.prototype.foreignProducer;}
    assert.equal(result,false);assert.equal(calls,0);
    // A selector's absent optional fields are equally unsafe, even when frozen.
    for(const key of ['mutation','next','shadow','inputs','fields'])for(const inherited of ['getter','data']){
        const input=project(),{target,node}=entries(input)[0];
        target.blocks.menu={opcode:'text',shadow:true,next:null,inputs:{},fields:{TEXT:[id,null]}};delete target.blocks.menu[key];
        node.inputs.RESOURCE=[1,'menu'];const snapshot=createProjectJsonSnapshot(JSON.stringify(input));
        const actual=entries(snapshot)[0];let calls=0,result;
        Object.defineProperty(Object.prototype,key,inherited==='getter'?{configurable:true,get(){calls++;return null;}}:
            {configurable:true,writable:true,value:null});
        try {result=ownedAnimationLiteral(snapshot,actual.target,actual.node);}finally{delete Object.prototype[key];}
        assert.equal(result,false,key);assert.equal(calls,0,key);
    }
});

test('complete source reference accounting retains value callback opaque and reflective uses',()=>{
    const owned=new Map([['framesLookup','function framesLookup(id: string): Image[] { return undefined }'],
        ['freshLookup','function freshLookup(id: string): Image[] { return undefined }'],
        ['intervalLookup','function intervalLookup(id: string): number { return undefined }']]);
    const definitions=[...owned.values()].join('\n');
    assert.equal(unusedAnimationLookups(definitions+'\nlet value = "freshLookup"',owned).size,3,'text is not a reference');
    for(const tail of ['let value = freshLookup','freshLookup("id")','let value = {get: freshLookup}',
        'let value = function () { return freshLookup }','let value = `${freshLookup}`',
        'eval("freshLookup")','Function("return freshLookup")()','let value = globalThis["freshLookup"]',
        'unknown(freshLookup)','let value = assets.animation`foreign`','let value = external','let value = 1 @ 2','class Foreign {}','let assets = 1',
        'function hidden(assets: number) { return 0 }','let value = img`${freshLookup}`',
        'function read(value = freshLookup("id")) { return value }',
        'function read(value: Image[] = freshLookup("id")) { return value }',
        'function read(value?: any) { return value }'])
        assert.equal(unusedAnimationLookups(definitions+'\n'+tail,owned).size,0,tail);
    assert.equal(unusedAnimationLookups(definitions+'\n'+owned.get('freshLookup'),owned).size,0,'duplicate declaration');
    // These are final output prefixes, not part of projectTs alone. In the
    // emitter their actual private presence now retains the whole family.
    for(const prefix of [STRING_ARRAY_SETTINGS_SOURCE,
        'namespace myTiles { export const tile0 = img`1` }',
        'namespace songs { helpers._registerFactory("song", function (name: string) { return hex`00` }) }'])
        assert.equal(unusedAnimationLookups(prefix+'\n'+definitions,owned).size,0,'full final prefix is not omitted');
    const withSettings=clean(project('fresh frames',`"${id}"`,
        '  arcade log (arcade read setting "names" type StringArray)\n'));
    assert.ok(withSettings.ts.startsWith(STRING_ARRAY_SETTINGS_SOURCE+'\n'),'actual final settings prefix');
    assert.equal(withSettings.files[STRING_ARRAY_SETTINGS_PATH],STRING_ARRAY_SETTINGS_SOURCE);
    assert.equal(lookupDefinitions(withSettings).length,3,'real final prefix keeps the complete lookup family');
    const settingsFresh=freshAssignments(withSettings);assert.equal(settingsFresh.length,2);
    assert.equal(settingsFresh.every(assignment=>assignment.right.type==='Template'),true,
        'static fresh evaluation remains supported when omission is conservatively disabled');
    // This integrated witness overlaps the current Member-call refusal; it
    // does not claim that removing only the explicit prefix fence must fail.

});

test('resource edits expire private selection and current JSON export preserves changed documents',()=>{
    const doc=document(),options={animationDocuments:[doc]},producer=createAnimationFrameArrayProducers(options);
    const input=project(),{target,node}=entries(input)[0],resource=producer.freshResource(target,node);
    assert.ok(resource);assert.equal(producer.resolve(target,node).shared,false);
    doc.animation.frames[0].layers[0].content.value.pixels[0]=9;
    assert.equal(producer.isCurrent(),false);assert.equal(producer.freshResource(target,node),null);
    const edited=clean(input,options),nativeID=freshAssignments(edited)[0].right.value;
    assert.equal(decodeAnimationJres(JSON.parse(edited.files['images.g.jres'])[`myAnimations.${nativeID}`]).frames[0].pixels[0],9);
    const callbackDocument=document(),callbackOptions={animationDocuments:[callbackDocument]};let calls=0;
    callbackOptions.costumePalette=()=>{calls++;callbackDocument.animation.frames[0].durationMs=200;return ARCADE_PALETTE;};
    const changed=projectJsonToArcade(JSON.stringify(project()),callbackOptions);
    assert.ok(calls>0);assert.ok(changed.unsupported.some(reason=>reason.includes('documents changed')));
    for(const assignment of freshAssignments(changed))assert.equal(assignment.right.type,'Call');
});
