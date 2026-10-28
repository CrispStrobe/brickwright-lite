import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const calls=node=>node&&typeof node==='object'?(node.type==='Call'?1:0)+Object.values(node).reduce((n,v)=>n+(Array.isArray(v)?v.reduce((a,c)=>a+calls(c),0):calls(v)),0):0;

test('object declaration retains one RHS, property order, renaming, computed keys, defaults and nested bindings',()=>{
    const ast=parseMakeCodeTs('const {[key()]: renamed=fallback(), plain, nested:{value:inner=next()}, ...rest}=make();');
    const declaration=ast.body[0];assert.equal(declaration.type,'DestructuringDeclaration');assert.equal(declaration.kind,'const');
    assert.equal(declaration.declarations.length,1);const {pattern,init}=declaration.declarations[0];
    assert.equal(init.callee.name,'make');assert.equal(calls(init),1);
    assert.deepEqual(pattern.properties.map(p=>p.type),['BindingProperty','BindingProperty','BindingProperty','RestElement']);
    assert.equal(pattern.properties[0].computed,true);assert.equal(pattern.properties[0].key.callee.name,'key');
    assert.equal(pattern.properties[0].value.type,'AssignmentPattern');assert.equal(pattern.properties[0].value.left.name,'renamed');assert.equal(pattern.properties[0].value.right.callee.name,'fallback');
    assert.equal(pattern.properties[1].value.name,'plain');
    assert.equal(pattern.properties[2].value.properties[0].value.left.name,'inner');
    assert.equal(pattern.properties[2].value.properties[0].value.right.callee.name,'next');
    assert.equal(pattern.properties[3].argument.name,'rest');
});

test('array declaration retains holes, defaults and rest without re-evaluating the source expression',()=>{
    const node=parseMakeCodeTs('let [first,,third=fallback(),...tail]=load(), ordinary=after();').body[0];
    assert.equal(node.declarations.length,2);const array=node.declarations[0];
    assert.equal(array.pattern.type,'ArrayPattern');assert.equal(array.pattern.elements[1],null);
    assert.equal(array.pattern.elements[2].left.name,'third');assert.equal(array.pattern.elements[3].argument.name,'tail');
    assert.equal(calls(array.init),1);assert.equal(node.declarations[1].pattern.name,'ordinary');assert.equal(node.declarations[1].init.callee.name,'after');
    for(const source of ['const {...rest,other}=make()','let [...rest,last]=load()','let [...rest=next()]=load()'])assert.throws(()=>parseMakeCodeTs(source),/rest binding must be last/);
});

test('generic functions retain erased type parameters, constraints, defaults and the runtime factory call',()=>{
    const fn=parseMakeCodeTs('export function getState<U extends Array<Array<number>> = Array<number>, V=U>(factory:()=>U):U {return factory()}').body[0];
    assert.deepEqual(fn.typeParameters,[{name:'U',constraint:'Array<Array<number>>',defaultType:'Array<number>'},{name:'V',constraint:'',defaultType:'U'}]);
    assert.equal(fn.exported,true);assert.equal(fn.paramTypes.factory.text,'()=>U');assert.equal(fn.returnType,'U');
    assert.equal(fn.body[0].value.callee.name,'factory');
});

test('function array assertions and return predicates erase only type syntax',()=>{
    const ast=parseMakeCodeTs('function entries(){return read() as ((status:Sprite,image:Image)=>void)[]} function absent(value:any):value is null|undefined{return value===null||value===undefined}');
    assert.equal(ast.body[0].body[0].value.callee.name,'read');
    assert.equal(ast.body[1].returnType,'valueisnull|undefined');assert.equal(ast.body[1].body[0].value.op,'||');
});

test('destructuring remains explicitly unsupported until converter binding lowering is implemented',()=>{
    const imported=arcadeToPseudocode('let source={value:3};const {value:bound}=source;let observed=bound');
    assert.ok(imported.unsupported.some(s=>s.includes('DestructuringDeclaration')),JSON.stringify(imported.unsupported));
});

test('original pinned Arcade compiler accepts an executed generic factory call',async()=>{
    const main='function getState<U>(factory:()=>U):U{return factory()} let observed=getState(()=>3); observed+=0;';
    const built=await compile('arcade',{'main.ts':main,'pxt.json':JSON.stringify({name:'generic-control',dependencies:{device:'*'},files:['main.ts']})});
    assert.equal(built.success,true,JSON.stringify(built.diagnostics));assert.deepEqual(built.diagnostics,[]);assert.ok(built.outfiles['binary.js']);
});

test('the pinned original target refuses active object bindings while their source AST remains available',async()=>{
    const main='let object={value:3}; const {value:bound}=object; let observed=bound; observed+=0;';
    const built=await compile('arcade',{'main.ts':main,'pxt.json':JSON.stringify({name:'destructuring-boundary',dependencies:{device:'*'},files:['main.ts']})});
    assert.equal(built.success,false);assert.ok(built.diagnostics.some(d=>d.message==='BindingElement not supported'));
    assert.equal(parseMakeCodeTs(main).body[1].type,'DestructuringDeclaration');
});


test('destructured for-of retains its binding pattern, one iterable expression and body effects',()=>{
    const node=parseMakeCodeTs('for(const {value:bound} of rows()){use(bound)}').body[0];
    assert.equal(node.type,'DestructuringForOf');assert.equal(node.pattern.properties[0].value.name,'bound');
    assert.equal(node.iterable.callee.name,'rows');assert.equal(calls(node.iterable),1);assert.equal(node.body[0].expr.callee.name,'use');
    const imported=arcadeToPseudocode('for(const {value} of [{value:3}]){let observed=value}');
    assert.ok(imported.unsupported.some(s=>s.includes('DestructuringForOf')));
    for(const source of ['function f<T extends>(){}','function f<T=>(){}'])assert.throws(()=>parseMakeCodeTs(source));
});

test('generic metadata preserves type word boundaries and literal type spelling',()=>{
    const fn=parseMakeCodeTs('function make<T extends keyof U, U={kind:"small"}>(key:T):U{return null}').body[0];
    assert.equal(fn.typeParameters[0].constraint,'keyof U');
    assert.equal(fn.typeParameters[1].defaultType,'{kind:"small"}');
});
