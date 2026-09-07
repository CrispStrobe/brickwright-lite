/**
 * WASM compiler fetch intercept — routes supported 8051 /compile requests to
 * the local toolchain and preserves the hosted service for other processors.
 *
 * A supported request never silently falls back after a local failure: that
 * would turn offline/debug failures into surprising network traffic.
 *
 * Since 2026-09-07 the local path is OPT-IN. SDCC is GPL-2+ and no longer ships
 * inside this BSD-3 app, so unless the user has asked for the local toolchain
 * this never claims the request and the hosted compiler — which every other
 * target already uses — serves it.
 */

import {compile, localTargetSupported} from './compiler.js';
import {localToolchainEnabled} from './toolchain-source.js';

let installed = false;

export function createCompilerFetch (originalFetch, compileLocal = compile,
    toolchainEnabled = localToolchainEnabled) {
    return function patchedFetch (input, init) {
        const url = typeof input === 'string' ? input : input?.url;

        // Only intercept C requests that this exact bundle can faithfully link.
        if (url && url.includes('/compile') && init?.method === 'POST') {
            try {
                const body = JSON.parse(init.body);
                // TWO DIFFERENT FACTS, deliberately not merged.
                // `localTargetSupported` is a CAPABILITY — this bundle knows how
                // to link that part — and stays true whatever the user chose.
                // `localToolchainEnabled` is the user's SETTING, false by
                // default because the toolchain is GPL and no longer ships in
                // this app. Folding the setting into the capability would make a
                // five-target allowlist lie about what it can do, and would
                // redden the pipeline test that asserts exactly that.
                //
                // INJECTED, not reached for. The predicate reads localStorage,
                // which does not exist in the test runner, so a version that
                // called it directly made every routing test read "online" and
                // take the hosted path — which is exactly how CI caught this on
                // run 34160645833. It is the same lesson debug-runner.js records
                // for localCompilerOptedOut: a predicate that can only be
                // reached through a live session cannot be tested, and a routing
                // decision is precisely the thing that must be.
                if (body.language === 'c' && body.code &&
                    toolchainEnabled() && localTargetSupported(body.target)) {
                    console.log('[sdcc-wasm] compiling supported 8051 target locally');
                    return compileLocal(body.code, {
                        target: body.target,
                        symbols: body.symbols,
                        disassemble: body.disassemble,
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
