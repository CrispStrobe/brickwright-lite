import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {arcadeProjectSource} from '../overlay/scratch-gui/src/lib/bw-makecode/project-source.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {TEXT_SPRITE_SOURCE_TEXT,TEXT_SPRITE_INITIALIZER,TEXT_SPRITE_NATIVE_IDENTITY as identity} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {capturePreparedSharedImageSources,parseSharedImageSourceBoundary,parseSharedImageSourceProgram,bindPreparedSharedImageSource,currentSharedImageSourceEffects,sharedImageSourceContextCurrent,sharedImageSourceOrigin} from '../overlay/scratch-gui/src/lib/bw-makecode/shared-image-array-source-effects.js';
import {prepareSharedImageArrayTransport,projectSharedImageArrayTransport,finishSharedImageArrayTransport,currentSharedImageArrayTransport} from '../overlay/scratch-gui/src/lib/bw-makecode/source-shared-image-array-transport.js';

// Source-model package inputs use the complete actual admitted library text.
// These controls do not claim a fresh original SDK preparation or native run.
const image='img`1 .\n. 2`',array=`let pictures:Image[]=[${image}];`;
const main=array+'let selected=pictures[0];let label=textsprite.create("a");label.setIcon(pictures[0]);label.setText("b");label.setPosition(4,5);console.log(selected.getPixel(0,0));';
const fixture=(text=main)=>{
    const original={'main.ts':text,'pxt.json':JSON.stringify({files:['main.ts'],dependencies:{device:'*','arcade-text':'github:microsoft/arcade-text#'+identity.commit}})};
    const resolved={packages:{[identity.packageId]:{files:{[identity.filename]:TEXT_SPRITE_SOURCE_TEXT},resourceIds:[]}},sourceOrder:[{id:identity.packageId,file:identity.filename}],jres:{}};
    return {original,resolved,prepared:prepareArcadeDependencyInputs(original,resolved)};
};
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const channels=value=>Object.fromEntries(Object.keys(value).filter(key=>/unsupported|warn|error|unparsed|diagnostic|refusal/i.test(key)).map(key=>[key,value[key]]));
const clean=value=>{for(const [key,row]of Object.entries(channels(value)))assert.ok(Array.isArray(row)&&row.length===0,key+': '+JSON.stringify(row));};
const frames=code=>[...code.matchAll(/arcade frame image array "([^"]+)" index/g)];
const convert=files=>{const result=arcadeToPseudocode(files);record({stage:'private-text-source-import',files,result,channels:channels(result)});return result;};
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainWhenUsed:true,retainClassHeritage:true,retainOrdinaryDefaultProvenance:true,retainPrimitiveProcedureDefaults:true});
const boundary=(f=fixture())=>{
    const selected=arcadeProjectSource(f.prepared.files),preparation=capturePreparedSharedImageSources(f.prepared.files,selected);assert.ok(preparation);
    const observed=selected.entries.map(entry=>({entry,program:parseSharedImageSourceBoundary(preparation,entry)}));
    const input=parseSharedImageSourceProgram(preparation,selected.source),context=bindPreparedSharedImageSource(preparation,input);assert.ok(context);
    const normalized=lowerNamespaceBindings(input,{spriteKinds:true,textSpriteInitializer:true});assert.deepEqual(normalized.unsupported,[]);assert.ok(normalized.program);
    return {...f,selected,preparation,observed,input,context,normalized:normalized.program};
};
const finish=b=>{
    const prepared=prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context});assert.ok(prepared);
    const staged=lowerPxtStagedValues(prepared.program,{sharedImageArrayPlan:prepared.plan});
    const final=projectSharedImageArrayTransport(lowerLazyValues(staged),prepared.plan);assert.ok(final);assert.equal(finishSharedImageArrayTransport(final,prepared.plan),true);
    return {prepared,staged,final,resource:currentSharedImageArrayTransport(final)};
};
const carrier=program=>{
    const found=[],seen=new Set(),visit=node=>{if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);if(Object.hasOwn(node,sharedImageSourceOrigin))found.push(node);for(const value of Object.values(node))if(value&&typeof value==='object')visit(value);};visit(program);assert.equal(found.length,1);return found[0];
};

test('actual prepared Text source and existing parse returns bind one current physical initializer',()=>{
    const b=boundary();assert.equal(b.selected.entries[0].source,TEXT_SPRITE_INITIALIZER);assert.equal(b.observed.length,b.selected.entries.length);
    assert.equal(sharedImageSourceContextCurrent(b.context),true);const fact=currentSharedImageSourceEffects(b.normalized,b.context);assert.ok(fact);assert.equal(fact.initializer,carrier(b.normalized));
    assert.notEqual(fact.initializer,carrier(b.input),'normalization supplies a fresh physical occurrence');
    assert.equal(currentSharedImageSourceEffects(b.input,b.context),null,'an unlowered namespace is not the final initializer binding');
});
test('private Text factory and inherited Sprite methods retain shared Image aliases',()=>{
    const b=boundary(),f=finish(b);assert.ok(f.resource);assert.deepEqual([...f.resource.frames.keys()],['pictures']);
    const r=convert(b.prepared.files);clean(r);assert.equal(frames(r.code).length,2);assert.doesNotMatch(r.code,/new array reference/);
});
test('public Text source controls retain Code SB3 artwork export and a fresh source-model reprepare',async()=>{
    const f=fixture(),r=convert(f.prepared.files);clean(r);const creator=new Creator();creator.parse(r.code);record({stage:'private-text-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    for(const item of r.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    const code=creator.decompile();assert.ok(code);record({stage:'private-text-Code',code});
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');record({stage:'private-text-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'private-text-export',result:exported,channels:channels(exported)});clean(exported);
    const refreshed=prepareArcadeDependencyInputs(exported.files,fixture().resolved),again=convert(refreshed.files);clean(again);assert.equal(frames(again.code).length,frames(r.code).length);assert.doesNotMatch(again.code,/new array reference/);
});
test('copied files public flags and forged context cannot issue Text effect permission',()=>{
    const f=fixture(),copy={...f.prepared.files};assert.equal(capturePreparedSharedImageSources(copy,arcadeProjectSource(copy)),null);
    const r=convert(copy),creator=new Creator();creator.parse(r.code);
    record({stage:'copied-private-text-Creator',project:creator.project,channels:channels(creator),code:r.code});clean(creator);
    const rows=creator.project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
    const only=opcode=>{const found=rows.filter(row=>row.node.opcode===opcode);assert.equal(found.length,1,opcode);return found[0];};
    const literal=(row,name)=>{const input=row.node.inputs[name];assert.equal(input[0],1);assert.equal(input[1][0],10);return input[1][1];};
    const edge=(owner,name,opcode)=>{const id=owner.node.inputs[name][1];assert.equal(typeof id,'string');const node=owner.target.blocks[id];assert.ok(node);assert.equal(node.opcode,opcode);assert.equal(node.parent,owner.id);return {target:owner.target,id,node};};
    const cells=creator.project.targets.flatMap(target=>Object.entries(target.variables).filter(([,value])=>value[0]==='pictures').map(([id])=>({target,id})));
    assert.equal(cells.length,1);assert.equal(cells[0].target.isStage,true);
    const writes=rows.filter(row=>row.node.opcode==='data_setvariableto'&&row.node.fields.VARIABLE[1]===cells[0].id);assert.equal(writes.length,1);assert.equal(writes[0].node.fields.VARIABLE[0],'pictures');
    const create=only('arrays_createReference'),local={target:create.target,id:create.node.parent,node:create.target.blocks[create.node.parent]};
    assert.equal(local.node.opcode,'arcade_setLocal');assert.equal(edge(local,'VALUE','arrays_createReference').id,create.id);
    const localName=literal(local,'NAME'),push=only('arrays_mutateReference');assert.equal(literal(push,'OP'),'push');
    assert.equal(literal(edge(push,'ARRAY','arcade_getLocal'),'NAME'),localName);
    const clone=edge(push,'VALUE','arcade_cloneImage'),image=edge(clone,'IMAGE','arcade_frameImage');assert.equal(only('arcade_frameImage').id,image.id);
    assert.notEqual(literal(image,'KEY'),'pictures','ordinary Image initializer is not the private pictures resource');
    assert.equal(literal(edge(writes[0],'VALUE','arcade_getLocal'),'NAME'),localName);
    assert.equal(local.node.next,push.id);assert.equal(push.node.parent,local.id);assert.equal(push.node.next,writes[0].id);assert.equal(writes[0].node.parent,push.id);
    const reads=rows.filter(row=>row.node.opcode==='arrays_referenceItem');assert.equal(reads.length,2);
    for(const row of reads){assert.deepEqual(row.node.inputs.ARRAY[1],[12,'pictures',cells[0].id]);assert.deepEqual(row.node.inputs.INDEX,[1,[4,'0']]);}
    const selected=reads.filter(row=>row.target.blocks[row.node.parent].opcode==='data_setvariableto');assert.equal(selected.length,1);assert.equal(selected[0].target.blocks[selected[0].node.parent].fields.VARIABLE[0],'selected');
    const icon=only('arcade_textSpriteSetIcon');assert.equal(edge(icon,'IMAGE','arrays_referenceItem').id,reads.find(row=>row.id!==selected[0].id).id);
    const ordinary=lowerNamespaceBindings(parse(arcadeProjectSource(copy).source),{spriteKinds:true,textSpriteInitializer:true});assert.deepEqual(ordinary.unsupported,[]);assert.equal(prepareSharedImageArrayTransport(ordinary.program),null,'copied input has no private Text effect proof');
    const b=boundary();assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:{}}),null);assert.equal(currentSharedImageSourceEffects(b.normalized,{}),null);
});
test('source-entry order and actual boundary identities cannot be substituted',()=>{
    const f=fixture(),selected=arcadeProjectSource(f.prepared.files),reversed={...selected,entries:[...selected.entries].reverse()};reversed.source=reversed.entries.map(row=>row.source).join('\n;\n');assert.equal(capturePreparedSharedImageSources(f.prepared.files,reversed),null);
    const preparation=capturePreparedSharedImageSources(f.prepared.files,selected);assert.ok(preparation);
    for(const entry of selected.entries)parseSharedImageSourceBoundary(preparation,{...entry});
    assert.equal(bindPreparedSharedImageSource(preparation,parseSharedImageSourceProgram(preparation,selected.source)),null);
    const missing=capturePreparedSharedImageSources(f.prepared.files,selected);assert.equal(bindPreparedSharedImageSource(missing,parseSharedImageSourceProgram(missing,selected.source)),null);
});
test('missing duplicate moved and changed actual initializer carriers expire source effects',()=>{
    for(const change of [
        program=>{delete carrier(program)[sharedImageSourceOrigin];},
        program=>{const owner=program.body.find(row=>row.type==='Declaration'&&row.decls.some(decl=>decl.init===carrier(program)));program.body.push(structuredClone(owner));},
        program=>{const i=program.body.findIndex(row=>row.type==='Declaration'&&row.decls.some(decl=>decl.init===carrier(program)));program.body.push(...program.body.splice(i,1));},
        program=>{carrier(program).args.push({type:'Number',value:'1'});}
    ]){const b=boundary();change(b.normalized);assert.equal(currentSharedImageSourceEffects(b.normalized,b.context),null);assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null);}
    const b=boundary();carrier(b.input).args.push({type:'Number',value:'1'});assert.equal(sharedImageSourceContextCurrent(b.context),false);assert.equal(currentSharedImageSourceEffects(b.normalized,b.context),null);
});
test('private source receipt does not excuse Text namespace shadows writers escapes or unsupported calls',()=>{
    for(const prefix of ['let textsprite=other;','textsprite.create=other;','let maker=textsprite.create;','let escaped=textsprite;']){
        const b=boundary(fixture(prefix+main));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,prefix);
    }
    for(const call of ['textsprite.create()','textsprite.create("a",0,1,2)','textsprite.create<number>("a")','new textsprite.create("a")','textsprite["create"]("a")']){
        const b=boundary(fixture(main.replace('textsprite.create("a")',call)));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,call);
    }
});
test('unrelated music Buffer and controller effects remain ordinary with complete unused bodies',()=>{
    for(const body of ['music.play(1,1);','Buffer.fromHex("00");','controller.A.onEvent(ControllerButtonEvent.Pressed,function(){});']){
        const b=boundary(fixture(main+'function retained(){'+body+'}')),before=structuredClone(b.normalized);assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,body);assert.deepEqual(b.normalized,before,'refusal keeps the full current unused body');
    }
    const b=boundary(fixture('game.onUpdate(function(){});'+main));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,'earlier registration still stops backing dominance');
});
test('Text annotations and unknown or mixed actual writers never seed private receivers',()=>{
    for(const writer of ['let label:TextSprite=other;','let label:TextSprite=null;','let label=textsprite.create("a");label=sprites.create(img`1`,SpriteKind.Player);']){
        const text=array+writer+'label.setText("b");let selected=pictures[0];console.log(selected.getPixel(0,0));',b=boundary(fixture(text));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,writer);
    }
    const b=boundary(fixture(array+'let label:TextSprite;label=textsprite.create("a");label=textsprite.create("b");label.setText("c");let selected=pictures[0];console.log(selected.getPixel(0,0));'));assert.ok(finish(b).resource);
});
test('actual file edits expire final private resource facts without reminting',()=>{
    const b=boundary(),f=finish(b);assert.ok(f.resource);b.prepared.files['main.ts']+='\n// changed';assert.equal(sharedImageSourceContextCurrent(b.context),false);assert.equal(currentSharedImageArrayTransport(f.final),null);
    b.prepared.files['main.ts']=b.original['main.ts'];assert.equal(sharedImageSourceContextCurrent(b.context),false,'observed issuer expiry stays expired');
});
test('source-context getters do not run and unchanged ordinary plans remain independent',()=>{
    const b=boundary();let calls=0;const options={};Object.defineProperty(options,'sourceContext',{get(){calls++;return b.context;}});assert.equal(prepareSharedImageArrayTransport(b.normalized,options),null);assert.equal(calls,0);
    const plain=parse(array+'let selected=pictures[0];console.log(selected.getPixel(0,0));');assert.ok(prepareSharedImageArrayTransport(plain));
});

test('only actual existing parser returns can issue source context and unknown bodies stay present',()=>{
    const f=fixture(main+'function retainedUnknown(){music.play(1,1);}'),selected=arcadeProjectSource(f.prepared.files);
    const preparation=capturePreparedSharedImageSources(f.prepared.files,selected);assert.ok(preparation);
    for(const entry of selected.entries){
        const fabricated=parseMakeCodeTs(entry.source,{parameterDefaults:true});
        for(const node of fabricated.body)if(node.type==='FunctionDeclaration'&&node.name==='retainedUnknown')node.body=[];
        const actual=parseSharedImageSourceBoundary(preparation,entry,fabricated);assert.notEqual(actual,fabricated);
        if(entry.name==='main.ts')assert.match(JSON.stringify(actual),/music/,'extra arguments cannot register a fabricated boundary return');
    }
    const fabricatedCombined=parse(selected.source);
    for(const node of fabricatedCombined.body)if(node.type==='FunctionDeclaration'&&node.name==='retainedUnknown')node.body=[];
    assert.equal(bindPreparedSharedImageSource(preparation,fabricatedCombined),null,'unissued combined AST cannot erase an unknown source effect');
    const unprovedProfile=parseSharedImageSourceProgram(preparation,selected.source,false,false);assert.equal(bindPreparedSharedImageSource(preparation,unprovedProfile),null,'caller profile mismatch cannot issue source provenance');
    const actual=parseSharedImageSourceProgram(preparation,selected.source);assert.match(JSON.stringify(actual),/music/);
    const context=bindPreparedSharedImageSource(preparation,actual);assert.ok(context);
    const normalized=lowerNamespaceBindings(actual,{spriteKinds:true,textSpriteInitializer:true});assert.deepEqual(normalized.unsupported,[]);
    assert.equal(prepareSharedImageArrayTransport(normalized.program,{sourceContext:context}),null,'genuine retained unknown body keeps ordinary fallback');
});
test('observed AST expiry is sticky for source context and already issued resource plans',()=>{
    const f=fixture(),selected=arcadeProjectSource(f.prepared.files),preparation=capturePreparedSharedImageSources(f.prepared.files,selected);
    for(const entry of selected.entries)parseSharedImageSourceBoundary(preparation,entry);
    const parsed=parseSharedImageSourceProgram(preparation,selected.source),body=parsed.body;parsed.body=[...body];
    assert.equal(bindPreparedSharedImageSource(preparation,parsed),null);parsed.body=body;
    assert.equal(bindPreparedSharedImageSource(preparation,parsed),null,'an observed expired parse return cannot issue later after restoration');
    for(const select of [b=>b.input,b=>b.observed[0].program]){
        const b=boundary(),f=finish(b),target=select(b),old=target.body;
        target.body=[...old];assert.equal(sharedImageSourceContextCurrent(b.context),false);
        target.body=old;assert.equal(sharedImageSourceContextCurrent(b.context),false,'restoration cannot revive the old source context');
        assert.equal(currentSharedImageArrayTransport(f.final),null,'restoration cannot revive the old final resource proof');
    }
});
