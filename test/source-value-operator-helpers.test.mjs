import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {SOURCE_BINARY_OPERATORS,lowerSourceValueOperatorHelpers,sourceValueOperation} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-operator-helpers.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const parse=source=>parseMakeCodeTs(source,profile);
const declaration=program=>program.body.find(node=>node.type==='Declaration').decls[0].init;

test('complete source operator bodies lower by actual root binding and calls, including renamed functions',()=>{
    for(const op of SOURCE_BINARY_OPERATORS){
        const ast=parse(`function renamed(left:any,right:any):${op==='+'?'any':'number'}{return left ${op} right};let answer=renamed([5],2)`);
        const originalArgs=ast.body.find(node=>node.type==='Declaration').decls[0].init.args;
        const lowered=lowerSourceValueOperatorHelpers(ast,profile),value=declaration(lowered);
        assert.deepEqual([value.left,value.right],originalArgs,'actual argument ASTs and order survive unchanged');
        assert.equal(lowered.body.some(node=>node.type==='FunctionDeclaration'),false,op);
        assert.equal(value.type,'Binary');assert.equal(value.op,op);
        assert.equal(value.left.type,'Array');assert.deepEqual(value.right,originalArgs[1]);assert.equal(value.right.type,'Number');assert.equal(value.right.value,'2');
    }
    const ast=parse('function renamed(value:any):number{return ~value};let answer=renamed([])');
    const lowered=lowerSourceValueOperatorHelpers(ast,profile),value=declaration(lowered);
    assert.equal(lowered.body.some(node=>node.type==='FunctionDeclaration'),false);
    assert.equal(value.type,'Unary');assert.equal(value.op,'~');assert.equal(value.argument.type,'Array');
});

test('helper spellings cannot replace full bodies or escape, shadow and captured-write checks',()=>{
    for(const source of [
        'function __bwSourceBinaryBitAnd(left:any,right:any):number{foreign();return left&right};let answer=__bwSourceBinaryBitAnd([5],2)',
        'let captured:any=1;function __bwSourceBinaryBitAnd(left:any,right:any):number{captured=left;return captured&right};let answer=__bwSourceBinaryBitAnd([5],2)',
        'function __bwSourceBinaryBitAnd(left:any,right:any):number{return left&right};let alias=__bwSourceBinaryBitAnd;let answer=alias([5],2)',
        'function __bwSourceBinaryBitAnd(left:any,right:any):number{return left&right};__bwSourceBinaryBitAnd=foreign;let answer=__bwSourceBinaryBitAnd([5],2)',
        'function __bwSourceUnaryBitNot(value:any):number{return ~value};function caller(__bwSourceUnaryBitNot:any){return __bwSourceUnaryBitNot([])};let answer=caller(foreign)',
        'function __bwSourceUnaryBitNot(value:any=foreign()):number{return ~value};let answer=__bwSourceUnaryBitNot()'
    ]){const ast=parse(source);assert.equal(lowerSourceValueOperatorHelpers(ast,profile),ast,source);}
    // A forged suffix is not operator authority: the complete actual body is
    // OR, never AND merely because the declaration claims that name.
    const ast=parse('function __bwSourceBinaryBitAnd(left:any,right:any):number{return left|right};let answer=__bwSourceBinaryBitAnd([],2)');
    assert.equal(declaration(lowerSourceValueOperatorHelpers(ast,profile)).op,'|');
});

test('source helper lowering preserves unrelated parser parameter defaults and optional metadata',()=>{
    const ast=parse('function __bwSourceUnaryBitNot(value:any):number{return ~value};function ordinary(value:any=7, optional?:number){return value};let answer=__bwSourceUnaryBitNot([])');
    const before=ast.body.find(node=>node.name==='ordinary'),lowered=lowerSourceValueOperatorHelpers(ast,profile),after=lowered.body.find(node=>node.name==='ordinary');
    assert.deepEqual(after,before);
    for(const key of Reflect.ownKeys(before.params)){
        assert.deepEqual(Object.getOwnPropertyDescriptor(after.params,key),Object.getOwnPropertyDescriptor(before.params,key),String(key));
    }
});

test('source Number result signatures require a genuine opcode and fixed supported selector sockets',()=>{
    for(const op of SOURCE_BINARY_OPERATORS){
        const block={opcode:'arcade_sourceValueBinary',fields:{OP:[op,null]},inputs:{LEFT:[1,'a'],RIGHT:[1,'b']}};
        assert.deepEqual(sourceValueOperation(block),{op,unary:false,inputs:['LEFT','RIGHT'],result:op==='+'?null:'Number'});
    }
    const unary={opcode:'arcade_sourceValueUnary',fields:{OP:['~',null]},inputs:{VALUE:[1,'a']}};
    assert.deepEqual(sourceValueOperation(unary),{op:'~',unary:true,inputs:['VALUE'],result:'Number'});
    for(const block of [
        {...unary,opcode:'foreign_sourceValueUnary'},
        {...unary,fields:{OP:['+',null]}},
        {...unary,inputs:{VALUE:[1,'a'],OP:[1,'selector']}},
        {...unary,fields:{OP:['~','foreign']}},
        {...unary,fields:{OP:['~',null],EXTRA:['x',null]}},
        {...unary,inputs:{}},
        {opcode:'arcade_sourceValueBinary',fields:{OP:['unknown',null]},inputs:{LEFT:[1,'a'],RIGHT:[1,'b']}}
    ])assert.equal(sourceValueOperation(block),null);
});

test('fixed bitwise result signatures describe normal return without granting operand authority',async()=>{
    const {analyseSourceValueProducers,validateProcedureConstraintSource}=await import('../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js');
    for(const op of ['&','|','^','<<','>>','>>>']){
        const ast=parse(`let a:any=[5];let alias=a;let answer=alias ${op} true`),value=ast.body.at(-1).decls[0].init;
        const producers=analyseSourceValueProducers(ast);
        assert.deepEqual([...producers.typesAt(value)],['Number'],op);
    }
    const ast=parse('let a:any=[];let answer=~a'),value=ast.body.at(-1).decls[0].init;
    assert.deepEqual([...analyseSourceValueProducers(ast,{arrayValues:true}).typesAt(value)],['Number']);
    for(const source of ['let a:any={};a=[5];let answer=a&1','let a:any=foreign();a=[];let answer=~a']){
        const program=parse(source),value=program.body.at(-1).decls[0].init,types=analyseSourceValueProducers(program,{arrayValues:true}).typesAt(value);
        assert.deepEqual([...types],['Number'],source+' has a Number result signature, not permission to execute its operands');
    }
    for(const op of ['&','|','^','<<','>>','>>>'])for(const name of ['ordinary','renamed']){
        const program=parse(`function ${name}(left:any,right:any):number{return left ${op} right};function receive(value:number){let observed=value};let rows:any=[5];receive(${name}(rows,1));`);
        assert.deepEqual(validateProcedureConstraintSource(program),[],op+' actual complete body, not helper spelling');
    }
    for(const body of ['return left','return foreign()','return left+right']){
        const program=parse(`function ordinary(left:any,right:any):number{${body}};function receive(value:number){let observed=value};let rows:any=[5];receive(ordinary(rows,1));`);
        assert.ok(validateProcedureConstraintSource(program).some(value=>value.includes('receive.value requires Number from actual producers')),body+' annotation alone is no result proof');
    }
});
