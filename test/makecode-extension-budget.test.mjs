import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchMakeCodeExtensions, FETCH_LIMITS} from '../overlay/scratch-gui/src/lib/bw-makecode/extension-fetch.js';
const license = `MIT License
Copyright (c) Brickwright contributors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`;
function dependencyGraph(count) {
    const urls = new Map(), calls = [];
    for(let i=0;i<count;i++) {
        const base=`https://raw.githubusercontent.com/brickwright-test/package-${i}/v1/`;
        urls.set(base+'pxt.json', JSON.stringify({name:`package-${i}`, files:['main.ts'], supportedTargets:['arcade'],
            dependencies: i+1<count ? {[`pkg${i+1}`]:`github:brickwright-test/package-${i+1}#v1`} : {pkg0:'github:brickwright-test/package-0#v1'}}));
        urls.set(base+'main.ts', `namespace Package${i} { export function value():number { return ${i}; } }`);
        urls.set(base+'LICENSE', license);
    }
    return {dependencies:{pkg0:'github:brickwright-test/package-0#v1'}, target:'arcade', table:[],
        fetch:async url=>{calls.push(String(url));return {ok:urls.has(String(url)),status:urls.has(String(url))?200:404,text:async()=>urls.get(String(url))||''};},calls};
}
test('default dependency graph budget admits ten packages and terminates a repeated dependency cycle',async()=>{
    const graph=dependencyGraph(10),result=await fetchMakeCodeExtensions(graph);
    assert.deepEqual(result.refused,[]);assert.equal(result.extensions.length,10);
    assert.deepEqual(result.extensions.map(e=>e.id),Array.from({length:10},(_,i)=>`pkg${i}`));
    for(const entry of result.extensions) {
        assert.equal(entry.fetched.licence,'MIT');assert.equal(entry.fetched.redistributable,true);
        assert.match(entry.fetched.sha256['main.ts'],/^[0-9a-f]{64}$/);
    }
    assert.ok(graph.calls.length<=10*8, 'finite source and notice acquisition even with a dependency cycle');
});
test('extended package count retains explicit exhaustion and the existing byte bounds',async()=>{
    const result=await fetchMakeCodeExtensions(dependencyGraph(FETCH_LIMITS.extensions+1));
    assert.equal(result.extensions.length,16);
    assert.equal(result.refused.length,1);assert.match(result.refused[0].reason,/more than 16 extensions/);
    assert.equal(FETCH_LIMITS.bytesTotal,32*1024*1024);
    assert.equal(FETCH_LIMITS.filesPerExtension,64);
});
