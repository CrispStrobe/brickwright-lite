import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {consoleInspectSourceCalls} from '../overlay/scratch-gui/src/lib/bw-makecode/console-inspect-source.js';
const proof=source=>consoleInspectSourceCalls(parseMakeCodeTs(source));
test('inspection source requires actual unchanged lexical SDK call',()=>{
    for(const source of ['let s=console.inspect("x")','let s=console.inspect(3,0)','function f(console:any){console.inspect("shadow")};let s=console.inspect("x")']){
        const actual=proof(source);assert.equal(actual.calls.length,1);assert.equal(actual.isIntrinsicCall(actual.calls[0]),true,source);
    }
    for(const source of ['function f(console:any){return console.inspect("x")}','function f(){console.inspect("x");if(false){var console=0}}','for(let console of [1]){console.inspect("x")}'])assert.equal(proof(source).calls.length,0,source);
});
test('inspection source rejects namespace replacement, member writes, computed writes and escapes',()=>{
    for(const prefix of ['console=0;','console.inspect=(v:any)=>"changed";','console["inspect"]=(v:any)=>"changed";','let alias=console;','let alias=console.inspect;']){
        const actual=proof(prefix+'let result=console.inspect("text")');assert.equal(actual.isIntrinsicCall(actual.calls.at(-1)),false,prefix);assert.equal(actual.diagnostics.length,1,`SDK mutation or escape must retain its diagnostic: ${prefix}`);
    }
    // A declared Namespace shadows the SDK receiver; its ordinary call is not
    // an attempted SDK mutation or an intrinsic inspection candidate.
    const namespaceProgram=parseMakeCodeTs('namespace console {export function inspect(v:any){return "fake"}};let result=console.inspect("text")');
    const namespaceActual=consoleInspectSourceCalls(namespaceProgram),localCall=namespaceProgram.body.at(-1).decls[0].init;
    assert.equal(localCall.type,'Call','the namespaced source retains its actual ordinary call');
    assert.equal(namespaceActual.isIntrinsicCall(localCall),false,'a lexical console Namespace cannot issue an SDK intrinsic');
    assert.deepEqual(namespaceActual.calls,[],'a lexical console Namespace has no SDK call candidates');
    assert.deepEqual(namespaceActual.diagnostics,[],'ordinary Namespace shadowing has no false SDK mutation diagnostic');
    for(const source of ['let result=console.inspect()','let result=console.inspect(1,2,3)','let result=new console.inspect(1)']){
        const actual=proof(source);assert.equal(actual.isIntrinsicCall(actual.calls[0]),false,source);
    }
});
