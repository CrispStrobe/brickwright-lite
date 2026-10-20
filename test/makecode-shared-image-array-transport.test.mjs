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
    assert.ok(exported.files['main.ts']);assert.match(exported.ts,/\.setPixel\(/);
    // The genuine exporter preserves a connected numeric reporter as (0 + 3).
    // Prove the actual emitted call and closed numeric argument, rather than
    // requiring the exporter to fold its source spelling into one literal.
    const pushes=[];walk(parse(exported.ts),node=>{
        if(node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='push'&&
            node.callee.object?.type==='Identifier'&&node.callee.object.name==='ordinary')pushes.push(node);
    });
    assert.equal(pushes.length,1);assert.equal(pushes[0].args.length,1);
    const numeric=node=>{
        if(node?.type==='Number'&&typeof node.value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(node.value))return Number(node.value);
        if(node?.type==='Binary'&&node.op==='+'){
            const left=numeric(node.left),right=numeric(node.right);
            return Number.isFinite(left)&&Number.isFinite(right)?left+right:NaN;
        }
        return NaN;
    };
    assert.equal(numeric(pushes[0].args[0]),3,'the actual ordinary Array receives numeric three exactly once');
    const again=convert(exported.files);clean(again);assert.equal((again.code.match(/new array reference/g)||[]).length,(r.code.match(/new array reference/g)||[]).length,'no new backing construction; ordinary Array remains');
});

test('real ordered sprite creation reissues resource proof before named-route inference',async()=>{
    const r=convert(declaration('pictures')+'let hero=sprites.create(pictures[0],SpriteKind.Player);hero.setPosition(80,60);let seen=pictures[0].getPixel(0,0);console.log(seen);');
    clean(r);assert.equal(frameReads(r.code).filter(x=>x[1]==='pictures').length,2);
    assert.doesNotMatch(r.code,/GLOBAL pictures|new array reference/);
    assert.match(r.code,/arcade create image/);
    const {svgToPixels}=await import('../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js');
    const templates=new Set(frameReads(r.code).filter(x=>x[1]==='pictures').map(x=>x[3]));assert.equal(templates.size,1);
    const resources=r.costumes.filter(c=>templates.has(c.sprite)),actors=r.costumes.filter(c=>!templates.has(c.sprite));
    assert.equal(resources.length,1);assert.deepEqual(Array.from(svgToPixels(resources[0].svg).pixels),[1,0,0,2]);
    // Dynamic native actors intentionally retain a separate blank template.
    // Its clone costume is not the actor's runtime Image resource.
    assert.equal(actors.length,1);const placeholder=svgToPixels(actors[0].svg);
    assert.equal(placeholder.width,1);assert.equal(placeholder.height,1);assert.deepEqual(Array.from(placeholder.pixels),[0]);
});


test('actual no-initializer declarations preserve effect order without producing receiver facts',()=>{
    const source=declaration('pictures')+'let selected:Image;let ordinary:number[];selected=pictures[0];ordinary=[1,2];selected.setPixel(0,0,7);console.log(selected.getPixel(0,0));ordinary.push(3);';
    const input=parse(source),selected=input.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='selected').decls[0];
    assert.ok(Object.hasOwn(selected,'init'));assert.equal(selected.init,null);
    const explicit=parse('let selected:Image=null').body[0].decls[0];assert.deepEqual(explicit.init,{type:'Null'});
    const {prepared,resource}=stage(source);assert.deepEqual([...resource.frames.keys()],['pictures']);
    const preparedSelected=prepared.program.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='selected').decls[0];
    assert.equal(preparedSelected.init,null,'no source initialization is synthesized');
    assert.equal(resource.selection(preparedSelected),null,'the plan grants only actual frame selections');
    for(const operation of ['selected.setPixel(0,0,7);','console.log(selected.getPixel(0,0));','ordinary.push(3);']){
        const name=operation.startsWith('ordinary')?'ordinary':'selected';
        assert.equal(prepareSharedImageArrayTransport(parse(declaration('pictures')+`let ${name}:${name==='ordinary'?'number[]':'Image'};`+operation+'let keep=pictures[0];')),null,'no actual writer cannot produce a receiver kind');
    }
    for(const write of ['selected+=pictures[0];','selected++;'])assert.equal(prepareSharedImageArrayTransport(parse(declaration('pictures')+'let selected:Image;selected=pictures[0];'+write+'selected.setPixel(0,0,7);')),null,'unknown compound/update writer remains unknown');
    const early=declaration('pictures')+'let selected:Image;selected.setPixel(0,0,7);selected=pictures[0];';
    const earlyPrepared=prepareSharedImageArrayTransport(parse(early));assert.ok(earlyPrepared);
    const body=earlyPrepared.program.body;assert.equal(body[1].decls[0].init,null);
    assert.equal(body[2].expr.callee.object.name,'selected');assert.equal(body[2].expr.callee.name,'setPixel');
    assert.equal(body[3].expr.type,'Assignment');assert.equal(body[3].expr.left.name,'selected');
    assert.equal(body[3].expr.right.type,'Index','the ordinary pre-assignment access is not moved behind its writer');
    const alias=prepareSharedImageArrayTransport(parse(declaration('pictures')+'let selected:Image;let alias=selected;alias.setPixel(0,0,7);selected=pictures[0];'));
    assert.ok(alias);assert.equal(alias.program.body[2].decls[0].init.name,'selected');
    assert.equal(alias.program.body[3].expr.callee.object.name,'alias');
    assert.equal(alias.program.body[4].expr.left.name,'selected','early alias/read order stays ordinary too');
});

test('exact builtin kind allocations remain once and in declaration order around shared selections',()=>{
    const source='let firstKind=SpriteKind.create();'+declaration('pictures')+'let before=pictures[0];let secondKind=SpriteKind.create();let seen=pictures[0].getPixel(0,0);console.log(firstKind);console.log(secondKind);console.log(seen);';
    const {input,prepared,staged,final,resource}=stage(source);
    const allocations=program=>{const result=[];walk(program,node=>{if(node.type==='Call'&&node.callee?.type==='Member'&&node.callee.object?.name==='SpriteKind'&&node.callee.name==='create')result.push(node);});return result;};
    for(const program of [input,prepared.program,staged,final]){
        assert.equal(allocations(program).length,2,'no allocation is folded duplicated or removed');
        const declarations=program.body.filter(n=>n.type==='Declaration').map(n=>n.decls[0].name);
        assert.ok(declarations.indexOf('firstKind')<declarations.indexOf('pictures'));
        assert.ok(declarations.indexOf('pictures')<declarations.indexOf('before'));
        assert.ok(declarations.indexOf('before')<declarations.indexOf('secondKind'));
        assert.ok(declarations.indexOf('secondKind')<declarations.indexOf('seen'));
    }
    assert.deepEqual([...resource.frames.keys()],['pictures']);
    const first=input.body[0].decls[0].init;assert.equal(first.type,'Call');assert.deepEqual(first.args,[]);
    const multi=stage('let one=SpriteKind.create(),two=SpriteKind.create();'+declaration('pictures')+'let selected=pictures[0];console.log(one);console.log(two);console.log(selected.getPixel(0,0));');
    for(const program of [multi.input,multi.prepared.program,multi.staged,multi.final]){
        assert.deepEqual(program.body[0].decls.map(row=>row.name),['one','two']);
        assert.equal(allocations(program).length,2,'multi-declaration evaluation retains both original calls');
        assert.ok(program.body[0].decls.every(row=>row.init.type==='Call'&&row.init.args.length===0));
    }
});

test('kind prefix rejects namespace shadows writers escape and unsupported allocation shapes',()=>{
    const use=declaration('pictures')+'let selected=pictures[0];console.log(selected.getPixel(0,0));';
    for(const before of [
        'let SpriteKind={create:function(){return 0}};let kind=SpriteKind.create();',
        'function foreign(SpriteKind:any){SpriteKind.create()}let kind=SpriteKind.create();',
        'let kind=SpriteKind.create();SpriteKind.create=function(){return 0};',
        'let kind=SpriteKind.create();SpriteKind=other;',
        'let kind=SpriteKind.create();let extracted=SpriteKind.create;',
        'let kind=SpriteKind.create();let escaped=SpriteKind;',
        'let kind=SpriteKind.create(1);',
        'let kind=new SpriteKind.create();',
        'let kind=SpriteKind.create<number>();',
        'let kind=SpriteKind["create"]();',
        'let kind=SpriteKind.create.call(null);',
        'let kind=SpriteKind.create();game.onUpdate(function(){});',
        'function earlier(){}let kind=SpriteKind.create();earlier();'
    ])assert.equal(prepareSharedImageArrayTransport(parse(before+use)),null,before);
    const after=prepareSharedImageArrayTransport(parse('let kind=SpriteKind.create();'+use+'SpriteKind.create=function(){return 0};'));
    assert.equal(after,null,'later actual builtin writers also refuse the original prefix');
});

test('a changed physical builtin kind call invalidates final shared resource facts',()=>{
    const {final}=stage('let kind=SpriteKind.create();'+declaration('pictures')+'let selected=pictures[0];console.log(selected.getPixel(0,0));');
    assert.ok(currentSharedImageArrayTransport(final));
    const allocation=final.body.find(n=>n.type==='Declaration'&&n.decls[0].name==='kind').decls[0].init;
    allocation.args.push({type:'Number',value:'1'});
    assert.equal(currentSharedImageArrayTransport(final),null,'no renewed proof after an actual call edit');
});

test('public roundtrip retains actual kind allocation counters and shared frame operation order',async()=>{
    const source='let firstKind=SpriteKind.create();'+declaration('pictures')+'let before=pictures[0];let secondKind=SpriteKind.create();let seen=pictures[0].getPixel(0,0);console.log(firstKind);console.log(secondKind);console.log(seen);';
    const imported=convert(source);clean(imported);assert.equal(frameReads(imported.code).length,2);assert.doesNotMatch(imported.code,/new array reference/);
    const creator=new Creator();creator.parse(imported.code);record({stage:'kind-Creator',project:creator.project,channels:channels(creator)});clean(creator);
    for(const costume of imported.costumes||[])creator.applyCustomSVG(costume.sprite,costume.svg);
    const allocationWriters=[];
    for(const target of creator.project.targets)for(const [id,block]of Object.entries(target.blocks||{}))if(block.opcode==='arcade_createSpriteKind'){
        const parent=target.blocks[block.parent];assert.equal(parent?.opcode,'data_setvariableto');
        allocationWriters.push({target,id,writer:block.parent,name:parent.fields.VARIABLE[0],variableId:parent.fields.VARIABLE[1]});
    }
    assert.equal(allocationWriters.length,2,'actual native kind allocation reporters survive exactly once each');
    assert.deepEqual(new Set(allocationWriters.map(r=>r.name)),new Set(['firstKind','secondKind']));
    const first=allocationWriters.find(r=>r.name==='firstKind'),second=allocationWriters.find(r=>r.name==='secondKind');assert.equal(first.target,second.target);
    const hats=Object.entries(first.target.blocks).filter(([,block])=>block.opcode==='arcade_whenSourceStarts');assert.equal(hats.length,1);
    const sequence=[],visited=new Set();let cursor=first.target.blocks[hats[0][0]].next;
    while(cursor){assert.ok(!visited.has(cursor),'actual entry chain acyclic');visited.add(cursor);sequence.push(cursor);cursor=first.target.blocks[cursor].next;}
    const variableWriter=name=>sequence.find(id=>first.target.blocks[id].opcode==='data_setvariableto'&&first.target.blocks[id].fields.VARIABLE[0]===name);
    const before=variableWriter('before');assert.ok(before);assert.ok(sequence.indexOf(first.writer)<sequence.indexOf(before));assert.ok(sequence.indexOf(before)<sequence.indexOf(second.writer));
    const code=creator.decompile();record({stage:'kind-Code',code});assert.ok(code);
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};
    for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');
    record({stage:'kind-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'kind-export',result:exported,channels:channels(exported)});clean(exported);
    let calls=0;walk(parse(exported.files['main.ts']),node=>{if(node.type==='Call'&&node.callee?.type==='Member'&&node.callee.object?.name==='SpriteKind'&&node.callee.name==='create'){assert.equal(node.args.length,0);calls++;}});
    assert.equal(calls,2,'actual exported source retains both stateful allocations');
    const again=convert(exported.files);clean(again);assert.equal(frameReads(again.code).length,2);assert.doesNotMatch(again.code,/new array reference/,'no new backing constructor after genuine current export/reimport');
});
