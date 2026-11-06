import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as P,inspectGeneratedHelperBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';

// Expose only the private predicate in an in-memory copy. Product callers
// still obtain the token from the independently recognized original helper.
const url=new URL('../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js',import.meta.url);
const source=readFileSync(url,'utf8');
const exposed=(source+'\nexport {startupPrimitiveIndexRead};\n').replace(
    /\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g,
    (_,prefix,quote,relative)=>`${prefix}${quote}${new URL(relative,url).href}${quote}`);
const {startupPrimitiveIndexRead}=await import('data:text/javascript;base64,'+Buffer.from(exposed).toString('base64'));

const program=({prefix='',fill='temp.push("5");temp.push(undefined);',assign='rows=temp;',gap='',after='',root='__bwStartup();'}={})=>
    `function __bwStartup(){let temp:any[]=null;${prefix}temp=[];${fill}${assign}${gap}rows[0]=rows[0]+2;${after}}\nlet rows:any[]=null;${root}`;
const admits=text=>{
    const ast=parseMakeCodeTs(text,P.ordinary),startup=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='__bwStartup');
    const statement=startup.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&
        node.expr.left?.type==='Index'&&node.expr.right?.type==='Binary');
    assert.ok(statement,'actual indexed addition statement');
    const binary=statement.expr.right,token=Symbol('recognized original helper call');
    binary.nativeArrayDomainCall=token;
    const bindings=inspectGeneratedHelperBindings(ast,P.ordinary);
    return startupPrimitiveIndexRead(ast,bindings,P.ordinary,binary.left,new Map([[token,{helper:true}]]));
};

test('private issuer accepts only the exact fresh primitive prefix',()=>{
    assert.equal(admits(program()),true);
    assert.equal(admits(program({fill:'temp.push(false);temp.push(null);'})),true);
});

test('private issuer refuses a second entry, pre-read suspension and foreign call',()=>{
    assert.equal(admits(program({root:'__bwStartup();__bwStartup();'})),false);
    assert.equal(admits(program({gap:'pause(1);'})),false);
    assert.equal(admits(program({gap:'foreign();'})),false);
});

test('private issuer refuses alias, nonprimitive writer and ambient prototype mutation',()=>{
    assert.equal(admits(program({fill:'let alias=temp;alias.push("5");'})),false);
    assert.equal(admits(program({fill:'temp.push({value:1});'})),false);
    assert.equal(admits(program({after:'rows=null;'})),false);
    assert.equal(admits(program({prefix:'Array.prototype.push=foreign;'})),false);
});
