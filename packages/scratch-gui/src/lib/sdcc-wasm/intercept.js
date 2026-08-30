/**
 * WASM compiler fetch intercept — routes supported 8051 /compile requests to
 * the local toolchain and preserves the hosted service for other processors.
 *
 * A supported request never silently falls back after a local failure: that
 * would turn offline/debug failures into surprising network traffic.
 */

import {compile, localTargetSupported} from './compiler.js';

let installed = false;

export function createCompilerFetch (originalFetch, compileLocal = compile) {
    return function patchedFetch (input, init) {
        const url = typeof input === 'string' ? input : input?.url;

        // Only intercept C requests that this exact bundle can faithfully link.
        if (url && url.includes('/compile') && init?.method === 'POST') {
            try {
                const body = JSON.parse(init.body);
                if (body.language === 'c' && body.code && localTargetSupported(body.target)) {
                    console.log('[sdcc-wasm] compiling supported 8051 target locally');
                    return compileLocal(body.code, {
                        target: body.target,
                        symbols: body.symbols,
                        fosc: body.fosc || body.f_cpu
                    }).then(result => new Response(JSON.stringify(result), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
            } catch {
                // Fall through to server on parse failure
            }
        }

        return originalFetch.call(globalThis, input, init);
    };
}

export function installWasmCompilerIntercept () {
    if (installed) return;
    installed = true;
    globalThis.fetch = createCompilerFetch(globalThis.fetch);

    console.log('[sdcc-wasm] local 8051 compiler routing installed');
}
