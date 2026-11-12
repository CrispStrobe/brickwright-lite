// SPDX-License-Identifier: BSD-3-Clause
import {request} from 'node:http';
// Node fetch has an independent five-minute header timeout. The game RPC must
// honor its caller's existing absolute deadline, including time before headers.
export function samdWebdriverRequest (url, method, body, timeout) {
    return new Promise((resolve,reject)=>{
        let timer;
        const finish=(error,value)=>{clearTimeout(timer);if(error)reject(error);else resolve(value);};
        const req=request(url,{method,headers:{'content-type':'application/json'}},response=>{
            const chunks=[];let bytes=0;
            response.on('data',chunk=>{
                bytes+=chunk.length;
                if(bytes>64*1024*1024)req.destroy(new Error('SAMD WebDriver response exceeded 64 MiB'));
                else chunks.push(chunk);
            });
            response.on('error',error=>finish(error));
            response.on('end',()=>{
                try {
                    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if(response.statusCode<200||response.statusCode>=300||payload.value?.error)throw new Error('Actual WebDriver operation failed: '+url.pathname+' '+JSON.stringify(payload.value));
                    finish(null,payload.value);
                }catch(error){finish(error);}
            });
        });
        req.on('error',error=>finish(error));
        if(timeout!==null)timer=setTimeout(()=>req.destroy(new Error('SAMD WebDriver absolute deadline: '+url.pathname)),timeout);
        req.end(body===undefined?undefined:JSON.stringify(body));
    });
}
