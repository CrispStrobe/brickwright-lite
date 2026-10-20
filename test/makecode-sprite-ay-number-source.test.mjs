import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';

const image='img`1 .\n. 2`';
const source=`let balls:Sprite[]=[];let seen=0;
function addBall(ay:number){let ball=sprites.create(${image});ball.ay=ay;balls.push(ball);}
addBall(80);
game.onUpdate(function(){for(const ball of balls){seen=ball.ay;if(seen<0)addBall(ball.ay);ball.ay++;}});`;
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true,retainParentheses:true});
const graph=program=>analyseSourceValueProducers(program,{ordinaryPrimitiveSdkNumbers:true});
const walk=(value,fn)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const item of value)walk(item,fn);return;}fn(value);for(const [key,item]of Object.entries(value))if(!['parameterDefaults','paramTypes','originalBody'].includes(key))walk(item,fn);};
const argument=program=>{const found=[];walk(program,node=>{if(node.type==='Call'&&node.callee?.type==='Identifier'&&node.callee.name==='addBall'&&node.args?.[0]?.type==='Member'&&node.args[0].name==='ay')found.push(node.args[0]);});assert.equal(found.length,1);return found[0];};
const isNumber=(analysis,node)=>{const types=analysis.typesAt(node);return types.size===1&&types.has('Number');};
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const clean=(value,required)=>{
 const keys=new Set(['unsupported','warnings','errors','unparsed','diagnostics','refused','fetchRefusals','netAttempts',...Object.getOwnPropertyNames(value).filter(k=>/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(k))]);
 for(const key of keys){const row=Object.getOwnPropertyDescriptor(value,key);if(!row){assert.ok(!required.includes(key),key);continue;}assert.ok(Object.hasOwn(row,'value'),key);assert.ok(Array.isArray(row.value),key);assert.deepEqual(row.value,[],key);}
};
const refused=text=>{const program=parse(text),read=argument(program);assert.equal(isNumber(graph(program),read),false);assert.ok(validateProcedureConstraintSource(program,{ordinaryPrimitiveSdkNumbers:true}).some(message=>message.includes('addBall.ay requires Number')));};

test('actual created Sprite ay reads satisfy primitive calls without publishing receiver or Array domains',()=>{
 const program=parse(source),read=argument(program),analysis=graph(program);
 assert.equal(isNumber(analysis,read),true);assert.deepEqual(validateProcedureConstraintSource(program,{ordinaryPrimitiveSdkNumbers:true}),[]);
 assert.equal(isNumber(analyseSourceValueProducers(program),read),false);
 const ragged=parse(source.replace(image,'img`1\n. 2`'));assert.equal(isNumber(graph(ragged),argument(ragged)),true);
 refused(source.replace(image,'img`1 ?\n. 2`'));
 assert.equal(analysis.typesAt(read.object).has('Sprite'),false);assert.equal(analysis.typesAt(read.object).has('Number'),false);
 const arrayReads=[];walk(program,node=>{if(node.type==='Identifier'&&node.name==='balls')arrayReads.push(node);});
 for(const node of arrayReads)assert.equal([...analysis.typesAt(node)].some(type=>type==='Array'||type?.kind==='Array'),false);
});

test('actual Sprite Array callback source retains current Code and two complete own-asset SB3 archives',async()=>{
 const imported=importProjectFiles({'main.ts':source,'pxt.json':JSON.stringify({name:'sprite-ay-number',dependencies:{device:'*'},files:['main.ts']})},{target:'arcade',name:'sprite-ay-number'});
 record({stage:'sprite-ay-import',result:imported});clean(imported,['unsupported','warnings']);assert.equal(imported.lang,'pseudocode');
 const first=new Creator();first.parse(imported.code);record({stage:'sprite-ay-Creator',project:first.project,errors:first.errors,warnings:first.warnings,unparsed:first.unparsed});clean(first,['errors','warnings','unparsed']);
 for(const costume of imported.costumes)assert.equal(costume.mode==='add'?first.addCustomSVGCostume(costume.sprite,costume.svg,costume.name):first.applyCustomSVG(costume.sprite,costume.svg),true);
 const inspect=async(creator,label)=>{const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};for(const name of Object.keys(zip.files)){assert.equal(zip.files[name].dir,false);members[name]=await zip.file(name).async('base64');}
  const project=JSON.parse(await zip.file('project.json').async('string'));record({stage:label,bytesBase64:bytes.toString('base64'),members,project});
  for(const target of project.targets)for(const group of ['costumes','sounds'])for(const asset of target[group]){assert.equal(asset.md5ext,asset.assetId+'.'+asset.dataFormat);assert.ok(members[asset.md5ext]);}
  const blocks=project.targets.flatMap(target=>Object.values(target.blocks));assert.ok(blocks.some(block=>block.opcode==='arcade_spriteProperty'));return project;};
 const firstProject=await inspect(first,'sprite-ay-first-SB3'),code=first.decompile(firstProject);assert.ok(code.includes('addBall'));record({stage:'sprite-ay-current-Code',code});
 const second=new Creator();second.parse(code);record({stage:'sprite-ay-second-Creator',project:second.project,errors:second.errors,warnings:second.warnings,unparsed:second.unparsed});clean(second,['errors','warnings','unparsed']);
 for(const costume of imported.costumes)assert.equal(costume.mode==='add'?second.addCustomSVGCostume(costume.sprite,costume.svg,costume.name):second.applyCustomSVG(costume.sprite,costume.svg),true);
 await inspect(second,'sprite-ay-second-SB3');
});

test('every Array writer and alias use must remain actual owned Sprite storage',()=>{
 for(const edit of [s=>s.replace('balls.push(ball);','balls.push(ball);balls.push(12 as any);'),s=>s.replace('balls.push(ball);','balls.push(ball);unknown(balls);'),s=>s.replace('balls.push(ball);','balls.push(ball);let escaped=balls;unknown(escaped);'),s=>s.replace('balls.push(ball);','balls.push(ball);balls[0]=null;'),s=>s.replace('let balls:Sprite[]=[]','let balls:Sprite[]=[];balls=null as any')])refused(edit(source));
 const aliases=source.replace('balls.push(ball);','let alias=ball;let all=balls;all.push(alias);');
 assert.equal(isNumber(graph(parse(aliases)),argument(parse(aliases))),false,'a physical read from another Program is never a member');
 const program=parse(aliases);assert.equal(isNumber(graph(program),argument(program)),true);
 // The public importer analyzes this actual lowered shape after for-of
 // desugaring. Names are ordinary bindings, not a generated-name authority.
 const dense=source.replace('for(const ball of balls){','{let collection=balls;for(let cursor=0;cursor<collection.length;cursor++){let ball=collection[cursor];').replace('ball.ay++;}});','ball.ay++;}}});');
 const lowered=parse(dense);assert.equal(isNumber(graph(lowered),argument(lowered)),true);assert.deepEqual(validateProcedureConstraintSource(lowered,{ordinaryPrimitiveSdkNumbers:true}),[]);
 for(const edit of [s=>s.replace('cursor=0','cursor=1'),s=>s.replace('cursor<collection.length','cursor<=collection.length'),s=>s.replace('cursor<collection.length','cursor<foreign.length'),s=>s.replace('cursor++','cursor+=2'),s=>s.replace('collection[cursor]','collection[0]'),s=>s.replace('collection[cursor]','foreign[cursor]'),s=>s.replace('let ball=collection[cursor];','cursor=99;let ball=collection[cursor];'),s=>s.replace('let ball=collection[cursor];','let ball=collection[cursor];cursor=99;'),s=>s.replace('let ball=collection[cursor];','').replace('ball.ay++;','ball.ay++;let ball=collection[cursor];')])refused(edit(dense));

});

test('later or conditional compatible allocations never initialize an earlier receiver or alias',()=>{
 const factory=`sprites.create(${image})`,prefix='function addBall(ay:number){};';
 for(const tail of [`let b:Sprite;addBall(b.ay);b=${factory};`,`let b:Sprite;if(randint(0,1))b=${factory};addBall(b.ay);`,`let b:Sprite;let alias=b;b=${factory};addBall(alias.ay);`,`function later(){addBall(b.ay);}later();let b=${factory};`,`game.onUpdate(function(){addBall(b.ay);});let b=${factory};`])refused(prefix+tail);
 const program=parse(prefix+`let b=${factory};addBall(b.ay);`);assert.equal(isNumber(graph(program),argument(program)),true);
});

test('actual Number incoming arguments and ay property writers stay independently required',()=>{
 for(const text of [source.replace('addBall(80)','addBall("wrong")'),source.replace('ball.ay=ay','ball.ay="wrong" as any'),source.replace('ball.ay=ay','ball.ay=unknown()'),source.replace('ball.ay=ay','ay="wrong" as any;ball.ay=ay')])refused(text);
});

test('SDK shadowing extraction edited signatures and foreign receivers do not issue ay facts',()=>{
 for(const text of [source.replace('let balls:','let sprites:any=unknown();let balls:'),source.replace('addBall(80);','sprites.create=unknown as any;addBall(80);'),source.replace('addBall(80);','let create=sprites.create;unknown(create);addBall(80);'),source.replace('let ball=sprites.create('+image+')','let ball:Sprite=unknown()'),source.replace('balls.push(ball);','unknown(ball);balls.push(ball);')])refused(text);
 const program=parse(source),fn=program.body.find(node=>node.type==='FunctionDeclaration');fn.params.parameterProperties.push({name:'ay'});assert.equal(isNumber(graph(program),argument(program)),false);
});

test('observed changed physical receiver or throwing metadata expires the Number fact permanently',()=>{
 for(const mode of ['receiver','physical-copy','getter','throw']){
  const program=parse(source),read=argument(program),analysis=graph(program);assert.equal(isNumber(analysis,read),true);
  const original=read.object,originalName=original.name;let calls=0,undo;
  if(mode==='receiver'){read.object.name='foreign';undo=()=>{read.object.name=originalName;};}
  else if(mode==='physical-copy'){read.object={...original};undo=()=>{read.object=original;};}
  else{Object.defineProperty(program,'observation',{configurable:true,...(mode==='getter'?{get(){calls++;throw Error('getter must not run');}}:{value:new Proxy({},{ownKeys(){throw Error('actual snapshot failure');}})})});undo=()=>{delete program.observation;};}
  try{if(mode==='throw')assert.throws(()=>analysis.typesAt(read),/actual snapshot failure/);else assert.equal(isNumber(analysis,read),false);}finally{undo();}
  assert.equal(calls,0);assert.equal(isNumber(analysis,read),false);assert.equal(isNumber(graph(program),read),true);
 }
});

test('mutated Array traversal intrinsics cannot revive a retained physical Number certificate',()=>{
 for(const key of ['every','some','indexOf','map',Symbol.iterator]){
  const program=parse(source),read=argument(program),analysis=graph(program);assert.equal(isNumber(analysis,read),true);const original=Object.getOwnPropertyDescriptor(Array.prototype,key);
  try{Object.defineProperty(Array.prototype,key,{...original,value:function(...args){return Reflect.apply(original.value,this,args);}});assert.equal(isNumber(analysis,read),false);}finally{Object.defineProperty(Array.prototype,key,original);}
  assert.equal(isNumber(analysis,read),false);assert.equal(isNumber(graph(program),read),true);
 }
 const program=parse(source),read=argument(program),analysis=graph(program),receiver=read.object,prototype=Object.getPrototypeOf(receiver),includes=Object.getOwnPropertyDescriptor(Array.prototype,'includes');
 assert.equal(isNumber(analysis,read),true);
 try{Object.setPrototypeOf(receiver,{});Object.defineProperty(Array.prototype,'includes',{...includes,value:()=>true});assert.equal(isNumber(analysis,read),false);}finally{Object.defineProperty(Array.prototype,'includes',includes);Object.setPrototypeOf(receiver,prototype);}
 assert.equal(isNumber(analysis,read),false);assert.equal(isNumber(graph(program),read),true);
});
