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


import {prepareProcedureConstraintSource,procedureConstraintAstMetadata} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
test('Image entry observes actual procedure metadata without delegating to its prefix operation',()=>{
    const p=parse(imageEntrySource),prepared=prepareProcedureConstraintSource(p);
    p.bwProcedureConstraintSource=procedureConstraintAstMetadata(prepared);
    assert.equal(typeof p.bwProcedureConstraintSource.prefix,'function');
    const proof=sourceImageArrayCloneEffects(p);assert.ok(proof);
    assert.ok(entryClones(p).every(call=>proof.has(call)));
    let calls=0;
    const q=parse(imageEntrySource),prefix=()=>{calls++;throw Error('metadata must not execute');};
    q.bwProcedureConstraintSource={prefix};
    const qProof=sourceImageArrayCloneEffects(q);assert.ok(qProof?.has(entryClones(q).at(-1)));
    prefix.unconsumed={arbitrary:1};
    prefix.toJSON=()=>{calls++;throw Error('opaque identity must not serialize');};
    assert.ok(qProof.has(entryClones(q).at(-1)),'opaque function own fields cannot affect consumed syntax or effects');
    assert.equal(calls,0);
});
test('Image entry metadata cannot supply missing entries or executable host functions',()=>{
    let calls=0;const prefix=()=>{calls++;return true;};
    for(const source of [imageEntrySource.replace('initialize();use();','use();'),
        imageEntrySource.replace('Math.round(0)','unknown()'),
        imageEntrySource.replace('ordinary=temp;','ordinary=temp;unknown();')]){
        const p=parse(source);p.bwProcedureConstraintSource={prefix};
        assert.ok(!sourceImageArrayCloneEffects(p)?.has(entryClones(p).at(-1)),source);
    }
    const p=parse(imageEntrySource);p.bwProcedureConstraintSource={prefix};
    p.body.at(-1).expr.callee=prefix;
    assert.equal(prepareSharedImageEntryEffects(p),null,'same metadata identity has no executable authority');
    assert.equal(sourceImageArrayCloneEffects(p),null);assert.equal(calls,0);
});
test('Image entry opaque metadata identity and descriptor changes expire permanently',()=>{
    for(const mutation of ['function','container','descriptor']){
        const p=parse(imageEntrySource),prefix=()=>[];
        p.bwProcedureConstraintSource={prefix};
        const call=entryClones(p).at(-1),proof=sourceImageArrayCloneEffects(p),profile=prepareSharedImageEntryEffects(p);
        assert.ok(proof?.has(call));assert.ok(profile);
        const old=p.bwProcedureConstraintSource,d=Object.getOwnPropertyDescriptor(old,'prefix');
        if(mutation==='function')old.prefix=()=>[];
        else if(mutation==='container')p.bwProcedureConstraintSource={prefix};
        else Object.defineProperty(old,'prefix',{...d,writable:false});
        assert.equal(currentSharedImageEntryEffect(p,profile,p,'current'),null);assert.equal(proof.has(call),false);
        p.bwProcedureConstraintSource=old;Object.defineProperty(old,'prefix',d);
        assert.equal(currentSharedImageEntryEffect(p,profile,p,'current'),null);assert.equal(proof.has(call),false);
    }
    const p=parse(imageEntrySource);p.bwProcedureConstraintSource={prefix:()=>[]};
    const proof=sourceImageArrayCloneEffects(p);assert.equal(proof.has({...entryClones(p).at(-1)}),false);
});
test('Image entry opaque observation does not widen the older source-origin snapshot',()=>{
    let calls=0;const f=fixture(),selected=arcadeProjectSource(f.prepared.files);
    selected.unconsumed=()=>{calls++;return true;};
    assert.equal(capturePreparedSharedImageSources(f.prepared.files,selected),null);
    assert.equal(calls,0);
});

test('Image entry consumed metadata containers remain observed data rather than opaque functions',()=>{
    let calls=0;const opaque=function(){calls++;};
    for(const key of ['optionalParams','parameterDefaults','typeParameters','originalBody','parameterProperties','paramTypes','returnType','assertedType']){
        const p=parse(imageEntrySource),fn=p.body.find(node=>node.type==='FunctionDeclaration');fn[key]=opaque;
        assert.equal(prepareSharedImageEntryEffects(p),null,key);
        assert.equal(sourceImageArrayCloneEffects(p),null,key);
        Object.defineProperty(opaque,'length',{value:1,configurable:true});
        assert.equal(prepareSharedImageEntryEffects(p),null,key+' remains rejected after opaque ownfield edit');
        Object.defineProperty(opaque,'length',{value:0,configurable:true});
    }
    for(const annotation of [{text:opaque},{isArray:opaque}]){
        const p=parse(imageEntrySource),fn=p.body.find(node=>node.type==='FunctionDeclaration');
        fn.paramTypes={unused:annotation};assert.equal(prepareSharedImageEntryEffects(p),null);
    }
    const p=parse(imageEntrySource),fn=p.body.find(node=>node.type==='FunctionDeclaration');
    fn.optionalParams=[];fn.parameterDefaults=[];fn.paramTypes={unused:{text:'number',isArray:false}};
    const profile=prepareSharedImageEntryEffects(p);assert.ok(profile);
    fn.optionalParams.push('unused');assert.equal(currentSharedImageEntryEffect(p,profile,p,'current'),null);
    fn.optionalParams.pop();assert.equal(currentSharedImageEntryEffect(p,profile,p,'current'),null);
    const q=parse(imageEntrySource+'info.onCountdownEnd((x=1)=>{let unrelated=1;});');
    const callback=entryNodes(q).find(node=>node.type==='FunctionExpression');assert.ok(callback);
    const hidden=()=>{calls++;};hidden.toJSON=()=>{calls++;return true;};
    callback.body[0].bwProcedureConstraintSource={prefix:hidden};
    assert.equal(prepareSharedImageEntryEffects(q),null,'all executable-body descendants remain host-function-free, including ignored metadata');
    assert.equal(sourceImageArrayCloneEffects(q),null);
    for(const withActualThrow of [false,true]){
        const r=parse(imageEntrySource+(withActualThrow?'function unused(){throw 1;}':''));
        r.bwProcedureConstraintSource={prefix:hidden};
        if(!withActualThrow)r.sourceScalarDeclarations={type:'ThrowStatement'};
        assert.equal(prepareSharedImageEntryEffects(r),null,'whole-Program serializer path cannot consume opaque root metadata');
        assert.equal(sourceImageArrayCloneEffects(r),null);
    }
    for(const domain of ['consumed','body','whole-program']){
        const r=parse(imageEntrySource+(domain==='whole-program'?'function unused(){throw 1;}':''));
        if(domain==='consumed')r.body.find(node=>node.type==='FunctionDeclaration').paramTypes={unused:{text:1n}};
        else if(domain==='body')r.body[0].bwProcedureConstraintSource={unconsumed:1n};
        else r.sourceScalarDeclarations=1n;
        assert.equal(prepareSharedImageEntryEffects(r),null,domain+' must refuse before serializer helpers');
        assert.equal(sourceImageArrayCloneEffects(r),null);
    }
    assert.equal(calls,0);
});


import {sourceOverlapDestroyNonExposure} from '../overlay/scratch-gui/src/lib/bw-makecode/shared-image-array-source-effects.js';
const overlapDestroySource=array+`let recent:Sprite;
function destroyRecent(){recent.destroy();}
function initialize(){recent=null;sprites.onOverlap(SpriteKind.Player,SpriteKind.Projectile,function(first:Sprite,second:Sprite){
let one:Sprite=null;let two:Sprite=null;let three:Sprite=null;let four:Sprite=null;
one=first;two=one;three=two;four=three;recent=four;destroyRecent();});}
initialize();let selected=pictures[0];console.log(selected.getPixel(0,0));`;
const destroys=p=>entryNodes(p).filter(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='destroy');
// Read actual current Creator roles and physical graph edges, independent of
// generated token/procedure/variable spellings or random block identities.
const assertOverlapDestroyRoles=project=>{
    const all=project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,block])=>({target,id,block})));
    const unique=opcode=>{const rows=all.filter(row=>row.block.opcode===opcode);assert.equal(rows.length,1,opcode);return rows[0];};
    const destroy=unique('arcade_destroySprite'),registration=unique('arcade_registerOverlapHandler'),handler=unique('arcade_whenRegisteredOverlap');
    assert.equal(destroy.target,registration.target);assert.equal(destroy.target,handler.target);
    const blocks=destroy.target.blocks;
    const literal=input=>{assert.ok(Array.isArray(input)&&Array.isArray(input[1]));return input[1];};
    const token=row=>{const value=literal(row.block.inputs.TOKEN);assert.equal(value[0],10);assert.equal(typeof value[1],'string');assert.ok(value[1]);return value[1];};
    assert.equal(token(registration),token(handler));assert.equal(handler.block.parent,null);assert.equal(handler.block.topLevel,true);
    assert.deepEqual(literal(registration.block.inputs.CAPTURES),[10,'']);
    for(const [slot,name]of [['KIND','Player'],['OTHER_KIND','Projectile']]){const kind=blocks[registration.block.inputs[slot][1]];assert.equal(kind.opcode,'arcade_spriteKindValue');assert.equal(kind.parent,registration.id);assert.deepEqual(literal(kind.inputs.NAME),[10,name]);}
    const variable=literal(destroy.block.inputs.ID);assert.equal(variable[0],12);assert.equal(typeof variable[2],'string');
    const owners=project.targets.filter(target=>Object.hasOwn(target.variables,variable[2]));assert.equal(owners.length,1);assert.equal(owners[0].variables[variable[2]][0],variable[1]);
    const definitions=new Map();
    for(const [id,block]of Object.entries(blocks))if(block.opcode==='procedures_definition'){
        const prototype=blocks[block.inputs.custom_block[1]];assert.equal(prototype.opcode,'procedures_prototype');assert.equal(prototype.parent,id);
        const code=prototype.mutation.proccode;assert.ok(!definitions.has(code));definitions.set(code,id);
    }
    const trace=root=>{
        const result=[],active=new Set();
        const body=id=>{assert.ok(!active.has(id),'no recursive role traversal');active.add(id);let prior=id,next=blocks[id].next;
            while(next){const block=blocks[next];assert.ok(block);assert.equal(block.parent,prior);result.push(next);
                if(block.opcode==='procedures_call'){const definition=definitions.get(block.mutation.proccode);assert.ok(definition,'actual matching procedure body');body(definition);}
                prior=next;next=block.next;assert.ok(result.length<10000);
            }active.delete(id);
        };body(root);return result;
    };
    const handlerTrace=trace(handler.id);assert.ok(handlerTrace.includes(destroy.id),'registered handler reaches physical destroy through current procedure calls');
    const starts=Object.entries(blocks).filter(([_id,b])=>b.opcode==='arcade_whenSourceStarts');assert.equal(starts.length,1);
    const startupTrace=trace(starts[0][0]);assert.ok(startupTrace.includes(registration.id),'registration belongs to actual connected source startup');
    const sameCell=block=>block.opcode==='data_setvariableto'&&block.fields.VARIABLE[1]===variable[2];
    const startupWrites=startupTrace.filter(id=>sameCell(blocks[id]));assert.ok(startupWrites.length);assert.ok(startupWrites.every(id=>startupTrace.indexOf(id)<startupTrace.indexOf(registration.id)));
    const writes=handlerTrace.filter(id=>sameCell(blocks[id]));assert.equal(writes.length,1);assert.ok(handlerTrace.indexOf(writes[0])<handlerTrace.indexOf(destroy.id));
    const locals=new Map();let incoming;
    const origin=(input,parent)=>{
        if(Array.isArray(input[1]))return undefined;
        assert.equal(typeof input[1],'string');const node=blocks[input[1]];assert.ok(node);assert.equal(node.parent,parent);
        if(node.opcode==='arcade_eventSprite')return node.fields.WHICH[0];
        if(node.opcode==='arcade_getLocal'){const name=literal(node.inputs.NAME);assert.equal(name[0],10);return locals.get(name[1]);}
        return undefined;
    };
    for(const id of handlerTrace){const block=blocks[id];
        if(block.opcode==='arcade_setLocal'){const name=literal(block.inputs.NAME);assert.equal(name[0],10);locals.set(name[1],origin(block.inputs.VALUE,id));}
        if(id===writes[0])incoming=origin(block.inputs.VALUE,id);
    }
    assert.equal(incoming,'first','actual current local writer chain reaches first native event reporter');
    return {target:destroy.target.name,variableId:variable[2],variableOwner:owners[0].name,token:token(handler),handlerId:handler.id,registrationId:registration.id,destroyId:destroy.id,handlerTrace,startupTrace,incoming};
};

test('F overlap destroy nonexposure follows actual incoming parameters and dominating complete aliases only',()=>{
    const p=parse(overlapDestroySource),proof=sourceOverlapDestroyNonExposure(p);assert.ok(proof);
    assert.equal(destroys(p).length,1);assert.equal(proof.has(destroys(p)[0]),true);
    const second=parse(overlapDestroySource.replace('one=first;','one=second;'));
    assert.ok(sourceOverlapDestroyNonExposure(second)?.has(destroys(second)[0]));
    const normalized=boundary(fixture(overlapDestroySource)),transport=finish(normalized);
    assert.deepEqual([...transport.resource.frames.keys()],['pictures']);
    assert.equal(typeof proof.has(destroys(p)[0]),'boolean','no Sprite kind/value token is exposed');
});
test('F overlap destroy public pipeline preserves actual registration and destroy through SB3 export and reimport',async()=>{
    const imported=convert(fixture(overlapDestroySource).prepared.files);clean(imported);
    assert.ok(frames(imported.code).some(row=>row[1]==='pictures'));assert.match(imported.code,/arcade destroy/);
    const creator=new Creator();creator.parse(imported.code);
    for(const item of imported.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    record({stage:'overlap-destroy-public-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    const roles=assertOverlapDestroyRoles(creator.project);record({stage:'overlap-destroy-public-current-roles',roles});
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};
    for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');
    record({stage:'overlap-destroy-public-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'overlap-destroy-public-export',result:exported,channels:channels(exported)});clean(exported);
    const refreshed=prepareArcadeDependencyInputs(exported.files,fixture().resolved),reimported=convert(refreshed.files);clean(reimported);assert.match(reimported.code,/arcade destroy/);
    assert.equal((reimported.code.match(/arcade destroy/g)||[]).length,1);
    const again=new Creator();again.parse(reimported.code);record({stage:'overlap-destroy-reimport-Creator',project:again.project,channels:channels(again)});clean(again);
    const againRoles=assertOverlapDestroyRoles(again.project);record({stage:'overlap-destroy-reimport-current-roles',roles:againRoles});
    assert.equal((reimported.code.match(/new array reference/g)||[]).length,(imported.code.match(/new array reference/g)||[]).length);
});
test('F overlap destroy refuses forged or escaped registrations and parameter provenance',()=>{
    for(const source of [
        overlapDestroySource.replace('sprites.onOverlap(', 'fake.onOverlap('),
        'let sprites=unknown;'+overlapDestroySource,
        overlapDestroySource+'sprites.onOverlap=unknown;',
        overlapDestroySource.replace('function initialize(){','let extracted=sprites.onOverlap;function initialize(){'),
        overlapDestroySource.replace('function(first:Sprite,second:Sprite)','function(first:Sprite,first:Sprite)'),
        overlapDestroySource.replace('function(first:Sprite,second:Sprite)','function(first:Sprite)'),
        overlapDestroySource.replace('one=first;','first=unknown;one=first;'),
        overlapDestroySource.replace('one=first;','one=foreign;'),
        overlapDestroySource.replace('one=first;','let first:Sprite=null;one=first;'),
        overlapDestroySource.replace('one=first;','function first(){}one=first;'),
        overlapDestroySource.replace('one=first;','class first{}one=first;'),
        overlapDestroySource.replace('one=first;','one=second;second=unknown;')]){
        const p=parse(source),proof=sourceOverlapDestroyNonExposure(p);assert.ok(!proof||!proof.has(destroys(p)[0]),source);
    }
});
test('F overlap destroy refuses mixed writers, early ordinary entries and unknown alias mutations',()=>{
    for(const source of [
        overlapDestroySource+'recent=pictures[0];',
        overlapDestroySource+'recent=[];',
        overlapDestroySource+'recent=unknown;',
        overlapDestroySource+'recent+=unknown;',
        overlapDestroySource+'recent++;',
        overlapDestroySource.replace('four=three;','four=three;four.data=unknown;'),
        overlapDestroySource.replace('recent=four;destroyRecent();','destroyRecent();recent=four;'),
        overlapDestroySource.replace('recent=four;','if(true){recent=four;}'),
        overlapDestroySource.replace('initialize();let selected','initialize();destroyRecent();let selected'),
        overlapDestroySource.replace('initialize();let selected','initialize();initialize();let selected'),
        overlapDestroySource.replace('recent=null;sprites.onOverlap(', 'sprites.onOverlap(').replace('});}\ninitialize();','});recent=null;}\ninitialize();'),
        overlapDestroySource.replace('recent.destroy();','recent.destroy(1);'),
        overlapDestroySource.replace('recent.destroy();','recent.destroy<number>();'),
        overlapDestroySource+'let method=recent.destroy;',
        overlapDestroySource+'function method(){return recent.destroy;}',
        overlapDestroySource.replace('recent.destroy();','recent["destroy"]();'),
        overlapDestroySource.replace('recent.destroy();','new recent.destroy();'),
        overlapDestroySource.replace('recent.destroy();','destroyRecent();recent.destroy();'),
        overlapDestroySource+'let escaped=destroyRecent;',
        overlapDestroySource+'function destroyRecent(){}',
        overlapDestroySource.replace('let one:Sprite=null;','let one:Sprite=null;let one:Sprite=null;'),
        overlapDestroySource.replace('function destroyRecent(){','function destroyRecent(arg=unknown(pictures)){'),
        overlapDestroySource.replace('function initialize(){','function initialize(arg=unknown(pictures)){'),
        overlapDestroySource.replace('function destroyRecent(){','function destroyRecent(unused:Sprite){'),
        overlapDestroySource.replace('function destroyRecent(){','function destroyRecent<T>(){'),
        overlapDestroySource.replace('recent=four;destroyRecent();','recent=four;destroyRecent(1);'),
        overlapDestroySource.replace('initialize();let selected','initialize(1);let selected')]){
        const p=parse(source),proof=sourceOverlapDestroyNonExposure(p),fn=p.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='destroyRecent');
        const sites=entryNodes(fn).filter(node=>node.type==='Call');assert.ok(sites.length);assert.ok(!proof||sites.every(call=>!proof.has(call)),source);
    }
    // The current source parser deliberately rejects rest syntax. Mutate the
    // actual parsed positive function's consumed AST role instead of claiming
    // that unsupported source reached this effect proof.
    const rest=parse(overlapDestroySource),call=destroys(rest)[0],prior=sourceOverlapDestroyNonExposure(rest);assert.ok(prior?.has(call));
    const fn=rest.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='destroyRecent');assert.equal(Object.hasOwn(fn,'restParam'),false);fn.restParam='values';
    assert.equal(prior.has(call),false,'original actual proof expires on signature edit');
    assert.ok(!sourceOverlapDestroyNonExposure(rest)?.has(call),'fresh proof refuses an actual rest-marked function');
});
test('F overlap destroy preserves destroyed callback and unknown effect barriers',()=>{
    const withHandler=parse(overlapDestroySource+'sprites.onDestroyed(SpriteKind.Player,function(sprite:Sprite){console.log(1);});');
    assert.equal(sourceOverlapDestroyNonExposure(withHandler),null,'the full destroyed-handler graph is refused, never treated as harmless');
    const unknown=boundary(fixture(overlapDestroySource+'function unused(){unknown();}'));
    assert.equal(prepareSharedImageArrayTransport(unknown.normalized,{sourceContext:unknown.context}),null,'whole F retains all unused unknown bodies');
    const escaped=boundary(fixture(overlapDestroySource.replace('recent=four;','recent=four;unknown(pictures);')));
    assert.equal(prepareSharedImageArrayTransport(escaped.normalized,{sourceContext:escaped.context}),null,'private backing exposure remains forbidden');
    const reset=parse(overlapDestroySource),fn=entryNodes(reset).find(node=>node.type==='FunctionExpression');
    fn.body.splice(fn.body.length-1,0,{type:'SpriteKindReset',name:'recent'});
    assert.ok(!sourceOverlapDestroyNonExposure(reset)?.has(destroys(reset)[0]),'reset of the current binding is a real writer, not an incoming producer');
    const entry=parse(imageEntrySource.replace('initialize();use();','initialize();let sprite:Sprite=null;sprite.destroy();use();'));
    assert.ok(!sourceImageArrayCloneEffects(entry)?.has(entryClones(entry).at(-1)),'destroy is not a disjoint entry effect and never preserves scalar/Array votes across reentry');
});
test('F overlap destroy facts bind actual current calls and permanently expire after mutation',()=>{
    const p=parse(overlapDestroySource),call=destroys(p)[0],proof=sourceOverlapDestroyNonExposure(p);assert.ok(proof?.has(call));
    assert.equal(proof.has({...call}),false);const copy=parse(overlapDestroySource);assert.equal(proof.has(destroys(copy)[0]),false);
    const old=call.args;call.args=[{type:'Number',value:1}];assert.equal(proof.has(call),false);call.args=old;assert.equal(proof.has(call),false);
    const q=parse(overlapDestroySource),query=sourceOverlapDestroyNonExposure(q),registration=entryNodes(q).find(node=>node.type==='Call'&&node.callee?.name==='onOverlap');
    const prior=registration.args[2];registration.args[2]={...prior};assert.equal(query.has(destroys(q)[0]),false);registration.args[2]=prior;assert.equal(query.has(destroys(q)[0]),false);
    assert.equal(sourceOverlapDestroyNonExposure(parse(overlapDestroySource),{}),null,'caller-made context does not mint provenance');
});

// Arbitrarily repeatable callback entries do not receive a finite visit count.
// The optional effect query instead needs the same private allocation and
// selection to remain present at every actual registration boundary.
const callbackImageSource=array+`let ordinary:Image[];let selected:Image;
function initialize(){let temporary:Image[]=[];temporary.push(pictures[0].clone());ordinary=temporary;}
function use(){selected=ordinary[Math.round(0)%(0+1)].clone();}
function bridge(){use();}
initialize();use();sprites.onOverlap(SpriteKind.Player,SpriteKind.Projectile,function(first:Sprite,second:Sprite){bridge();});`;
const callbackUse=program=>entryClones(program).find(call=>call.callee.object?.type==='Index'&&call.callee.object.object?.name==='ordinary');
const callbackRefused=source=>{const p=parse(source),call=callbackUse(p),proof=sourceImageArrayCloneEffects(p);assert.ok(call);assert.ok(!proof?.has(call),source);};
test('Image callback invariant covers repeated physical entries without changing ordinary Array value facts',()=>{
    const p=parse(callbackImageSource),call=callbackUse(p);
    const options={arrayValues:true,unboundIsOpaque:true,parenthesized:true};
    const before=analyseSourceValueProducers(p,options).typesAt(call.callee.object);
    const proof=sourceImageArrayCloneEffects(p);
    const after=analyseSourceValueProducers(p,options).typesAt(call.callee.object);
    const syntax=entryNodes(p),describe=types=>[...types].map(type=>typeof type==='object'&&type!==null?
        {kind:type.kind,site:syntax.indexOf(type.site)}:type);
    record({stage:'callback-image-invariant-generic-profile',before:describe(before),after:describe(after)});
    assert.ok(proof);assert.equal(after.size,before.size,'the optional effect query changes no generic value fact');
    for(const type of before){
        if(type&&typeof type==='object'){
            assert.equal(type.kind,'Array');assert.ok(syntax.includes(type.site));
            assert.ok([...after].some(actual=>actual&&typeof actual==='object'&&actual.kind==='Array'&&actual.site===type.site),'actual Array allocation site stays unchanged');
        }else assert.ok(after.has(type),'every actual generic scalar fact stays unchanged');
    }
    assert.equal(before.has('Image'),false,'ordinary generic analysis does not prove this indexed Image receiver');
    assert.equal(after.has('Image'),false,'the optional effect proof grants no generic Image value');
    for(const call of entryClones(p))assert.equal(proof.has(call),true);
    const index=call.callee.object.index;assert.equal(index.type,'Binary');assert.equal(index.op,'%');
    assert.equal(index.left.callee.name,'round','the real selection call remains in the AST');
    const renamed=parse(callbackImageSource.replaceAll('ordinary','currentView').replaceAll('temporary','storage'));
    const renamedCall=entryClones(renamed).find(call=>call.callee.object?.object?.name==='currentView');assert.equal(sourceImageArrayCloneEffects(renamed)?.has(renamedCall),true);
});
test('Image callback invariant preserves public source and connected ordinary backing through export',async()=>{
    const b=boundary(fixture(callbackImageSource)),f=finish(b);assert.deepEqual([...f.resource.frames.keys()],['pictures']);
    const imported=convert(b.prepared.files);clean(imported);
    assert.ok(frames(imported.code).some(row=>row[1]==='pictures'),'actual public source admits the authored backing, not only a direct private plan');
    const creator=new Creator();creator.parse(imported.code);
    for(const item of imported.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    record({stage:'callback-image-invariant-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    const blocks=creator.project.targets.flatMap(target=>Object.values(target.blocks));
    assert.equal(blocks.filter(block=>block.opcode==='arcade_registerOverlapHandler').length,1);
    assert.equal(blocks.filter(block=>block.opcode==='arcade_whenRegisteredOverlap').length,1);
    assert.ok(blocks.some(block=>block.opcode==='arrays_mutateReference'),'ordinary allocation/mutation remains actual source behavior');
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};
    for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');
    record({stage:'callback-image-invariant-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'callback-image-invariant-export',result:exported,channels:channels(exported)});clean(exported);
    const refreshed=prepareArcadeDependencyInputs(exported.files,fixture().resolved),again=convert(refreshed.files);clean(again);
    assert.equal((again.code.match(/new array reference/g)||[]).length,(imported.code.match(/new array reference/g)||[]).length,'no new ordinary backings on actual current reimport');
    assert.equal((again.code.match(/arcade register overlap/g)||[]).length,1);
});
test('Image callback invariant requires actual initialization before each registration and all writers',()=>{
    for(const source of [
        callbackImageSource.replace('initialize();use();sprites.onOverlap','sprites.onOverlap').replace('{bridge();});','{bridge();});initialize();use();'),
        callbackImageSource.replace('temporary.push(pictures[0].clone());',''),
        callbackImageSource+'ordinary=[];',
        callbackImageSource.replace('{bridge();});','{ordinary=[];bridge();});'),
        callbackImageSource.replace('{bridge();});','{ordinary.push(pictures[0]);bridge();});'),
        callbackImageSource.replace('{bridge();});','{ordinary[0]=unknown;bridge();});'),
        callbackImageSource+'ordinary.length=0;',
        callbackImageSource.replace('ordinary=temporary;','ordinary=temporary;unknown(temporary);'),
        callbackImageSource+'initialize();',
        callbackImageSource.replace('{bridge();});','{initialize();bridge();});')])callbackRefused(source);
});
test('Image callback invariant rejects callback-writable or unproved scalar selections without defaulting zero',()=>{
    for(const source of [
        callbackImageSource.replace('let selected:Image;','let selected:Image;let position=0;').replace('Math.round(0)%(0+1)','position').replace('{bridge();});','{position=9;bridge();});'),
        callbackImageSource.replace('Math.round(0)%(0+1)','unknown()'),
        callbackImageSource.replace('Math.round(0)%(0+1)','1'),
        callbackImageSource.replace('function use(){','function use(position:number){').replace('Math.round(0)%(0+1)','position').replaceAll('use();','use(0);'),
        callbackImageSource.replace('Math.round(0)%(0+1)','SpriteKind.create()')])callbackRefused(source);
});
test('Image callback invariant requires complete immutable caller and actual SDK registration ancestry',()=>{
    for(const source of [
        callbackImageSource.replace('sprites.onOverlap','fake.onOverlap'),
        'let sprites=unknown;'+callbackImageSource,
        callbackImageSource+'sprites.onOverlap=unknown;',
        callbackImageSource+'let escaped=bridge;',
        callbackImageSource.replace('function bridge(){use();}','function bridge(){bridge();use();}'),
        callbackImageSource.replace('function bridge(){','function bridge(value=unknown()){'),
        callbackImageSource.replace('function bridge(){','function bridge(value:number){'),
        callbackImageSource.replace('function bridge(){','function bridge<T>(){'),
        callbackImageSource.replace('function(first:Sprite,second:Sprite)','function(first:Sprite,first:Sprite)'),
        callbackImageSource.replace('function(first:Sprite,second:Sprite)','function(first:Sprite,second:Sprite=unknown())'),
        callbackImageSource.replace('sprites.onOverlap(SpriteKind.Player,SpriteKind.Projectile,','unknown(')])callbackRefused(source);
});
test('Image callback invariant handles destroy as a barrier rather than restoring ordinary captured state',()=>{
    const source=callbackImageSource.replace('{bridge();});','{first.destroy();bridge();});'),p=parse(source);
    assert.equal(sourceImageArrayCloneEffects(p)?.has(callbackUse(p)),true,'globally closed allocation cannot be acquired by unrelated reentry');
    callbackRefused(source+'sprites.onDestroyed(SpriteKind.Player,function(sprite:Sprite){ordinary=[];});');
    callbackRefused(source.replace('let selected:Image;','let selected:Image;let position=0;').replace('Math.round(0)%(0+1)','position')+'sprites.onDestroyed(SpriteKind.Player,function(sprite:Sprite){position=9;});');
    const b=boundary(fixture(source+'function unused(){unknown();}'));assert.equal(prepareSharedImageArrayTransport(b.normalized,{sourceContext:b.context}),null,'no unknown body acquires an F effect grant from this query');
});
test('Image callback invariant facts permanently expire and cannot be transplanted or forged',()=>{
    const p=parse(callbackImageSource),proof=sourceImageArrayCloneEffects(p),call=callbackUse(p);assert.equal(proof?.has(call),true);
    assert.equal(proof.has({...call}),false);assert.equal(proof.has(callbackUse(parse(callbackImageSource))),false);
    const registration=entryNodes(p).find(node=>node.type==='Call'&&node.callee?.name==='onOverlap'),prior=registration.args[2];
    registration.args[2]={...prior};assert.equal(proof.has(call),false);registration.args[2]=prior;assert.equal(proof.has(call),false);
    const q=parse(callbackImageSource);assert.equal(sourceImageArrayCloneEffects(q,{})?.has(callbackUse(q))??false,false);
    for(const select of [program=>entryNodes(program).find(node=>node.type==='FunctionExpression'),program=>program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='bridge')]){
        const current=parse(callbackImageSource),prior=sourceImageArrayCloneEffects(current),call=callbackUse(current),fn=select(current);assert.equal(prior?.has(call),true);
        fn.parameterProperties=[{name:'closedRoleMutation'}];
        assert.equal(prior.has(call),false,'actual current metadata mutation expires the existing proof');
        assert.ok(!sourceImageArrayCloneEffects(current)?.has(call),'fresh invariant refuses top-level parameter properties');
    }
    const r=parse(callbackImageSource),query=sourceImageArrayCloneEffects(r),index=callbackUse(r).callee.object.index,old=index.right;
    index.right={type:'Number',value:'0'};assert.equal(query.has(callbackUse(r)),false);index.right=old;assert.equal(query.has(callbackUse(r)),false);
});

import {sourceScoreHudVisibilityNonExposure} from '../overlay/scratch-gui/src/lib/bw-makecode/shared-image-array-source-effects.js';
const scoreHudSource=`let firstKind=SpriteKind.create();${array}let selected=pictures[0];info.showScore(false);let ordinary:number[]=[];ordinary.push(2);info.showScore(true);let nextKind=SpriteKind.create();console.log(selected.getPixel(0,0));console.log(ordinary[0]);`;
const scoreHudCalls=program=>entryNodes(program).filter(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.object?.name==='info'&&node.callee.name==='showScore');
const scoreHudRoles=project=>{
    const owners=project.targets.filter(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_setHudVisibility'));assert.equal(owners.length,1);
    const target=owners[0],blocks=target.blocks,commands=Object.entries(blocks).filter(([,block])=>block.opcode==='arcade_setHudVisibility');assert.equal(commands.length,2);
    const roots=Object.entries(blocks).filter(([,block])=>block.opcode==='arcade_whenSourceStarts'),trace=[];
    assert.equal(roots.length,1);let previous=roots[0][0],id=roots[0][1].next;
    while(id){assert.ok(!trace.includes(id),'no connected command cycle');const block=blocks[id];assert.ok(block);assert.equal(block.parent,previous);trace.push(id);previous=id;id=block.next;}
    const ordered=commands.sort((a,b)=>trace.indexOf(a[0])-trace.indexOf(b[0]));
    const evidence=ordered.map(([id,block],index)=>{
        assert.ok(trace.includes(id));assert.equal(block.fields.ELEMENT[0],'score');assert.equal(block.inputs.VISIBLE[0],2);
        const booleanId=block.inputs.VISIBLE[1],boolean=blocks[booleanId];assert.ok(boolean);assert.equal(boolean.parent,id);assert.equal(boolean.opcode,'operator_equals');
        assert.deepEqual(boolean.inputs.OPERAND1,[1,[4,index===0?'0':'1']]);assert.deepEqual(boolean.inputs.OPERAND2,[1,[4,'1']]);
        return {id,booleanId,command:block,boolean};
    });
    const kinds=Object.entries(blocks).filter(([,block])=>block.opcode==='arcade_createSpriteKind');assert.equal(kinds.length,2);
    const kindCommands=kinds.map(([,block])=>block.parent).sort((a,b)=>trace.indexOf(a)-trace.indexOf(b));assert.ok(kindCommands.every(id=>trace.includes(id)));
    assert.ok(trace.indexOf(kindCommands[0])<trace.indexOf(evidence[0].id));assert.ok(trace.indexOf(kindCommands[1])>trace.indexOf(evidence[1].id));
    const mutations=Object.entries(blocks).filter(([,block])=>block.opcode==='arrays_mutateReference');assert.equal(mutations.length,1);
    assert.ok(trace.indexOf(evidence[0].id)<trace.indexOf(mutations[0][0]));assert.ok(trace.indexOf(mutations[0][0])<trace.indexOf(evidence[1].id));
    return {owner:{isStage:target.isStage,name:target.name},root:roots[0][0],trace,evidence,kinds,mutation:mutations[0]};
};
test('exact score HUD visibility retains connected Boolean commands resources and public roundtrip order',async()=>{
    const b=boundary(fixture(scoreHudSource)),direct=finish(b);assert.deepEqual([...direct.resource.frames.keys()],['pictures']);
    const calls=scoreHudCalls(b.normalized),effect=sourceScoreHudVisibilityNonExposure(b.normalized,b.context);assert.equal(calls.length,2);assert.ok(calls.every(call=>effect?.has(call)));
    const imported=convert(b.prepared.files);clean(imported);assert.ok(frames(imported.code).some(row=>row[1]==='pictures'));
    const creator=new Creator();creator.parse(imported.code);record({stage:'score-hud-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    for(const item of imported.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    const roles=scoreHudRoles(creator.project);record({stage:'score-hud-connected-roles',roles});record({stage:'score-hud-Code',code:creator.decompile()});
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};
    for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');
    record({stage:'score-hud-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'score-hud-export',result:exported,channels:channels(exported)});clean(exported);
    const exportedCalls=scoreHudCalls(parse(arcadeProjectSource(exported.files).source));assert.equal(exportedCalls.length,2);assert.deepEqual(exportedCalls.map(call=>call.args[0]),[{type:'Boolean',value:false},{type:'Boolean',value:true}]);
    const again=convert(prepareArcadeDependencyInputs(exported.files,fixture().resolved).files);clean(again);assert.equal(frames(again.code).filter(row=>row[1]==='pictures').length,frames(imported.code).filter(row=>row[1]==='pictures').length);
    const second=new Creator();second.parse(again.code);record({stage:'score-hud-reimport-Creator',project:second.project,channels:channels(second)});clean(second);record({stage:'score-hud-reimport-connected-roles',roles:scoreHudRoles(second.project)});
});
test('score HUD effect requires exact literal Boolean own data and closed direct call schema',()=>{
    for(const text of ['info.showScore();','info.showScore(false,true);','info.showScore(pictures);','info.showScore(pictures[0]);','info.showScore(unknown());','let visible:boolean;info.showScore(visible);','info["showScore"](false);','new info.showScore(false);','info.showScore<boolean>(false);']){
        const p=parse(array+'let selected=pictures[0];'+text),calls=scoreHudCalls(p),proof=sourceScoreHudVisibilityNonExposure(p);
        assert.ok(calls.every(call=>!proof?.has(call)),text);assert.equal(prepareSharedImageArrayTransport(p),null,text);
    }
    for(const change of [call=>{call.args[0].value='false';},call=>{delete call.args[0].value;},call=>{call.args[0].value={};},call=>{Object.defineProperty(call.args[0],'value',{get(){throw Error('never invoke Boolean accessor');}});},call=>{call.isNew=true;},call=>{call.typeArguments=[];}]){
        const p=parse(array+'let selected=pictures[0];info.showScore(false);'),call=scoreHudCalls(p)[0];assert.equal(sourceScoreHudVisibilityNonExposure(p)?.has(call),true);change(call);
        assert.ok(!sourceScoreHudVisibilityNonExposure(p)?.has(call));assert.equal(prepareSharedImageArrayTransport(p),null);
    }
    const other=parse(array+'let selected=pictures[0];info.showLife(false);');assert.equal(prepareSharedImageArrayTransport(other),null,'other HUD commands need their own effect contract');
});
test('score HUD exact call refuses namespace and method aliases escapes shadows and late writes',()=>{
    const operation='info.showScore(false);',body=array+'let selected=pictures[0];';
    for(const source of [
        'let info=unknown;'+body+operation,body+operation+'info=unknown;',body+operation+'info.showScore=unknown;',
        body+'let alias=info;'+operation,body+'let method=info.showScore;'+operation,
        body+'function escape(){return info.showScore;}'+operation,
        body+'function escape(){unknown(info.showScore);}'+operation,
        body+'function escape(){let method=info.showScore;}'+operation,
        body+'function escape(){info.showScore=unknown;}'+operation]){
        const p=parse(source),calls=scoreHudCalls(p),proof=sourceScoreHudVisibilityNonExposure(p);assert.ok(calls.length);assert.ok(calls.every(call=>!proof?.has(call)),source);assert.equal(prepareSharedImageArrayTransport(p),null,source);
    }
    const p=parse(body+operation),call=scoreHudCalls(p)[0];assert.equal(sourceScoreHudVisibilityNonExposure(p)?.has(call),true,'physical direct callee is not method extraction');
    const reentrant=boundary(fixture(callbackImageSource.replace('{bridge();});','{ordinary=[];bridge();});')+operation));
    assert.equal(prepareSharedImageArrayTransport(reentrant.normalized,{sourceContext:reentrant.context}),null,'HUD permission never repairs callback-written Array invariants');
});
test('score HUD private certificate and finished transport retain sticky same Program dependencies',()=>{
    const p=parse(array+'let selected=pictures[0];info.showScore(false);'),call=scoreHudCalls(p)[0],proof=sourceScoreHudVisibilityNonExposure(p);assert.equal(proof?.has(call),true);
    assert.equal(proof.has({...call}),false);assert.equal(proof.has(scoreHudCalls(parse(array+'let selected=pictures[0];info.showScore(false);'))[0]),false);
    const prior=call.args[0];call.args[0]={type:'Boolean',value:false};assert.equal(proof.has(call),false);call.args[0]=prior;assert.equal(proof.has(call),false);assert.equal(proof.current(),false);
    const q=parse(array+'let selected=pictures[0];info.showScore(false);'),fresh=sourceScoreHudVisibilityNonExposure(q),value=scoreHudCalls(q)[0].args[0],d=Object.getOwnPropertyDescriptor(value,'value');
    Object.defineProperty(value,'value',{...d,writable:false});assert.equal(fresh.current(),false);Object.defineProperty(value,'value',d);assert.equal(fresh.current(),false);
    const observed=parse(array+'let selected=pictures[0];info.showScore(false);');let throwObservation=false;
    observed.bwProcedureConstraintSource={opaqueObservation:new Proxy({}, {ownKeys(){if(throwObservation)throw Error('currentness observation failed');return [];}})};
    const guarded=sourceScoreHudVisibilityNonExposure(observed);assert.equal(guarded?.has(scoreHudCalls(observed)[0]),true);
    throwObservation=true;assert.throws(()=>guarded.current(),/currentness observation failed/);throwObservation=false;assert.equal(guarded.current(),false,'caught currentness exception also permanently expires the certificate');
    const b=boundary(fixture(scoreHudSource));assert.equal(sourceScoreHudVisibilityNonExposure(b.normalized,{})?.has(scoreHudCalls(b.normalized)[0])??false,false);
    const final=finish(b).final;assert.ok(currentSharedImageArrayTransport(final));const currentCall=scoreHudCalls(final)[0],old=currentCall.args[0].value;
    currentCall.args[0].value=!old;assert.equal(currentSharedImageArrayTransport(final),null);currentCall.args[0].value=old;assert.equal(currentSharedImageArrayTransport(final),null,'restored actual AST cannot reactivate consumed HUD proof');
});
