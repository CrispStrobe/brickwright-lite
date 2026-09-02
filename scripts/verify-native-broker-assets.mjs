/** Offline browser acceptance for the document-start native broker assets. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const [html, protocolSource, bootstrapSource, hostSource, workerSource] = await Promise.all([
    read('overlay/scratch-gui/static/capability-broker.html'),
    read('overlay/scratch-vm/src/extension-support/native-broker-protocol.js'),
    read('apps/tauri/src-tauri/src/native_broker_bootstrap.js'),
    read('overlay/scratch-gui/static/native-broker/native-broker-host.js'),
    read('overlay/scratch-gui/static/native-broker/native-broker-extension-worker.js')
]);
const productionCsp = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const requests = [];
const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url !== '/capability-broker.html') {
        response.writeHead(404, {'Content-Type': 'text/plain'}); response.end('not found'); return;
    }
    response.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'}); response.end(html);
});

await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
});
const {port} = server.address();
const origin = `http://localhost:${port}`;
const initializationScript = `(()=>{'use strict';
const expectedOrigin=${JSON.stringify(origin)};
const protocolModule=(()=>{const module={exports:{}};${protocolSource}\nreturn module.exports;})();
const bootstrapModule=(()=>{const module={exports:{}};${bootstrapSource}\nreturn module.exports;})();
const replies=[];const acknowledgements=[];
Object.defineProperty(globalThis,'__TAURI_INTERNALS__',{value:Object.freeze({invoke:async(command,args)=>{
if(command==='native_broker_ready'){acknowledgements.push(args===undefined?'no-args':args);return;}
if(command!=='native_broker_reply')throw new TypeError('Unexpected native command');replies.push(args);}})});
let installed=false;
Object.defineProperty(globalThis,'__brickwrightInstallBrokerHost',{value:host=>{
if(installed)throw new TypeError('Broker already initialized');installed=true;delete globalThis.__brickwrightInstallBrokerHost;
return bootstrapModule.installNativeBrokerReceiver({NativeBrokerProtocol:protocolModule.NativeBrokerProtocol,
BrokerProtocolError:protocolModule.BrokerProtocolError,invoke:globalThis.__TAURI_INTERNALS__.invoke,
createProtocol:host,expectedOrigin});},configurable:true});
${hostSource}
Object.defineProperty(globalThis,'__brokerProofDeliver',{value:async delivery=>{
await globalThis.__brickwrightBrokerReceive(delivery);if(replies.length!==1)throw new Error('Reply cardinality');
return replies.pop();}});
Object.defineProperty(globalThis,'__brokerProofAcknowledgements',{value:()=>acknowledgements.slice()});
})();`;

const pageErrors = [];
const browser = await chromium.launch({headless: true});
try {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript({content: initializationScript});
    await page.goto(`${origin}/capability-broker.html`, {waitUntil: 'load'});
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),
        productionCsp);

    // C5d: the host acknowledges itself once the receiver globals exist, and the native side
    // grants no transport permission until it does. Assert the real bootstrap actually sends it —
    // exactly once, and with no arguments, because there is nothing a caller may influence. The
    // receiver globals are read in the same evaluate, so a bootstrap that acknowledged BEFORE
    // installing them would show an acknowledgement beside a missing receiver.
    const acknowledgement = await page.evaluate(() => ({
        sent: globalThis.__brokerProofAcknowledgements(),
        receiverInstalled: typeof globalThis.__brickwrightBrokerReceive === 'function'
    }));
    assert.deepEqual(acknowledgement.sent, ['no-args'],
        'the broker must acknowledge exactly once, carrying no arguments');
    assert.equal(acknowledgement.receiverInstalled, true,
        'the receiver must exist by the time the acknowledgement has been sent');

    const positive = await page.evaluate(async () => {
        const session = '1'.repeat(64); const correlation = '2'.repeat(64);
        const deliver = (kind, requestId, fields) => globalThis.__brokerProofDeliver({session, correlation, kind,
            requestId, payload: JSON.stringify(fields)}).then(reply => JSON.parse(reply.payload));
        const url = 'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/' +
            'capability-probe-none.js';
        const loaded = await deliver('load', 0, {url});
        const called = await deliver('call', 1, {worker_id: loaded.worker_id,
            extension_id: loaded.extension_ids[0], method: 'undeclared', args: {}});
        const terminated = await deliver('terminate', 2, {worker_id: loaded.worker_id});
        return {loaded, called, terminated};
    });
    assert.deepEqual(positive.loaded.extension_ids, [0]);
    assert.equal(JSON.parse(positive.called.result).code, 'undeclared-operation');
    assert.equal(positive.terminated.terminated, true);

    const remote = await page.evaluate(async () => {
        const reply = await globalThis.__brokerProofDeliver({session: '3'.repeat(64), correlation: '4'.repeat(64),
            kind: 'load', requestId: 0, payload: JSON.stringify({url: 'https://example.invalid/remote.js'})});
        return JSON.parse(reply.payload);
    });
    assert.deepEqual(remote, {kind: 'failure', request_kind: 'load', code: 'operation-failed'});

    const escapeSource = `(function(Scratch){'use strict';class Probe{getInfo(){return{id:'escapeprobe',
blocks:[{opcode:'probe',blockType:Scratch.BlockType.REPORTER,text:'probe'}]};}async probe(){const out={};
try{importScripts('https://example.invalid/remote.js');out.script='ALLOWED';}catch(e){out.script='blocked';}
try{new Worker('blob:malformed');out.nestedWorker='ALLOWED';}catch(e){out.nestedWorker='blocked';}
try{await fetch('http://127.0.0.1:${port}/loopback');out.loopback='ALLOWED';}catch(e){out.loopback='blocked';}
return out;}}Scratch.extensions.register(new Probe());})(Scratch);`;
    const escapeMessages = await page.evaluate(async ({bundle, source}) => new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([bundle], {type: 'text/javascript'}));
        const worker = new Worker(url); URL.revokeObjectURL(url);
        const messages = [];
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('raw worker timeout')); }, 5000);
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
        worker.onmessage = event => {
            messages.push(event.data);
            if (event.data.kind === 'registration') worker.postMessage({protocol: 1, kind: 'call', workerId: 91,
                requestId: 0, extensionId: 0, method: 'probe', args: {}});
            else if (event.data.kind === 'reply' || event.data.kind === 'failure') {
                worker.postMessage({protocol: 1, kind: 'terminate', workerId: 91});
            } else if (event.data.kind === 'terminated') {
                clearTimeout(timer); worker.terminate(); resolve(messages);
            }
        };
        worker.postMessage({protocol: 1, workerId: 91, source});
    }), {bundle: workerSource, source: escapeSource});
    assert.deepEqual(escapeMessages.map(message => message.kind), ['registration', 'reply', 'terminated']);
    assert.deepEqual(escapeMessages[1].result,
        {script: 'blocked', nestedWorker: 'blocked', loopback: 'blocked'});

    const scriptBlocked = await page.evaluate(() => new Promise(resolve => {
        const script = document.createElement('script'); script.src = 'https://example.invalid/remote.js';
        script.onload = () => resolve(false); script.onerror = () => resolve(true); document.head.append(script);
    }));
    assert.equal(scriptBlocked, true);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(requests, ['/capability-broker.html']);
    console.log('PASS: document-start broker 1/1 lifecycle; remote/script/nested-worker/loopback 4/4 blocked; ' +
        'production CSP; HTML-only request census; zero page errors');
} finally {
    await browser.close();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
}
