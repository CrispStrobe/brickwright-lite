// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {samdWebdriverRequest} from '../scripts/lib/samd-webdriver-request.mjs';
test('game RPC waits for delayed headers within its explicit deadline without replay',async t=>{
    let calls=0;
    const server=createServer(async(req,res)=>{
        calls++;let body='';for await(const chunk of req)body+=chunk;
        assert.deepEqual(JSON.parse(body),{script:'actual guest observer',args:[]});
        setTimeout(()=>res.end(JSON.stringify({value:{ok:true}})),75);
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>server.close());
    const url=new URL(`http://127.0.0.1:${server.address().port}/execute/async`);
    assert.deepEqual(await samdWebdriverRequest(url,'POST',{script:'actual guest observer',args:[]},2000),{ok:true});
    assert.equal(calls,1);
});
test('a stalled WebDriver is terminated at the caller deadline; HTTP errors remain failures',async t=>{
    const server=createServer((req,res)=>{if(req.url==='/error'){res.statusCode=500;res.end(JSON.stringify({value:{error:'session closed'}}));}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>{server.closeAllConnections();server.close();});
    const url=path=>new URL(`http://127.0.0.1:${server.address().port}${path}`);
    await assert.rejects(samdWebdriverRequest(url('/hang'),'POST',{},30),/absolute deadline/);
    await assert.rejects(samdWebdriverRequest(url('/error'),'GET',undefined,2000),/session closed/);
});
