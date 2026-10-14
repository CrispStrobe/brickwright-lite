// Vercel serverless entry for the Pascal→.COM endpoint. It is a thin transport
// over lib/compile-pascal.js (the same core server.js uses), so the deployed
// function and the local server answer identically.
//
// Deploy note: ack must be present in the function's filesystem and ACKDIR set
// (see README — the Docker image is the reliable route; a Vercel deploy needs
// ack shipped as an included file or a container image, because a from-source
// ACK build does not fit a standard serverless build step). Until then the lite
// client leaves this route's `endpoint` null and the code-tab button gated off.

import {compileResponse, ackEnv} from '../lib/compile-pascal.js';

const cors = res => {
    res.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN || '*');
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
};

export default async function handler (req, res) {
    cors(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method === 'GET') { res.status(200).json({ok: true, ack: ackEnv().ackBin}); return; }
    if (req.method !== 'POST') { res.status(405).json({success: false, error: 'POST Pascal source'}); return; }

    // Vercel parses JSON bodies; be tolerant of a raw string body too.
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const source = body && (body.source ?? body.pascal ?? body.code ?? body.src);

    const {status, body: out} = await compileResponse(source);
    res.status(status).json(out);
}
