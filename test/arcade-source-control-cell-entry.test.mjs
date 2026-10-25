import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {createSourceControlCellEntry} from '../overlay/scratch-gui/src/lib/bw-makecode/source-control-cell-entry.js';
import {analyseSourceValueProducers,validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const parse=s=>parseMakeCodeTs(s,{parameterDefaults:true,retainParentheses:true});
const all=(n,out=[])=>{if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(x=>all(x,out));return out;}out.push(n);for(const[k,v]of Object.entries(n))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(k))all(v,out);return out;};
const source=`let value=0;function use(n:number){}function run(unknown:boolean){let flag=0;while(flag===0){if(flag===0){value=2;}if(flag===0){use(value);flag=1;}}}run(false);`;
const read=p=>all(p).find(n=>n.type==='Call'&&n.callee?.name==='use')?.args[0];
const check=(s,expected)=>{const p=parse(s),r=read(p),proof=createSourceControlCellEntry(p);assert.ok(r);assert.equal(proof.isInitializedRead(r),expected,s);return {p,r,proof};};

test('actual finite control cells preserve occurrence readiness across correlated guards',()=>{
 const {p,r,proof}=check(source,true);assert.equal(proof.current(),true);
 assert.deepEqual(validateProcedureConstraintSource(p,{ordinaryPrimitiveSdkNumbers:true}),[]);
 const original=analyseSourceValueProducers(p,{unboundIsOpaque:true,opaqueDeclarationValues:true,primitiveControlEntries:true,controlEntry:proof});
 assert.equal(original.typesAt(r).has('Undefined'),true);
 assert.equal(original.isInitializedAt(r),false);
 assert.equal(proof.isInitializedRead({...r}),false);
});
test('Boolean and Number valuations retain their distinct correlated branches',()=>{
 check('let value=0;function use(n:number){}function run(){let flag=false;while(!flag){if(!flag)value=2;if(!flag){use(value);flag=true;}}}run();',true);
 check('let value=0;function use(n:number){}function run(unknown:boolean){let flag=1;if(unknown){value=2;flag=true;}if(flag===true)use(value);}run(false);',true);
});
test('unknown outer branches and guard mismatches keep every possible path',()=>{
 for(const body of [
  'if(unknown){if(flag===0)value=2;}if(flag===0)use(value);flag=1;',
  'if(flag!==0)value=2;if(flag===0)use(value);flag=1;',
  'if(flag===true)value=2;if(flag===0)use(value);flag=1;',
  'if(unknown)value=2;if(flag===0)use(value);flag=1;'
 ])check(source.replace('if(flag===0){value=2;}if(flag===0){use(value);flag=1;}',body),false);
});
test('zero iteration, early break, continue and unreachable reads do not grant readiness',()=>{
 const prefix='let value=0;function use(n:number){}function run(unknown:boolean){';
 for(const body of [
  'let flag=1;while(flag===0){value=2;}flag=1;use(value);',
  'let flag=0;while(flag===0){if(unknown){flag=1;break;}value=2;flag=1;}use(value);',
  'let flag=0;while(flag===0){flag=1;continue;value=2;}use(value);',
  'let flag=0;while(flag===0){flag=1;continue;use(value);}',
  'let flag=0;while(flag===0){return;use(value);}',
  'let flag=0;while(flag===0){throw 1;use(value);}'
 ])check(prefix+body+'}run(false);',false);
});
test('block-local declarations reset at each loop iteration and actual TDZ reads stay unready',()=>{
 check('function use(n:number){}function run(unknown:boolean){let flag=0;while(flag===0){use(local);let local=2;flag=1;}}run(false);',false);
 check('function use(n:number){}function run(unknown:boolean){let flag=0;while(flag===0){let local=2;if(flag===0){use(local);flag=1;}}}run(false);',true);
 check('function use(n:number){}function run(){let flag=0;while(flag!==2){if(flag===1)use(local);let local=2;if(flag===0){flag=1;}else{flag=2;}}}run();',false);
});
test('complete writer and reference inventory excludes captured aliased dynamic and forged controls',()=>{
 for(const extra of ['flag=foreign();','flag+=1;','flag++;','let alias=flag;','take(flag);','function mutate(){flag=1;}','let callback=()=>{flag=1;};','eval("flag=1");','let flag=1;','function mutate(){eval("flag=1");}mutate();']){
  const s=source.replace('let flag=0;','let flag=0;'+extra);check(s,false);
 }
 check(source.replace('let flag=0;','var flag=0;'),false);
 check(source.replace('while(flag===0)', 'for(;flag===0;)'),false);
 check(source.replace('function run(unknown:boolean){let flag=0;','let flag=0;function run(unknown:boolean){'),false);
 check(source.replace('if(flag===0){value=2;}','if(unknown){value=2;}'),false);
 check(source.replace('flag===0','flag==0'),false);
 check(source.replaceAll('flag','__bwLoopExit1').replace('let __bwLoopExit1=0;','let __bwLoopExit1=foreign();'),false);
 const forged=parse(source.replace('let flag=0;','let flag=foreign();'));for(const n of all(forged)){n.temporary=true;n.sourceLoop=true;}
 assert.equal(createSourceControlCellEntry(forged).isInitializedRead(read(forged)),false);
});
test('real Undefined and mixed primitive writers survive positive readiness',()=>{
 for(const literal of ['undefined','"bad"','null']){
  const {p}=check(source.replace('value=2;','value='+literal+';'),true);
  assert.ok(validateProcedureConstraintSource(p,{ordinaryPrimitiveSdkNumbers:true}).some(x=>x.includes('use.n')));
 }
});
test('actual object writers retain their Number refusal without extra precision',()=>{
 const p=parse(source.replace('value=2;','value={} as any;'));
 assert.ok(validateProcedureConstraintSource(p,{ordinaryPrimitiveSdkNumbers:true}).some(x=>x.includes('use.n')));
});
test('same-value physical replacement and observed ambient changes expire a used proof permanently',()=>{
 const {p,r,proof}=check(source,true),call=all(p).find(n=>n.type==='Call'&&n.callee?.name==='use');
 call.args[0]={...r};assert.equal(proof.current(),false);call.args[0]=r;assert.equal(proof.isInitializedRead(r),false);
 const next=check(source,true),before=Object.getOwnPropertyDescriptor(Array.prototype,'extraControlEntry');
 try{Object.defineProperty(Array.prototype,'extraControlEntry',{value:1,configurable:true});assert.equal(next.proof.current(),false);}
 finally{if(before)Object.defineProperty(Array.prototype,'extraControlEntry',before);else delete Array.prototype.extraControlEntry;}
 assert.equal(next.proof.isInitializedRead(next.r),false);
});
test('state bounds fall back as a whole without partial occurrence facts',()=>{
 check(source.replace('let flag=0;', 'let flag=0;'+Array.from({length:9},(_,i)=>'let unused'+i+'=0;').join('')),true);
 check(source.replace('let flag=0;', 'let flag=0;'+Array.from({length:9},(_,i)=>'let control'+i+'=0;if(control'+i+'===0){}').join('')),false);
});
test('actual post-test source imports with all original calls and assignments preserved',()=>{
 const text='let sample=0;let total=0;function evaluate(n:number){total=n;return false;}function run(){do{sample=randint(2,4);}while(evaluate(sample));}run();';
 const result=arcadeToPseudocode(text);assert.deepEqual(result.unsupported,[]);assert.match(result.code,/evaluate/);assert.match(result.code,/sample/);assert.match(result.code,/total/);
});
test('post-test readiness survives Code, repeated saved JSON conversion and SB3 reopening with the real assignments retained',async()=>{
 const text='let sample=0;let total=0;function evaluate(n:number){total=n;return false;}function run(){do{sample=randint(2,4);}while(evaluate(sample));}run();';
 const create=input=>{const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return creator;};
 const bodies=project=>{
  const prototypes=project.targets.flatMap(target=>Object.values(target.blocks).filter(node=>node.opcode==='procedures_prototype').map(node=>node.mutation.proccode));
  assert.equal(prototypes.filter(name=>/evaluate/.test(name)).length,1);
  assert.equal(prototypes.filter(name=>/(?:^|_)run(?:\s|$)/.test(name)).length,1);
  const vars=project.targets.flatMap(target=>Object.entries(target.variables).filter(([,row])=>/^(?:Game_)?(?:sample|total)$/.test(row[0])));
  assert.equal(vars.length,2);
  const ids=new Set(vars.map(([id])=>id));
  const writes=project.targets.flatMap(target=>Object.values(target.blocks).filter(node=>node.opcode==='data_setvariableto'&&ids.has(node.fields.VARIABLE[1])));
  assert.equal(writes.length,4,'both initializations and both actual function assignments survive');
 };
 let creator=create(text);bodies(creator.project);
 const code=new Creator();code.parse(creator.decompile());assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);bodies(code.project);creator=code;
 for(let generation=0;generation<2;generation++){
  const exported=projectJsonToArcade(JSON.stringify(creator.project));assert.deepEqual(exported.unsupported,[],`generation ${generation}: ${JSON.stringify(exported.unsupported)}`);
  creator=create(exported.files);bodies(creator.project);
 }
 const archive=await JSZip.loadAsync(await(await creator.generateSB3()).arrayBuffer());const json=await archive.file('project.json').async('string');bodies(JSON.parse(json));
 const reopened=projectJsonToArcade(json);assert.deepEqual(reopened.unsupported,[]);bodies(create(reopened.files).project);
});

const predicates=`function equal(a:any,b:any):boolean{return a===b}function less(a:any,b:any):boolean{return a<b}`;
const emittedGuards=predicates+`let value=0;function use(n:number){}function run(){let flag=0;flag=(0+0);while(equal(flag,(0+0))){if(!less(0,1)){flag=(0+1);}if(equal(flag,(0+0))){value=2;}if(equal(flag,(0+0))){use(value);flag=(0+1);}}}run();`;
const inspectPredicate=s=>{const p=parseMakeCodeTs(s,GENERATED_HELPER_PROFILES.ordinary),r=read(p),proof=createSourceControlCellEntry(p);assert.ok(r);return {p,r,proof};};
const predicateReady=(s,expected)=>{const result=inspectPredicate(s);assert.equal(result.proof.isInitializedRead(result.r),expected,s);return result;};
test('pure constant arithmetic and canonical comparison calls preserve original physical readiness',()=>{
 const {p,proof,r}=predicateReady(emittedGuards,true),before=JSON.stringify(p);
 const direct=parse(emittedGuards);assert.equal(createSourceControlCellEntry(direct).isInitializedRead(read(direct)),true);
 assert.deepEqual(validateProcedureConstraintSource(direct,{ordinaryPrimitiveSdkNumbers:true}),[]);
 assert.deepEqual(validateProcedureConstraintSource(p,{ordinaryPrimitiveSdkNumbers:true}),[]);
 assert.equal(proof.isInitializedRead({...r}),false);
 assert.equal(JSON.stringify(p),before);assert.equal(p.body.filter(n=>n.type==='FunctionDeclaration'&&['equal','less'].includes(n.name)).length,2);
 assert.equal(all(p).filter(n=>n.type==='Call'&&n.callee?.name==='equal').length,3);
 predicateReady(emittedGuards.replaceAll('equal','renamed'),true);
 for(const zero of ['(+0)','(2-2)','(2*0)','(0/2)','(2%2)','((0+0))'])predicateReady(emittedGuards.replace('flag=(0+0)','flag='+zero),true);
});
test('control constants reject effects names objects strings nonfinite values and calls including predicate calls',()=>{
 for(const zero of ['unknown()','equal(0,0)','less(1,0)','other','({} as any)','("0"+0)','(1/0)','(1e308*1e308)'])predicateReady(emittedGuards.replace('flag=(0+0)','flag='+zero),false);
 const deep='(0+'.repeat(20)+'0'+')'.repeat(20);predicateReady(emittedGuards.replace('flag=(0+0)','flag='+deep),false);
});
test('helper body binding arity and complete reference census cannot be supplied by names or metadata',()=>{
 for(const edit of [
  emittedGuards.replace('return a===b','return a==b'),
  emittedGuards.replace('return a===b','return b===a'),
  emittedGuards.replace('return a===b','value=3;return a===b'),
  emittedGuards.replace('a:any,b:any','a:any,b:any=0'),
  emittedGuards.replace('function equal(','function equal<T>('),
  emittedGuards+'let alias=equal;',
  emittedGuards+'register(equal);',
  emittedGuards.replace('while(equal(flag,(0+0)))','while(equal(flag,other))'),
  emittedGuards.replace('use(value);flag=(0+1);','use(value);let stored=equal(flag,0);flag=(0+1);'),
  emittedGuards+'equal=other;',
  emittedGuards+'function equal(a:any,b:any):boolean{return a===b}',
  emittedGuards.replace('while(equal(flag,(0+0)))','while(equal(flag))'),
  emittedGuards.replace('while(equal(flag,(0+0)))','while(equal(flag,(0+0),1))'),
  emittedGuards.replace('while(equal(flag,(0+0)))','while((function(equal:any){return equal(flag,0)})(other))'),
  emittedGuards.replace('if(equal(flag,(0+0))){use(value);','if(ordinary(flag,(0+0))){use(value);')
 ])predicateReady(edit,false);
 const result=inspectPredicate(emittedGuards),call=all(result.p).find(n=>n.type==='Call'&&n.callee?.name==='equal');
 call.typeArguments={};assert.equal(createSourceControlCellEntry(result.p).isInitializedRead(result.r),false);
});
test('strict predicate values keep Boolean and Number distinct and unknown guards remain possible',()=>{
 predicateReady(predicates+'let value=0;function use(n:number){}function run(unknown:boolean){let flag=1;if(unknown){value=2;flag=true;}if(equal(flag,true))use(value);}run(false);',true);
 predicateReady(predicates+'let value=0;function use(n:number){}function run(unknown:boolean){let flag=true;if(equal(flag,1))value=2;if(equal(flag,true))use(value);}run(false);',false);
 predicateReady(predicates+'let value=0;function use(n:number){}function run(unknown:boolean){let flag=0;if(unknown){if(equal(flag,0))value=2;}if(equal(flag,0))use(value);}run(false);',false);
});
test('proved helper calls expire on body callee and equal-shape physical replacement without revival',()=>{
 for(const change of ['body','callee']){
  const {p,r,proof}=predicateReady(emittedGuards,true),fn=p.body.find(n=>n.name==='equal'),call=all(p).find(n=>n.type==='Call'&&n.callee?.name==='equal');
  const holder=change==='body'?fn:call,key=change==='body'?'body':'callee',old=holder[key];
  holder[key]=JSON.parse(JSON.stringify(old));assert.equal(proof.current(),false);holder[key]=old;assert.equal(proof.isInitializedRead(r),false);
 }
});

test('negative-only source preflight bounds actual nodes and array work without evaluating accessors or iterators',()=>{
 const oversized=parse(source),run=oversized.body.find(n=>n.name==='run');
 run.body.push(...Array.from({length:3100},()=>({type:'ExpressionStatement',expr:{type:'Number',value:'0'}})));
 assert.equal(createSourceControlCellEntry(oversized).isInitializedRead(read(oversized)),false);
 const slots=parse(source);slots.padding=new Array(100001);
 assert.equal(createSourceControlCellEntry(slots).isInitializedRead(read(slots)),false);
 for(const key of ['inert',Symbol.iterator]){
  const p=parse(source),r=read(p);let invoked=0;
  Object.defineProperty(key===Symbol.iterator?p.body:p,key,{enumerable:true,configurable:true,get(){invoked++;throw Error('source getter must not run');}});
  assert.equal(createSourceControlCellEntry(p).isInitializedRead(r),false);assert.equal(invoked,0);
 }
 const good=check(source,true);assert.equal(good.proof.current(),true);
});
