import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
const profile=GENERATED_HELPER_PROFILES.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const options={arrayValues:true,parenthesized:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true};
const parse=source=>parseMakeCodeTs(source,profile);
const domain=source=>{const ast=parse(header+';'+source);return {ast,proof:inspectNativeArrayBinaryDomains(ast,profile)};};
const good=source=>{const out=domain(source);assert.equal(out.proof.reason,null,source);assert.equal(out.proof.helpers.size,1);assert.equal(out.proof.current(),true);return out;};
const bad=source=>{const out=domain(source);assert.equal(out.proof.helpers.size,0,source);assert.equal(typeof out.proof.reason,'string',source);};
const closureRead=ast=>ast.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='callback')).decls[0].init.body.find(node=>node.type==='Return').value;

test('actual closure allocation retains declaration execution without initializing a global value or granting its type',()=>{
    const ast=parse('Math.abs(1);let value:any;let callback=function(){return value};value="later";');
    const read=closureRead(ast),graph=analyseSourceValueProducers(ast,options);
    assert.equal(graph.isInitializedAt(read),false,'bare global let is not a value-initialization fact');
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true,'actual closure allocated after declaration completion');
    assert.equal(graph.isLexicalDeclarationExecutedAt(read,graph.bindingOf(read)),true);
    assert.ok(graph.typesAt(read).has('Undefined'),'actual Undefined read is retained');
    const literals=parse('Math.abs(1);let value:any;let flag=true;let other=false;let text="raw text";let item={safe:1};let selected=item["safe"];let callback=function(){return value};value="later";');
    assert.equal(literals.body[2].decls[0].init.value,true,'Boolean AST value is a boolean');
    assert.equal(literals.body[3].decls[0].init.value,false);
    const rawEscape=parse(String.raw`let key="constr\u0075ctor";`).body[0].decls[0].init;
    assert.equal(rawEscape.type,'String');
    assert.equal(rawEscape.value,String.raw`constr\u0075ctor`,'parser retains the source escape spelling');
    assert.equal(literals.body[4].decls[0].init.type,'String');
    assert.equal(typeof literals.body[4].decls[0].init.value,'string');
    assert.equal(analyseSourceValueProducers(literals,options).isCapturedLexicalDeclarationReadyAt(closureRead(literals)),true,'raw string and boolean literals retain genuine readiness');
    good('Math.abs(1);let value:any;let callback=function(){return __bwBinaryAdd(value,"!")};let first=callback();value="later";');
    good('Math.abs(1);let value:any;let callback=function(){return function(){return __bwBinaryAdd(value,"!")}};value="later";');
    bad('Math.abs(1);let value:any;let callback=function(){return __bwBinaryAdd(value,"!")};callback();');
    const indexed=parse('Math.abs(1);let value:any;let values=[1];let index=0;let callback=function(){let item=values[index];return value};value="later";');
    assert.equal(analyseSourceValueProducers(indexed,options).isCapturedLexicalDeclarationReadyAt(closureRead(indexed)),true,'actual Array receiver plus genuine Number index is distinct from unproved computed reflection');

});

test('closure allocation before declaration and initializer self-entry retain real lexical TDZ obligations',()=>{
    for(const source of [
        'Math.abs(1);let callback=function(){return __bwBinaryAdd(value,"!")};let value:any;value="later";callback();',
        'Math.abs(1);let value:any=(function(){return __bwBinaryAdd(value,"!")})();value="later";',
        'let first=__bwBinaryAdd(value,1);let value=2;',
        'function outer(){let first=__bwBinaryAdd(value,1);let value=2;return first}outer();'
    ])bad(source);
    const ast=parse('let value=(function(){return value})();'),allocation=ast.body[0].decls[0].init.callee;
    const graph=analyseSourceValueProducers(ast,options),read=allocation.body[0].value;
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false,'own initializer has not completed declaration');
    const shadow=parse('let value=1;let callback=function(){return value;let value=2};');
    assert.equal(analyseSourceValueProducers(shadow,options).isCapturedLexicalDeclarationReadyAt(closureRead(shadow)),false,'inner lexical identity cannot borrow an outer spelling');
});

test('all primitive writers remain mandatory and readiness cannot loan Array object annotation or default effects',()=>{
    for(const writer of ['foreign()','{}','[1]','[{}]','sprites.create(img`1`,0)'])
        bad('Math.abs(1);let value:any;let callback=function(){return __bwBinaryAdd(value,"!")};value='+writer+';callback();');
    bad('Math.abs(1);let values:any;let callback=function(){return __bwBinaryAdd(values,"!")};callback();values=[1];');
    for(const effect of ['eval("value = {}")','let execute=eval;execute("value = {}")',
        'Function("value = {}")()', 'Reflect.set({},"x",1)', 'let ctor=(function(){}).constructor;ctor("value = {}")()',
        'let ctor=(function(){})["constructor"];ctor("value = {}")()',
        String.raw`let ctor=(function(){})["constr\u0075ctor"];ctor("value = {}")()`]){
        const source='Math.abs(1);let value:any;'+effect+';let callback=function(){return value};value="later";callback();';
        const ast=parse(source),read=closureRead(ast);
        assert.equal(read.type,'Identifier');
        assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(read),false,'reflection supplies no new lexical readiness authority');
        const out=domain(source.replace('return value','return __bwBinaryAdd(value,"!")'));
        assert.equal(out.proof.helpers.size,0,'reflection may already prevent canonical helper selection; no domain reason is invented');
    }
    const ast=parse('Math.abs(1);let value:any;let callback=function(arg=foreign()){return value};value="later";');
    const callable=ast.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='callback').decls[0].init;
    assert.equal(Object.hasOwn(callable,'parameterDefaults'),false,'ordinary function expression omits the callable-level copy');
    const defaults=Object.getOwnPropertyDescriptor(callable.params,'parameterDefaults');
    assert.equal(defaults.enumerable,false,'actual params default metadata is nonenumerable');
    assert.equal(defaults.value.length,1);
    assert.equal(defaults.value[0].name,'arg');
    assert.equal(defaults.value[0].value.type,'Call');
    assert.equal(defaults.value[0].value.callee.name,'foreign');
    assert.deepEqual(callable.optionalParams,['arg'],'enumerable optional copy survives actual private view cloning');
    const cloned=parse('Math.abs(1);let value:any;let callback=function(arg=foreign()){return value};value="later";');
    const clonedCallable=cloned.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='callback').decls[0].init;
    clonedCallable.params=clonedCallable.params.map(name=>name);
    assert.equal(Object.hasOwn(clonedCallable.params,'parameterDefaults'),false,'Array.map omits hidden default metadata');
    assert.equal(analyseSourceValueProducers(cloned,options).isCapturedLexicalDeclarationReadyAt(closureRead(cloned)),false,'retained actual optional signature cannot borrow omitted default metadata');
    assert.equal(closureRead(ast).type,'Identifier','default control queries the actual return operand');
    assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(closureRead(ast)),false,'defaults are not erased or modeled as empty input');
});

test('only actual statement slots enroll declarations and observed source mutation sticky-revokes readiness',()=>{
    const ast=parse('Math.abs(1);let callback=function(){return value};let value:any;value="later";');
    ast.body[0].expr.fakeDeclaration={type:'Declaration',kind:'let',decls:[{name:'value',init:null}]};
    assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(closureRead(ast)),false,'metadata-shaped declaration cannot execute');
    ast.body[0].expr.args.push({type:'Declaration',kind:'let',decls:[{name:'value',init:null}]});
    assert.equal(analyseSourceValueProducers(ast,options).isCapturedLexicalDeclarationReadyAt(closureRead(ast)),false,'argument record is not an owned statement slot');
    for(const mutation of ['writer','position']){
        const before=parse('Math.abs(1);let value:any;let callback=function(){return value};value="later";');
        const held=analyseSourceValueProducers(before,options),operand=closureRead(before);
        if(mutation==='writer')before.body.at(-1).expr.right={type:'Object',props:[]};
        else {const decl=before.body.splice(1,1)[0];before.body.push(decl);}
        assert.equal(held.isCapturedLexicalDeclarationReadyAt(operand),false,'mutation BEFORE the first query cannot enroll post-analysis source');
        assert.equal(held.lexicalDeclarationReadinessCurrent(),false);
    }
    const watched=parse('Math.abs(1);let value:any;let callback=function(){return value};value="later";');
    const watcher=analyseSourceValueProducers(watched,options),savedWriter=watched.body.at(-1).expr.right;
    watched.body.at(-1).expr.right={type:'Object',props:[]};
    assert.equal(watcher.lexicalDeclarationReadinessCurrent(),false,'CURRENT before the first FACT still observes the original graph baseline');
    watched.body.at(-1).expr.right=savedWriter;
    assert.equal(watcher.isCapturedLexicalDeclarationReadyAt(closureRead(watched)),false,'observed current-only ABA cannot enroll a later restored source');
    const fresh=parse('Math.abs(1);let value:any;let callback=function(){return value};value="later";'),read=closureRead(fresh),graph=analyseSourceValueProducers(fresh,options);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),true);
    const decl=fresh.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='value'),saved=decl.decls[0].init;
    decl.decls[0].init={type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]};
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false);
    decl.decls[0].init=saved;
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read),false,'ABA cannot revive an observed expired source frontier');
    const out=good('Math.abs(1);let value:any;let callback=function(){return __bwBinaryAdd(value,"!")};value="later";callback();');
    out.ast.body.push({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]}});
    assert.equal(out.proof.current(),false,'original full source currentness still guards domain proof');
});
