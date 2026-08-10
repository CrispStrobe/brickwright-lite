/**
 * WASM compiler fetch intercept — routes /compile requests to the local
 * WASM toolchain when the flag is set. Non-invasive: patches globalThis.fetch
 * and restores the original for non-compile requests.
 *
 * Call installWasmCompilerIntercept() once at app startup. It is a no-op
 * when the flag is not set.
 *
 * NOT the default. Enabled by: localStorage.setItem('bw-use-wasm-compiler', '1')
 */

import { isEnabled, compile } from './compiler.js';

let installed = false;

export function installWasmCompilerIntercept () {
    if (installed || !isEnabled()) return;
    installed = true;

    const originalFetch = globalThis.fetch;

    globalThis.fetch = function patchedFetch (input, init) {
        const url = typeof input === 'string' ? input : input?.url;

        // Only intercept POST /compile to the stc-compiler service
        if (url && url.includes('/compile') && init?.method === 'POST') {
            try {
                const body = JSON.parse(init.body);
                if (body.language === 'c' && body.code) {
                    console.log('[sdcc-wasm] intercepting /compile — using local WASM compiler (preview, not verified)');
                    return compile(body.code, {
                        target: body.target,
                        symbols: body.symbols
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

    console.log('[sdcc-wasm] WASM compiler intercept installed (preview — byte-identity not verified)');
}
