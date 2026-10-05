import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const lower = source => lowerNamespaceBindings(parseMakeCodeTs(source));
const nodes = (tree, type) => {
    const out=[];
    const visit=node=>{if(!node || typeof node!=='object')return;if(node.type===type)out.push(node);Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(visit):visit(value));};
    visit(tree);return out;
};

test('namespace variables and functions retain separate bindings and qualified calls', () => {
    const result=lower(`
namespace Left { let count=3; export function next(){ count+=1; return count; } }
namespace Right { let count=7; export function next(){ count+=2; return count; } }
let first=Left.next(); let second=Right.next();`);
    assert.deepEqual(result.unsupported,[]);
    const functions=result.program.body.filter(st=>st.type==='FunctionDeclaration');
    assert.deepEqual(functions.map(fn=>fn.name),['__bwNamespace_Left_next','__bwNamespace_Right_next']);
    assert.equal(functions[0].body[0].expr.left.name,'__bwNamespace_Left_count');
    assert.equal(functions[1].body[0].expr.left.name,'__bwNamespace_Right_count');
    assert.deepEqual(nodes(result.program,'Call').map(call=>call.callee.name),functions.map(fn=>fn.name));
});

test('namespace captures respect parameter, block and loop shadowing', () => {
    const result=lower(`namespace Counter { let value=4;
export function read(value:number) { { let value=8; value+=1; } for(let value=0;value<2;value++){ value+=1; } return value; }
export function capture() { sprites.onCreated(SpriteKind.Player,function(sprite){ value+=1; sprite.x=value; }); }
}`);
    assert.deepEqual(result.unsupported,[]);
    const functions=result.program.body.filter(st=>st.type==='FunctionDeclaration');
    assert.equal(functions[0].body.at(-1).value.name,'value');
    const captured=nodes(functions[1],'Assignment');
    assert.equal(captured[0].left.name,'__bwNamespace_Counter_value');
    assert.equal(captured[1].right.name,'__bwNamespace_Counter_value');
    assert.ok(nodes(functions[0],'Identifier').filter(node=>node.name==='value').length>=5);
});

test('nested namespaces and numeric enums use exact signed values and implicit increments', () => {
    const result=lower(`const base=2; enum Direction { Left=-3, Right=Left+base, Next }
namespace States { export namespace Inner { export enum Mode { Start=Direction.Left, Next, Last=Next*3 } export const value=Mode.Last; } }
let answer=States.Inner.value+Direction.Next;`);
    assert.deepEqual(result.unsupported,[]);
    assert.equal(nodes(result.program,'Enum').length,0);
    const value=result.program.body.find(st=>st.type==='Declaration' && st.decls[0].name==='__bwNamespace_States_Inner_value');
    assert.equal(value.decls[0].init.value,-6);
    assert.equal(result.program.body.at(-1).decls[0].init.right.value,0);
});

test('unsafe namespace uses and nonconstant enums keep explicit diagnostics', () => {
    for(const [source,diagnostic] of [
        ['namespace A { let hidden=1 } let x=A.hidden;',/private/],
        ['let x=A.f(); namespace A { export function f(){return 1} }',/before initialization/],
        ['function f(){return A.x} let x=f(); namespace A { export let x=1 }',/before initialization/],
        ['namespace A { export let value=1 } let x=A;',/runtime object/],
        ['namespace A { export let value=1 } let x=A["value"];',/runtime object/],
        ['namespace A { export function f(){return 1} } let x=A.f;',/runtime function value/],
        ['namespace A { export let x=1 } namespace A { export let y=2 }',/declared more than once/],
        ['enum E { Value=randint(1,3) } let x=E.Value;',/constant initializer/],
        ['function f(){ enum E { A } return E.A }',/local enum/]
    ]) {
        const result=lower(source);assert.equal(result.program,null,source);assert.ok(result.unsupported.some(gap=>diagnostic.test(gap)),source);
        assert.ok(arcadeToPseudocode(source).unsupported.some(gap=>diagnostic.test(gap)),source);
    }
});


test('ordinary sprite redeclarations bypass namespace-only declaration rules',()=>{
    const source='let actor=sprites.create(img`1`,SpriteKind.Player);let actor=sprites.create(img`2`,SpriteKind.Player);actor.setPosition(20,30);';
    const parsed=parseMakeCodeTs(source),result=lowerNamespaceBindings(parsed);
    assert.equal(result.program,parsed,'programs without scoped declarations retain their existing AST');
    assert.deepEqual(result.unsupported,[]);
    assert.ok(!arcadeToPseudocode(source).unsupported.some(gap=>gap.includes('namespace binding')));
});
