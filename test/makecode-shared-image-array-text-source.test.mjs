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


test('private Text inherited edge setters preserve each actual write and shared Image selection',()=>{
    const source=array+'let label=textsprite.create("a");label.left=2;label.right=160;label.top=1;label.bottom=90;let selected=pictures[0];label.setIcon(pictures[0]);';
    const b=boundary(fixture(source)),result=finish(b);assert.ok(result.resource);
    const writes=b.normalized.body.filter(node=>node.type==='ExpressionStatement').map(node=>node.expr).filter(node=>node.type==='Assignment'&&node.left?.type==='Member');
    assert.deepEqual(writes.map(node=>node.left.name),['left','right','top','bottom']);
    assert.deepEqual(writes.map(node=>node.right.value),['2','160','1','90']);
    const converted=convert(b.prepared.files);clean(converted);assert.equal(frames(converted.code).length,2);assert.doesNotMatch(converted.code,/new array reference/);
    const setterOffsets=['left','right','top','bottom'].map(property=>{const matches=[...converted.code.matchAll(new RegExp('arcade set '+property+' of ','g'))];assert.equal(matches.length,1,property+' actual emitted setter');return matches[0].index;});
    assert.deepEqual([...setterOffsets].sort((a,b)=>a-b),setterOffsets,'actual setters retain source evaluation order');
});
test('Text edge non-exposure does not admit unrelated unknown computed or nonplain writes',()=>{
    for(const statement of ['label.width=4;','label.height=4;','label.image=pictures[0];','label.unknown=1;','label["right"]=2;','label.right+=2;','label.right++;','delete label.right;']){
        const b=boundary(fixture(array+'let label=textsprite.create("a");'+statement+'let selected=pictures[0];'));
        assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,statement);
    }
});
test('Text geometry permission requires every actual receiver writer and the private source receipt',()=>{
    for(const producer of ['{}','3','external()','sprites.create(img`1`,SpriteKind.Player)']){
        const b=boundary(fixture(array+'let label=textsprite.create("a");label='+producer+';label.right=4;let selected=pictures[0];'));
        assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,producer);
    }
    const f=fixture(array+'let label=textsprite.create("a");label.right=4;let selected=pictures[0];');
    const copied={...f.prepared.files},ordinary=lowerNamespaceBindings(parse(arcadeProjectSource(copied).source),{spriteKinds:true,textSpriteInitializer:true});
    assert.equal(prepareSharedImageArrayTransport(ordinary.program),null);
});
test('inherited Text edge writes retain unknown effects and do not widen ordinary Sprite effects',()=>{
    for(const source of [array+'let label=sprites.create(img`1`,SpriteKind.Player);label.right=4;let selected=pictures[0];',
        array+'let label=textsprite.create("a");label.right=4;unknown();let selected=pictures[0];',
        array+'let label=textsprite.create("a");label.top=1;function unused(){label.foreign=3;}let selected=pictures[0];']){
        const b=boundary(fixture(source));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null);
    }
});


test('exact current music playback modes preserve the original retained command without a playable producer',()=>{
    for(const mode of ['UntilDone','InBackground','LoopingInBackground']){
        const source='function audio(thisSong:any){music.play(thisSong,music.PlaybackMode.'+mode+');}'+array+'let selected=pictures[0];';
        const b=boundary(fixture(source)),f=finish(b);assert.ok(f.resource);
        const fn=b.normalized.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='audio');assert.ok(fn);
        assert.equal(fn.body.length,1);assert.equal(fn.body[0].expr.callee.name,'play');assert.equal(fn.body[0].expr.args[0].name,'thisSong');assert.equal(fn.body[0].expr.args[1].name,mode);
        const r=convert(b.prepared.files);clean(r);assert.doesNotMatch(r.code,/new array reference/);assert.equal(frames(r.code).length,1);
        assert.equal(r.code.split('arcade play music ').length-1,1);assert.ok(r.code.includes('mode '+mode));
        assert.equal((r.sourceReferences||[]).some(row=>row.name==='thisSong'&&row.type==='Playable'),false,'no playable result is issued by the effect rule');
    }
});
test('music effect requires exact callee arity fixed enum and unmodified SDK roots',()=>{
    for(const statement of ['music.play();','music.play(value);','music.play(value,music.PlaybackMode.InBackground,3);','music.play(value,1);','music.play(value,mode);',
        'music.play(value,music.PlaybackMode.Unknown);','music.play(value,music.PlaybackMode["InBackground"]);','music["play"](value,music.PlaybackMode.InBackground);',
        'new music.play(value,music.PlaybackMode.InBackground);','music.play<number>(value,music.PlaybackMode.InBackground);',
        'music.play=other;music.play(value,music.PlaybackMode.InBackground);','music.PlaybackMode.InBackground=3;music.play(value,music.PlaybackMode.InBackground);',
        'let escaped=music.play;music.play(value,music.PlaybackMode.InBackground);','music.playTone(440,20);']){
        const b=boundary(fixture(array+'let value=1;let mode=1;'+statement+'let selected=pictures[0];'));
        assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,statement);
    }
    const shadow=boundary(fixture(array+'function retained(music:any){music.play(1,music.PlaybackMode.InBackground);}let selected=pictures[0];'));
    assert.equal(prepareSharedImageArrayTransport(shadow.normalized,{sourceContext:shadow.context}),null);
});
test('music non-exposure retains invalid value commands but refuses the whole private frame Array',()=>{
    for(const value of ['1','null','pictures[0]']){
        const b=boundary(fixture(array+'music.play('+value+',music.PlaybackMode.InBackground);let selected=pictures[0];'));
        const f=finish(b);assert.ok(f.resource);const r=convert(b.prepared.files);clean(r);assert.match(r.code,/arcade play music /);
        assert.doesNotMatch(r.code,/new array reference/,'effect proof does not manufacture a playable or expose private backing');
    }
    const b=boundary(fixture(array+'music.play(pictures,music.PlaybackMode.InBackground);let selected=pictures[0];'));
    assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,'whole backing Array argument remains an escape');
});
test('music effects never permit prefix movement or erase unknown effects in retained bodies',()=>{
    for(const source of ['music.play(1,music.PlaybackMode.InBackground);'+array+'let selected=pictures[0];',
        array+'music.play(unknown(),music.PlaybackMode.InBackground);let selected=pictures[0];',
        array+'function unused(){music.play(1,music.PlaybackMode.InBackground);unknown();}let selected=pictures[0];']){
        const b=boundary(fixture(source));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null);
    }
});


test('fixed music command proof refuses method values returned stored captured or passed',()=>{
    for(const extra of ['let escaped=music.play;', 'function unused(){return music.play;}',
        'function unused(){let captured=music.play;return 1;}', 'let captured=()=>music.play;',
        'let holder={play:music.play};', 'console.log(music.play);', 'music.play;']){
        const b=boundary(fixture(array+extra+'music.play(1,music.PlaybackMode.InBackground);let selected=pictures[0];'));
        assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,extra);
    }
    const b=boundary(fixture('function unused(value:any){return music.play(value,music.PlaybackMode.InBackground);}'+array+'let selected=pictures[0];'));
    assert.ok(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),'the actual direct callee remains valid inside a complete retained return expression; no playable or return-value fact is issued');
});


import {sourceImageArrayCloneEffects,analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const entryNodes=program=>{
    const out=[],seen=new Set(),visit=node=>{if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);if(!Array.isArray(node))out.push(node);for(const key of Object.keys(node))if(!['originalBody','parameterDefaults','paramTypes','bwProcedureConstraintSource'].includes(key))visit(node[key]);};visit(program);return out;
};
const entryClones=program=>entryNodes(program).filter(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='clone');
const imageEntrySource=array+`let ordinary: Image[];
function initialize(){let temp:Image[]=[];temp.push(pictures[0].clone());ordinary=temp;}
function use(){let result=ordinary[((Math.round(0)%(0+1))+(0+1))%(0+1)].clone();}
initialize();use();`;

test('Image Array clone entry query proves actual startup push aliases without changing generic missing-element facts',()=>{
    const program=parse(imageEntrySource),clones=entryClones(program);assert.equal(clones.length,2);
    const commands=entryNodes(program).filter(node=>node.type==='ExpressionStatement');assert.ok(commands.length>=4);
    assert.ok(commands.every(node=>Object.hasOwn(node,'expr')&&!Object.hasOwn(node,'expression')),'actual parser command field is expr');
    const proof=sourceImageArrayCloneEffects(program);assert.ok(proof);assert.ok(clones.every(call=>proof.has(call)));
    const read=clones[1].callee.object,ordinary=analyseSourceValueProducers(program,{arrayValues:true,parenthesized:true});
    assert.ok(ordinary.typesAt(read).size!==1||!ordinary.typesAt(read).has('Image'),'the effect query must not mint generic exact Image facts');
    const generic=parse('let xs=['+image+'];let value=xs[0];'),genericGraph=analyseSourceValueProducers(generic,{arrayValues:true,parenthesized:true});
    const genericRead=entryNodes(generic).find(node=>node.type==='Index');assert.ok(genericGraph.typesAt(genericRead).has('Undefined'),'ordinary known Array read keeps missing-element Undefined');
    const renamed=parse(imageEntrySource.replaceAll('pictures','authoredImages').replaceAll('ordinary','view'));
    const renamedProof=sourceImageArrayCloneEffects(renamed);assert.ok(entryClones(renamed).every(call=>renamedProof.has(call)),'author names confer no permission');
    assert.equal(proof.has({...clones[1]}),false,'copied call identity has no entry observation');
});
test('public shared transport retains ordinary startup Array allocation push reads and clone positions',()=>{
    const b=boundary(fixture(imageEntrySource)),f=finish(b);assert.deepEqual([...f.resource.frames.keys()],['pictures']);
    const r=convert(b.prepared.files);clean(r);assert.match(r.code,/new array reference/);assert.match(r.code,/push/);
    assert.ok(frames(r.code).length>0,'only the actual canonical literal backing has resource authority');
    const creator=new Creator();creator.parse(r.code);record({stage:'image-entry-public-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    assert.ok(creator.project.targets.some(target=>Object.values(target.blocks).some(node=>node.opcode==='arrays_mutateReference')));
});
test('Image clone entry facts require initialization at every actual immutable caller',()=>{
    for(const tail of ['initialize();use();use();','function second(){use();}initialize();use();second();']){
        const p=parse(imageEntrySource.slice(0,imageEntrySource.lastIndexOf('initialize();use();'))+tail),proof=sourceImageArrayCloneEffects(p);
        assert.ok(proof);assert.ok(entryClones(p).every(call=>proof.has(call)),tail);
    }
    for(const tail of ['use();initialize();use();','initialize();use();ordinary=[];use();','function second(){use();}second();initialize();use();']){
        const p=parse(imageEntrySource.slice(0,imageEntrySource.lastIndexOf('initialize();use();'))+tail),proof=sourceImageArrayCloneEffects(p);
        assert.ok(!proof||!proof.has(entryClones(p).at(-1)),tail);
    }
});
test('Image clone entry facts refuse missing sparse mixed shrink dynamic and unproved paths',()=>{
    for(const source of [
        array+'let ordinary:Image[];function use(){ordinary[0].clone();}use();',
        array+'let ordinary:Image[]=[];ordinary[0].clone();',
        array+'let ordinary:Image[]=[];ordinary.push(pictures[0]);ordinary[1].clone();',
        array+'let ordinary:any[]=[pictures[0],"bad"];ordinary[0].clone();',
        imageEntrySource.replace('ordinary=temp;','temp.pop();ordinary=temp;'),
        imageEntrySource.replace('ordinary=temp;','temp.length=0;ordinary=temp;'),
        imageEntrySource.replace('ordinary=temp;','temp[0]=unknown();ordinary=temp;'),
        imageEntrySource.replace('Math.round(0)','unknown()'),
        imageEntrySource.replace('initialize();use();','let escaped=use;initialize();use();'),
        imageEntrySource.replace('initialize();use();','initialize();unknown();use();'),
        imageEntrySource.replace('initialize();use();','function recurse(){recurse();use();}initialize();recurse();'),
        imageEntrySource.replace('initialize();use();','controller.A.onEvent(1,()=>use());initialize();use();'),
        imageEntrySource.replace('ordinary=temp;','return temp;'),
        imageEntrySource.replace('ordinary=temp;','temp.push(unknown());ordinary=temp;'),
        'function img(){return 1;}'+imageEntrySource,
        imageEntrySource+'function unused(){Math.round=unknown;}',
        imageEntrySource.replace('initialize();use();','let extracted=image.create;initialize();use();')]){
        const p=parse(source),proof=sourceImageArrayCloneEffects(p);assert.ok(!proof||!proof.has(entryClones(p).at(-1)),source);
    }
});
test('Image clone entry expiry is sticky for physical edits and restored descriptor shapes',()=>{
    const p=parse(imageEntrySource),call=entryClones(p)[1],proof=sourceImageArrayCloneEffects(p);assert.ok(proof.has(call));
    const args=call.args;call.args=[];assert.equal(proof.has(call),false);call.args=args;assert.equal(proof.has(call),false);
    const q=parse(imageEntrySource),other=entryClones(q)[1];assert.equal(proof.has(other),false);
    const fresh=sourceImageArrayCloneEffects(q);assert.ok(fresh.has(other),'new current parse requires an independent proof');
});
test('Image clone entry admission rejects accessors cycles shared syntax and caller Array methods before graph analysis',()=>{
    for(const mutate of [p=>Object.defineProperty(p,'extra',{get(){throw Error('not read');}}),p=>{p.extra=p;},p=>{p.body.push(p.body[0]);},p=>{p.body.forEach=()=>{throw Error('not called');};},p=>{Object.setPrototypeOf(p.body,null);},p=>{p.body.forEach=0;},p=>{p.body.find(node=>node.type==='FunctionDeclaration').params.includes=0;},p=>{const command=p.body.find(node=>node.type==='ExpressionStatement');command.expression=command.expr;delete command.expr;}]){
        const p=parse(imageEntrySource);mutate(p);assert.equal(sourceImageArrayCloneEffects(p),null);
    }
    const p=parse('let kind=SpriteKind.create();let ordinary:Image[]=['+image+'];ordinary[kind].clone();'),proof=sourceImageArrayCloneEffects(p);
    assert.ok(!proof||entryClones(p).every(call=>!proof.has(call)),'stateful kind result must never be invented as constant zero');
});

import {prepareSharedImageEntryEffects,currentSharedImageEntryEffect,consumeSharedImageEntryEffects} from '../overlay/scratch-gui/src/lib/bw-makecode/shared-image-array-source-effects.js';
test('Image entry effect profile is current private syntax data and cannot be supplied or retained as a grant',()=>{
    const p=parse('Buffer.fromHex("0102");'+imageEntrySource),call=entryNodes(p).find(node=>node.type==='Call'&&node.callee?.name==='fromHex');
    assert.equal(sourceImageArrayCloneEffects(p,{}),null,'forged Text source context is never adopted');
    for(const prefix of ['let alias=controller.A;', 'let alias=music.PlaybackMode;'])assert.equal(sourceImageArrayCloneEffects(parse(prefix+imageEntrySource)),null,'nested SDK namespace values cannot escape the closed profile');
    for(const suffix of ['let method=label.setText;', 'function unused(){label.setText=unknown;}']) {
        const b=boundary(fixture(imageEntrySource+'let label=textsprite.create("x");'+suffix));
        assert.equal(sourceImageArrayCloneEffects(b.normalized,b.context),null,'proved Text methods cannot be extracted or overwritten');
    }
    assert.equal(currentSharedImageEntryEffect(p,{},call),null);
    const profile=prepareSharedImageEntryEffects(p);assert.ok(profile);
    assert.equal(currentSharedImageEntryEffect({...p},profile,call),null,'same shape is not same Program');
    assert.equal(currentSharedImageEntryEffect(p,profile,{...call}),null,'copied call has no effect');
    let retained;
    const result=consumeSharedImageEntryEffects(p,null,lookup=>{retained=lookup;assert.equal(lookup(call).kind,'disjoint-literal-buffer');return 7;});
    assert.equal(result,7);assert.equal(retained(call),null,'lookup has only synchronous derivation lifetime');
    const old=call.args;call.args=[];assert.equal(currentSharedImageEntryEffect(p,profile,call),null);call.args=old;
    assert.equal(currentSharedImageEntryEffect(p,profile,call),null,'restoring syntax cannot revive profile');
    const q=parse(imageEntrySource);assert.equal(consumeSharedImageEntryEffects(q,null,()=>{q.body.push({type:'Return',value:{type:'Undefined'}});return 1;}),null,'end fence refuses a mutated derivation');
});
test('Image entry preserves callbacks and rejects their shared scalar writes and yielding paths',()=>{
    const head=imageEntrySource.slice(0,imageEntrySource.lastIndexOf('initialize();use();'));
    const harmless=parse(head+'initialize();info.onCountdownEnd(()=>{let unrelated=1;});use();'),okay=sourceImageArrayCloneEffects(harmless);
    assert.ok(okay?.has(entryClones(harmless).at(-1)),'retaining a stored handler is not executing or deleting its body');
    for(const tail of [
        'initialize();let index=0;info.onCountdownEnd(()=>{index=9;});ordinary[index].clone();',
        'initialize();let index=0;info.onCountdownEnd(()=>{index=9;});music.play(1,music.PlaybackMode.UntilDone);ordinary[index].clone();',
        'initialize();info.onCountdownEnd(()=>{ordinary=[];});use();',
        'initialize();info.onCountdownEnd(()=>{unknown(ordinary);});use();',
        'initialize();controller.A.onEvent(2049,()=>use());use();',
        'initialize();music.play(1,music.PlaybackMode.InBackground);use();']){
        const p=parse(head+tail),proof=sourceImageArrayCloneEffects(p);assert.ok(!proof||!proof.has(entryClones(p).at(-1)),tail);
    }
    const source=head+'initialize();info.onCountdownEnd(()=>{unknown();});use();',b=boundary(fixture(source));
    assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,'an unrelated unknown handler body is retained and still refuses the whole F effect census');
    const later=parse(head+'initialize();use();unknown();'),prior=sourceImageArrayCloneEffects(later);
    assert.ok(prior?.has(entryClones(later).at(-1)),'a completed exact earlier entry does not turn a later unknown call into a no-op');
    const f=boundary(fixture(head+'initialize();use();unknown();'));assert.equal(prepareSharedImageArrayTransport(f.normalized,{sourceContext:f.context}),null);
});
test('Image entry follows ordered startup generations and a constant registration guard without callback value facts',()=>{
    const source=`let authored:Image[]=[${image}];let first:Image[];let second:Image[];let ordinary:Image[];
function firstStartup(){let temp:Image[]=[];temp.push(authored[0].clone());first=temp;secondStartup();}
function secondStartup(){let temp:Image[]=[];temp.push(first[0].clone());second=temp;lastStartup();}
function lastStartup(){let temp:Image[]=[];temp.push(second[0].clone());ordinary=temp;
image.setPalette(Buffer.fromHex("000000"));info.onCountdownEnd(()=>{let unrelated=1;});registerOverlap();
controller.A.onEvent(2049,()=>{let unrelated=2;});court();}
function registerOverlap(){if(!((0+0)<(0+1)))return;sprites.onOverlap(SpriteKind.Projectile,SpriteKind.Player,(a:Sprite,b:Sprite)=>{let unrelated=3;});}
function court(){scene.setBackgroundImage(ordinary[((Math.round(0)%(0+1))+(0+1))%(0+1)].clone());}
firstStartup();`;
    const p=parse(source),proof=sourceImageArrayCloneEffects(p);assert.ok(proof);assert.equal(entryClones(p).length,4);
    assert.ok(entryClones(p).every(call=>proof.has(call)),'each real allocation/push/alias generation precedes this exact finite entry');
    const reversed=parse(source.replace('registerOverlap();','court();registerOverlap();').replace('firstStartup();','court();firstStartup();'));
    assert.ok(!sourceImageArrayCloneEffects(reversed)?.has(entryClones(reversed).at(-1)),'early entry cannot borrow a later startup');
    const reset=parse(imageEntrySource),last=reset.body.at(-1);assert.equal(last.type,'ExpressionStatement');
    reset.body.splice(reset.body.length-1,0,{type:'SpriteKindReset',name:'ordinary'});
    assert.ok(!sourceImageArrayCloneEffects(reset)?.has(entryClones(reset).at(-1)),'actual reset writes Undefined before the receiver read');
    const kind=boundary(fixture('namespace SpriteKind {export const Goal=SpriteKind.create();}'+imageEntrySource));
    assert.ok(entryNodes(kind.normalized).some(node=>node.type==='SpriteKindReset'));
    const kindProof=sourceImageArrayCloneEffects(kind.normalized,kind.context);assert.ok(kindProof?.has(entryClones(kind.normalized).at(-1)),'genuine parser/namespace kind reset stays in its actual binding and order');
    const callback=parse(source.replace('let unrelated=2;','court();'));
    assert.ok(!sourceImageArrayCloneEffects(callback)?.has(entryClones(callback).at(-1)),'callback-owned court entry cannot borrow startup observations');
});
