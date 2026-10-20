import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectGuiArtifactResponse} from '../scripts/lib/gui-artifact-response.mjs';
const body=Buffer.from('owned immutable script bytes');
const expected={name:'owned.js',sha256:createHash('sha256').update(body).digest('hex'),bytes:body.length};
const response=({method='GET',status=200,bytes=body,headers={'content-length':String(body.length)}}={})=>({request:()=>({method:()=>method}),status:()=>status,allHeaders:async()=>headers,body:async()=>{assert.notEqual(method,'HEAD','HEAD must never read or hash a body');return bytes;}});
test('GET attests admitted bytes and HEAD records only status/resource length',async()=>{
    assert.deepEqual(await inspectGuiArtifactResponse(response(),expected),{name:'owned.js',method:'GET',status:200,sha256:expected.sha256,bytes:body.length});
    const head=await inspectGuiArtifactResponse(response({method:'HEAD'}),expected);assert.equal(head.method,'HEAD');assert.equal(head.contentLength,body.length);assert.equal(head.sha256,undefined);assert.equal(head.bytes,undefined);
});
test('wrong, missing, failed and unlisted artifacts cannot count as body evidence',async()=>{
    for(const fixture of [response({bytes:Buffer.alloc(body.length)}),response({bytes:Buffer.alloc(1)}),response({status:404}),response({method:'HEAD',headers:{}}),response({method:'HEAD',headers:{'content-length':'1'}}),response({method:'HEAD',headers:{'content-length':'999999999999999999999','content-encoding':'gzip'}}),response({method:'POST'})])await assert.rejects(inspectGuiArtifactResponse(fixture,expected));
    await assert.rejects(inspectGuiArtifactResponse(response(),{...expected,sha256:undefined}),/Unlisted/);
    await assert.rejects(inspectGuiArtifactResponse(response(),{...expected,bytes:undefined}),/Missing admitted/);
});
test('compressed HEAD metadata is not an uncompressed body length or identity proof',async()=>{
    const observed=await inspectGuiArtifactResponse(response({method:'HEAD',headers:{'content-length':'7','content-encoding':'gzip'}}),expected);assert.equal(observed.contentLength,7);assert.equal(observed.contentEncoding,'gzip');assert.equal(observed.sha256,undefined);
    await assert.rejects(inspectGuiArtifactResponse(response({bytes:Buffer.alloc(body.length)}),expected),/artifact bytes/);
});
