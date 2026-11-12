import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {BaseTranslator} from '../overlay/scratch-gui/src/lib/bw-makecode/translate-base.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {validateCompilerOwnedProcedureConstraintSource as complete} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true});
const expression=text=>parse(text).body[0].expr;
const mutationDiagnostic='Source delete mutation is not supported; property deletion semantics are not implemented';
const options={ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const camera=(before='',after='')=>`function accept(property:number){return property}\n${before}\nlet result=accept(CameraProperty.X);\n${after}`;
const numberIssue=messages=>messages.some(message=>message.includes('accept.property requires Number from actual producers'));

test('delete parses as one physical unary property or index operation rather than independent identifier and read',()=>{
    const property=parse('delete CameraProperty.X;');assert.equal(property.body.length,1);
    assert.deepEqual(property.body[0].expr,{type:'Unary',op:'delete',argument:{type:'Member',object:{type:'Identifier',name:'CameraProperty'},name:'X'}});
    const indexed=expression('delete box[index()];');assert.equal(indexed.type,'Unary');assert.equal(indexed.op,'delete');
    assert.equal(indexed.argument.type,'Index');assert.equal(indexed.argument.object.name,'box');
    assert.equal(indexed.argument.index.type,'Call');assert.equal(indexed.argument.index.callee.name,'index');
});
test('delete keeps recursive unary postfix and binary precedence including comments and newlines',()=>{
    const a=expression('!delete box.value;');assert.equal(a.op,'!');assert.equal(a.argument.op,'delete');assert.equal(a.argument.argument.name,'value');
    const b=expression('delete box.value + 1;');assert.equal(b.type,'Binary');assert.equal(b.op,'+');assert.equal(b.left.op,'delete');assert.equal(b.right.type,'Number');
    for(const text of ['delete/* actual comment */box.value;','delete\nbox.value;','delete (box.value);']){
        const node=expression(text);assert.equal(node.op,'delete');assert.equal(node.argument.type,'Member');assert.equal(node.argument.name,'value');
    }
    const call=expression('delete factory().value;');assert.equal(call.argument.object.type,'Call');assert.equal(call.argument.object.callee.name,'factory');
});
test('delete member and object property spelling remains distinct from the prefix operator',()=>{
    const member=expression('box.delete();');assert.equal(member.type,'Call');assert.equal(member.callee.type,'Member');assert.equal(member.callee.name,'delete');
    const object=parse('let box={delete:1};');assert.equal(object.body[0].decls[0].init.type,'Object');
    assert.equal(object.body[0].decls[0].init.props[0].key,'delete');
    const ordinary=parse('let deleteSomething=1;');assert.equal(ordinary.body[0].decls[0].name,'deleteSomething');
});
test('base value and statement translators explicitly refuse deletion without emitting operand calls',()=>{
    const node=expression('delete factory().value;'),value=new BaseTranslator();
    assert.equal(value.expr(node),'0');assert.equal(value.unsupported.length,1);assert.ok(value.unsupported[0].startsWith(mutationDiagnostic));
    assert.match(value.unsupported[0],/factory/);
    const statement=new BaseTranslator(),out=[];statement.expressionStatement(node,0,out);
    assert.equal(statement.unsupported.length,1);assert.ok(statement.unsupported[0].startsWith(mutationDiagnostic));
    assert.equal(out.length,1);assert.ok(out[0].startsWith('# unsupported: '+mutationDiagnostic));
    assert.doesNotMatch(out.join('\n'),/^CALL:|^set |^change /m);
});
test('public Arcade and microbit report user object and index deletion as unsupported in value and statement positions',()=>{
    for(const convert of [arcadeToPseudocode,microbitToPseudocode])for(const text of [
        'let box={value:1};delete box.value;',
        'let values=[1,2];delete values[0];',
        'let box={value:1};let removed=delete box.value;']){
        const result=convert(text);assert.ok(result.unsupported.some(message=>message.startsWith(mutationDiagnostic)),text);
    }
});
test('Arcade deletion is routed before numeric folding and does not emit a false successful operand evaluation',()=>{
    for(const text of ['let removed=delete -Infinity;','let removed=delete (1+2);','let removed=delete factory().value;']){
        const result=arcadeToPseudocode(text);assert.ok(result.unsupported.some(message=>message.startsWith(mutationDiagnostic)),text);
        assert.equal(result.unsupported.some(message=>message.startsWith('Non-finite source Number literals')),false);
        assert.doesNotMatch(result.code,/^CALL:.*factory/m);
    }
});
test('correct physical delete mutations retain all existing Camera Number refusals before and after use',()=>{
    for(const effect of ['delete CameraProperty.X;','delete CameraProperty["X"];']){
        for(const text of [camera(effect),camera('',effect)])assert.ok(numberIssue(complete(parse(text),options)),text);
    }
    assert.deepEqual(complete(parse(camera('game.splash("ready");')),options),[]);
    const userObject=arcadeToPseudocode('let object={value:2};delete object.value;');
    assert.ok(userObject.unsupported.some(message=>message.startsWith(mutationDiagnostic)));
});
test('ordinary unary operators and deleted operand parser errors preserve their actual contracts',()=>{
    for(const op of ['!','-','+','~','typeof ']){
        const node=expression(op+'value;');assert.equal(node.type,'Unary');assert.equal(node.op,op.trim());assert.equal(node.argument.name,'value');
    }
    for(const text of ['delete;','let result=delete;']){
        const ast=parse(text);assert.notEqual(ast.body[0]?.expr?.type,'Identifier');
        // Missing operands are retained as actual parser uncertainty; never a
        // fabricated Camera member/Number producer or successful deletion.
        const node=text.startsWith('let')?ast.body[0].decls[0].init:ast.body[0].expr;
        assert.equal(node.op,'delete');assert.equal(node.argument.type,'Unknown');
    }
});
