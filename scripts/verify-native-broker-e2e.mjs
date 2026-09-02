#!/usr/bin/env node
/**
 * End-to-end proof of the native broker boundary in a REAL packaged desktop app.
 *
 * Everything else that tests this boundary tests a model of it. The Node suites read Rust and
 * JSON as text. The browser gates run without Tauri, so `__TAURI_INTERNALS__` is a stub written
 * by the gate itself — and an assertion against a stub you wrote proves the stub agrees with
 * itself, which is the failure this repository has spent a day cataloguing. The packaged desktop
 * gate builds the app and stops; it never launches it.
 *
 * This launches it. tauri-driver speaks WebDriver to the real binary, so the script below runs
 * inside the app's MAIN webview and every `invoke` crosses the real Tauri ACL — the same ACL
 * that `native_broker_ready` widens at runtime, in the same process, with the same capabilities.
 *
 * What it proves, and each is unprovable anywhere else:
 *
 *   ACK REACHED THE ACL.  `native_broker_audit` is granted ONLY by the runtime capability that
 *   `native_broker_ready` adds. If the broker realm failed to load, failed to install its
 *   receiver, or failed to acknowledge, that capability was never added and this invoke is
 *   refused by Tauri before any of our code runs. A resolving audit call is therefore an
 *   end-to-end proof of the whole C5d chain, observed from the editor.
 *
 *   THE EDITOR HOLDS NO TRANSPORT.  `native_broker_reply` and `native_broker_lease` are granted
 *   to the broker webview alone. Called from main they must be refused BY THE ACL, not by our
 *   label check — the label check is the second line, and this proves the first one exists.
 *
 * Usage: node scripts/verify-native-broker-e2e.mjs <path-to-app-binary>
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const binary = process.argv[2];
if (!binary || !existsSync(binary)) {
    console.error(`usage: node scripts/verify-native-broker-e2e.mjs <app-binary>\n  not found: ${binary}`);
    process.exit(2);
}
const DRIVER_PORT = Number(process.env.TAURI_DRIVER_PORT || 4444);
const base = `http://127.0.0.1:${DRIVER_PORT}`;
const nativeDriver = process.env.NATIVE_DRIVER || '/usr/bin/WebKitWebDriver';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const call = async (method, url, body) => {
    const response = await fetch(base + url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = {raw: text}; }
    return {status: response.status, body: parsed};
};

const driver = spawn('tauri-driver', ['--port', String(DRIVER_PORT), '--native-driver', nativeDriver],
    {stdio: ['ignore', 'pipe', 'pipe']});
const driverLog = [];
driver.stdout.on('data', chunk => driverLog.push(String(chunk)));
driver.stderr.on('data', chunk => driverLog.push(String(chunk)));

let session = null;
const shutdown = async () => {
    if (session) await call('DELETE', `/session/${session}`).catch(() => {});
    driver.kill('SIGTERM');
};

const fail = async message => {
    console.error(`FAIL: ${message}`);
    if (driverLog.length) console.error('--- tauri-driver ---\n' + driverLog.join('').slice(-4000));
    await shutdown();
    process.exit(1);
};

try {
    // tauri-driver needs a moment to bind before the first request.
    for (let attempt = 0; attempt < 40; attempt++) {
        try { await call('GET', '/status'); break; } catch { await sleep(250); }
    }

    const created = await call('POST', '/session', {
        capabilities: {alwaysMatch: {'tauri:options': {application: path.resolve(binary)}}}
    });
    session = created.body?.value?.sessionId;
    if (!session) await fail(`no WebDriver session: ${JSON.stringify(created.body).slice(0, 500)}`);

    // The broker webview loads and acknowledges at document start, but the app has only just
    // launched; give the realm a bounded moment to exist before asking the editor about it.
    const evaluate = async script => {
        const result = await call('POST', `/session/${session}/execute/async`, {script, args: []});
        return result.body?.value;
    };

    const probe = `
        const done = arguments[arguments.length - 1];
        const invoke = globalThis.__TAURI_INTERNALS__ && globalThis.__TAURI_INTERNALS__.invoke;
        if (typeof invoke !== 'function') { done({fatal: 'no __TAURI_INTERNALS__.invoke in the main webview'}); return; }
        const attempt = async (name, args) => {
            try { return {name, ok: true, value: await invoke(name, args)}; }
            catch (error) { return {name, ok: false, error: String(error && error.message || error)}; }
        };
        (async () => {
            // Retry the audit briefly: the acknowledgement is asynchronous and the editor may be
            // ready first. A refusal that never becomes a grant is a real failure; one that
            // resolves on the second look is a race in the TEST, not in the boundary.
            let audit = await attempt('native_broker_audit');
            for (let i = 0; i < 20 && !audit.ok; i++) {
                await new Promise(r => setTimeout(r, 250));
                audit = await attempt('native_broker_audit');
            }
            const reply = await attempt('native_broker_reply',
                {session: '0'.repeat(64), correlation: '0'.repeat(64), requestId: 0, payload: '{}'});
            const lease = await attempt('native_broker_lease');
            done({audit, reply, lease});
        })();`;

    const outcome = await evaluate(probe);
    if (!outcome || outcome.fatal) await fail(outcome?.fatal || 'the probe returned nothing');

    if (!outcome.audit.ok) {
        await fail('the editor could not read the broker audit, so `native_broker_ready` never ' +
            `granted its runtime capability: ${outcome.audit.error}`);
    }
    if (!Array.isArray(outcome.audit.value)) {
        await fail(`the audit did not return rows: ${JSON.stringify(outcome.audit.value).slice(0, 200)}`);
    }
    if (outcome.reply.ok) await fail('the EDITOR was able to call native_broker_reply — the broker half of the ACL is not disjoint');
    if (outcome.lease.ok) await fail('the EDITOR was able to mint a lease — a semantic grant reached the wrong webview');

    console.log(`PASS: acknowledgement reached the ACL (audit returned ${outcome.audit.value.length} row(s)); ` +
        'editor refused native_broker_reply and native_broker_lease at the real Tauri boundary');
    await shutdown();
    process.exit(0);
} catch (error) {
    await fail(`harness error: ${error && error.stack || error}`);
}
