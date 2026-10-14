// A dependency-free Node HTTP server exposing `ack -mmsdos86 -O` as a compile
// endpoint, shaped like the stc-compiler /assemble service the lite client
// already speaks to. Used to run the service locally (and in the Docker image);
// the same core (lib/compile-pascal.js) backs the Vercel function.
//
//   POST /compile      {source: "<pascal>"}  -> {success, base64, format:'com'} | {success:false, errors}
//   GET  /health       -> {ok: true, ack: "<path>"}
//
// No framework: plain node:http, so `node server.js` needs nothing installed
// beyond a built ACK. PORT and the ack location come from the environment
// (see lib/compile-pascal.js#ackEnv).

import {createServer} from 'node:http';
import {compileResponse, ackEnv} from './lib/compile-pascal.js';

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 512 * 1024; // a Pascal source; not a file upload

const CORS = {
    'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
};

const json = (res, status, body) => {
    res.writeHead(status, {'content-type': 'application/json', ...CORS});
    res.end(JSON.stringify(body));
};

const readBody = req => new Promise((resolve, reject) => {
    let buf = '', over = false;
    req.on('data', d => {
        if (over) return;
        buf += d;
        if (buf.length > MAX_BODY) { over = true; reject(new Error('source too large')); }
    });
    req.on('end', () => { if (!over) resolve(buf); });
    req.on('error', reject);
});

const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    if (req.method === 'GET' && req.url === '/health') {
        return json(res, 200, {ok: true, ack: ackEnv().ackBin});
    }
    if (req.method !== 'POST' || !(req.url === '/compile' || req.url === '/')) {
        return json(res, 404, {success: false, error: 'POST Pascal source to /compile'});
    }
    let raw;
    try {
        raw = await readBody(req);
    } catch (e) {
        return json(res, 413, {success: false, error: e.message});
    }
    let source;
    try {
        const parsed = JSON.parse(raw || '{}');
        // Accept the primary `source`, plus obvious aliases, so a slightly
        // different client shape is not a silent 400.
        source = parsed.source ?? parsed.pascal ?? parsed.code ?? parsed.src;
    } catch {
        return json(res, 400, {success: false, error: 'body must be JSON {source: "..."}'});
    }
    const {status, body} = await compileResponse(source);
    return json(res, status, body);
});

server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`pascal-ack-compiler on :${PORT}  (ack=${ackEnv().ackBin})`);
});

export default server;
