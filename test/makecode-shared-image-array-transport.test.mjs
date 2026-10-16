import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {prepareSharedImageArrayTransport,preservesSharedImageArray,projectSharedImageArrayTransport,
    finishSharedImageArrayTransport,currentSharedImageArrayTransport} from '../overlay/scratch-gui/src/lib/bw-makecode/source-shared-image-array-transport.js';

const img='img`1 .\n. 2`';
const declaration=name=>`let ${name}: Image[] = [${img}];`;
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainCallableMetadata:true});
const record=value=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(value,(_k,v)=>v===undefined?{$scalar:'Undefined'}:typeof v==='symbol'?{$scalar:'Symbol'}:v)+'\n');};
const channels=value=>Object.fromEntries(Object.keys(value).filter(k=>/unsupported|warn|error|unparsed|diagnostic|refusal/i.test(k)).map(k=>[k,value[k]]));
const clean=value=>{for(const [key,v]of Object.entries(channels(value)))assert.ok(Array.isArray(v)&&v.length===0,key+': '+JSON.stringify(v));};
const convert=source=>{const result=arcadeToPseudocode(source);record({stage:'source',source,result,channels:channels(result)});return result;};
const stage=source=>{
    const input=parse(source),prepared=prepareSharedImageArrayTransport(input);assert.ok(prepared,'actual source plan');
    const staged=lowerPxtStagedValues(prepared.program,{sharedImageArrayPlan:prepared.plan});
    const final=projectSharedImageArrayTransport(lowerLazyValues(staged),prepared.plan);
    assert.ok(final);assert.equal(finishSharedImageArrayTransport(final,prepared.plan),true);
    const resource=currentSharedImageArrayTransport(final);assert.ok(resource);return {input,prepared,staged,final,resource};
};
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','bwProcedureConstraintSource'].includes(key)){if(Array.isArray(value))value.forEach(child=>walk(child,visit));else walk(value,visit);}};
const count=(program,predicate)=>{let n=0;walk(program,node=>{if(predicate(node))n++;});return n;};
const frameReads=code=>[...code.matchAll(/arcade frame image array "([^"]+)" index \(([^)]+)\) template "([^"]+)" start 0 count (\d+)/g)];
const fallback=source=>{assert.equal(prepareSharedImageArrayTransport(parse(source)),null,source);return lowerPxtStagedValues(parse(source));};

// These controls assert actual source/public artifacts. Native Image identity,
// pixels after mutation, and lifetime qualification remain a separate gate.
test('an arbitrary legal binding retains its exact current literal before eager staging',()=>{
    const {staged,resource}=stage(declaration('pictures')+'let selected=pictures[0];console.log(selected.getPixel(0,0));');
    assert.equal(count(staged,n=>n.type==='Call'&&n.callee?.name==='push'),0);
    assert.deepEqual([...resource.frames.keys()],['pictures']);
    assert.deepEqual(resource.frames.get('pictures')[0].pixels,[1,0,0,2]);
});
test('a generated-looking binding with an actual index writer remains ordinary',()=>{
    const staged=fallback(declaration('__bwFrames_decoy')+`__bwFrames_decoy[0]=${img};let selected=__bwFrames_decoy[0];`);
    assert.ok(count(staged,n=>n.type==='Call'&&n.callee?.name==='push'));
    assert.ok(count(staged,n=>n.type==='Assignment'&&n.left?.type==='Index'));
});
test('repeated selections share one current resource and retain Image alias mutation order',()=>{
    const r=convert(declaration('pictures')+'let first=pictures[0];let second=pictures[0];first.setPixel(0,0,7);let seen=second.getPixel(0,0);console.log(seen);');clean(r);
    const reads=frameReads(r.code);assert.equal(reads.length,2);assert.equal(new Set(reads.map(x=>x[1])).size,1);
    assert.equal(r.costumes.length,1);assert.doesNotMatch(r.code,/arcade copy image/);
    assert.ok(r.code.indexOf('set image pixel')<r.code.indexOf('set seen to'));
});
test('clones stay at their original expression position and are never shared by transport',()=>{
    const r=convert(declaration('pictures')+'let original=pictures[0];original.setPixel(0,0,7);let copy=pictures[0].clone();original.setPixel(0,0,8);console.log(copy.getPixel(0,0));');clean(r);
    assert.equal((r.code.match(/arcade copy image/g)||[]).length,1);
    assert.ok(r.code.indexOf('color 7')<r.code.indexOf('arcade copy image'));
    assert.ok(r.code.indexOf('arcade copy image')<r.code.indexOf('color 8'));
});
test('equal pixels in distinct initializers have distinct resource identities',()=>{
    const r=convert(declaration('first')+declaration('second')+'let a=first[0];let b=second[0];a.setPixel(0,0,7);console.log(b.getPixel(0,0));');clean(r);
    assert.deepEqual(new Set(frameReads(r.code).map(x=>x[1])),new Set(['first','second']));assert.equal(r.costumes.length,2);
    // Generic fallback uses the real custom allocator. Its candidate template
    // name is free, but its derived Image key collides with this actual global.
    const collision=convert(`class Untranslated { static value(){return 1;} }let __arcadeBackground1Image=7;let original=${img};console.log(original.getPixel(0,0));`);
    assert.ok(collision.unsupported.length);
    assert.ok(collision.costumes.length);
    assert.ok(collision.costumes.every(c=>`${c.sprite}Image`!=='__arcadeBackground1Image'));

});
test('an immutable whole Array alias keeps ordinary identity and construction',()=>{
    const staged=fallback(declaration('pictures')+'const alias=pictures;let selected=alias[0];');
    assert.ok(count(staged,n=>n.type==='Call'&&n.callee?.name==='push'));
    assert.ok(count(staged,n=>n.type==='Declaration'&&n.decls.some(d=>d.name==='alias')));
});
test('Array methods shape reads and item writers all disqualify transport',()=>{
    for(const effect of [`pictures.push(${img});`,'pictures.pop();','pictures.length;','pictures[0]++;',`pictures[0]=${img};`])fallback(declaration('pictures')+effect+'let selected=pictures[0];');
});
test('whole Array arguments returns object storage and closure exposure stay ordinary',()=>{
    for(const effect of ['function take(a:Image[]){} take(pictures);','function expose(){return pictures;} expose();','let holder={value:pictures};','game.onUpdate(function(){console.log(pictures);});'])fallback(declaration('pictures')+effect+'let selected=pictures[0];');
});
test('reads calls and registrations before initialization cannot prove dominance',()=>{
    for(const prefix of ['let selected=pictures[0];','function read(){let selected=pictures[0];} read();','game.onUpdate(function(){let selected=pictures[0];});'])fallback(prefix+declaration('pictures')+'let after=pictures[0];');
});
test('function loop and conditional literal constructors remain fresh at every evaluation',()=>{
    for(const source of [`function make(){${declaration('pictures')}return pictures[0];}make();make();`,`while(false){${declaration('pictures')}let x=pictures[0];}`,`if(true){${declaration('pictures')}let x=pictures[0];}`])fallback(source);
});
test('actual img and Math shadows writes and escapes never grant literal authority',()=>{
    for(const extra of ['let img=0;','function hidden(img:number){}','let Math={round:0};','Math.round=0;','let escaped=Math;'])fallback(declaration('pictures')+extra+'let selected=pictures[((Math.round(0)%1)+1)%1];');
});
test('ambient unknown syntax calls and receiver effects refuse the closed source proof',()=>{
    for(const extra of ['unknown();','let receiver=null;receiver.anything();','let host=globalThis;','eval("change()");','let f=(function(){}).constructor;','console.notAnApi();'])fallback(declaration('pictures')+extra+'let selected=pictures[0];');
});
test('effectful elements indices and multiple declarators keep the existing ordered staging',()=>{
    for(const source of [`function make(){return ${img};}let pictures=[make()];let selected=pictures[0];`,declaration('pictures')+'function offset(){return 0;}let selected=pictures[offset()];',`let pictures=[${img}],other=1;let selected=pictures[0];`])fallback(source);
});
test('a current initializer or writer edit invalidates the issued plan without renewal',()=>{
    for(const edit of ['pixel','writer']) {
        const p=prepareSharedImageArrayTransport(parse(declaration('pictures')+'let selected=pictures[0];'));assert.ok(p);
        const statement=p.program.body[0],array=statement.decls[0].init;
        assert.equal(preservesSharedImageArray(p.plan,p.program,array,statement),true);
        if(edit==='pixel')array.items[0].value='3';else p.program.body.push({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name:'pictures'},right:{type:'Null'}}});
        assert.equal(preservesSharedImageArray(p.plan,p.program,array,statement),false);
    }
});
test('forged plans and copied origin carriers never authorize a final resource',()=>{
    const input=parse(declaration('pictures')+'let selected=pictures[0];');assert.equal(preservesSharedImageArray({},input,input.body[0].decls[0].init,input.body[0]),false);
    const p=prepareSharedImageArrayTransport(input);assert.ok(p);const carrier=p.program.body[0].decls[0].init;
    p.program.body.unshift({type:'Declaration',kind:'let',decls:[{name:'copied',init:{...carrier,items:carrier.items.map(item=>({...item}))}}]});
    const projected=projectSharedImageArrayTransport(p.program,p.plan);assert.ok(projected);assert.equal(finishSharedImageArrayTransport(projected,p.plan),false);
});
test('helper input admission rejects shared and cyclic executable objects before recursive proofs',()=>{
    for(const mode of ['shared','cycle','accessor']) {
        const ast=parse(declaration('pictures')+'let selected=pictures[0];');
        if(mode==='shared')ast.body.push(ast.body[1]);
        if(mode==='cycle')ast.body.push(ast);
        if(mode==='accessor')Object.defineProperty(ast.body[0].decls[0].init.items[0],'value',{get(){throw Error('must not read');},enumerable:true});
        assert.equal(prepareSharedImageArrayTransport(ast),null);
    }
});
test('partial neighbors retain bodies and diagnostics with no unconsumed transport resource',()=>{
    const r=convert(declaration('pictures')+'function retained(){console.log("keep helper");}unknown(pictures);');
    assert.ok(r.unsupported.length);assert.match(r.code,/DEFINE retained/);assert.match(r.code,/keep helper/);
    assert.doesNotMatch(r.code,/arcade frame image array "pictures"/);
});
test('public Creator Code SB3 and export preserve resource art alongside ordinary Array and callback effects',async()=>{
    const source=declaration('pictures')+'let ordinary=[1,2];let selected=pictures[0];let ticks=0;function tick(){ticks+=1;selected.setPixel(0,0,7);}game.onUpdate(function(){tick();});console.log(selected.getPixel(0,0));ordinary.push(3);';
    const r=convert(source);clean(r);assert.equal(frameReads(r.code).filter(x=>x[1]==='pictures').length,1);
    assert.match(r.code,/array reference/);assert.equal((r.code.match(/DEFINE tick/g)||[]).length,1);
    const creator=new Creator();creator.parse(r.code);record({stage:'Creator',project:creator.project,channels:channels(creator)});clean(creator);
    for(const item of r.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    const actualCode=creator.decompile();record({stage:'Code',code:actualCode});assert.ok(actualCode);
    const actualBytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(actualBytes),members={};
    for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');
    record({stage:'SB3',bytes:actualBytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'export',result:exported,channels:channels(exported)});clean(exported);
    assert.ok(exported.files['main.ts']);assert.match(exported.ts,/\.setPixel\(/);assert.match(exported.ts,/\.push\(3\)/);
    const again=convert(exported.files);clean(again);assert.equal((again.code.match(/new array reference/g)||[]).length,(r.code.match(/new array reference/g)||[]).length,'no new backing construction; ordinary Array remains');
});
