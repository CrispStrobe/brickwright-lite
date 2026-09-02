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
// The distro puts WebKitWebDriver in different places depending on the webkit2gtk packaging;
// resolve it rather than hard-coding one and failing with a path error that looks like a
// boundary error.
const nativeDriver = process.env.NATIVE_DRIVER ||
    ['/usr/bin/WebKitWebDriver', '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebDriver',
        '/usr/bin/webkitwebdriver'].find(candidate => existsSync(candidate)) || '/usr/bin/WebKitWebDriver';

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

// Resolve tauri-driver from where cargo installs it rather than from PATH. Binding a gate to
// whatever the machine happens to have is the species stc-compiler-70 found the hard way: their
// assembler suites called sdcc by bare name, bound to the developer's toolchain, and never once
// exercised the binaries the service ships. `audit-gate-shapes.mjs` flagged this very line, which
// is the sweep catching its own author. Prefer the known path; fall back to PATH but SAY so.
const cargoBin = path.join(process.env.CARGO_HOME || path.join(process.env.HOME || '', '.cargo'), 'bin');
const driverBin = [path.join(cargoBin, 'tauri-driver'), '/usr/local/bin/tauri-driver']
    .find(candidate => existsSync(candidate));
if (!driverBin) {
    console.error(`tauri-driver not found in ${cargoBin} — install it with \`cargo install tauri-driver --locked\``);
    process.exit(2);
}
console.log(`driver binary: ${driverBin}`);
const driver = spawn(driverBin, ['--port', String(DRIVER_PORT), '--native-driver', nativeDriver],
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
    // Wait for the driver to bind, and FAIL if it never does. The first version swallowed every
    // attempt and fell through to POST /session, which then reported `fetch failed` — an error
    // about the harness's own socket, dressed up as an error about the app. A wait loop that
    // cannot report never-ready is the same shape as a gate that cannot fail.
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        try { await call('GET', '/status'); ready = true; } catch { await sleep(500); }
        if (driver.exitCode !== null) {
            await fail(`tauri-driver exited with code ${driver.exitCode} before accepting a connection`);
        }
    }
    if (!ready) await fail(`tauri-driver never accepted a connection on ${base} after 30s`);

    console.log(`tauri-driver ready on ${base}; native driver ${nativeDriver}`);
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

    // Before judging, look at the broker realm itself. A refused audit read has three very
    // different causes — the realm never loaded, its receiver never installed, or the
    // acknowledgement was refused — and they are indistinguishable from the editor, because the
    // bootstrap deliberately swallows a failed acknowledgement and disposes itself quietly.
    // A harness that cannot tell them apart makes its own verdict unactionable.
    const handles = (await call('GET', `/session/${session}/window/handles`)).body?.value || [];
    const realms = [];
    for (const handle of handles) {
        await call('POST', `/session/${session}/window`, {handle});
        const seen = await call('POST', `/session/${session}/execute/sync`, {
            script: `return {
                href: String(globalThis.location && globalThis.location.href),
                origin: String(globalThis.location && globalThis.location.origin),
                receiver: typeof globalThis.__brickwrightBrokerReceive,
                factoryStillThere: typeof globalThis.__brickwrightInstallBrokerHost,
                tauri: typeof (globalThis.__TAURI_INTERNALS__ || {}).invoke,
                // Tauri injects __TAURI_INTERNALS__ and the IPC regardless of whether the
                // DOCUMENT loaded, so their presence is not evidence that the frontend is
                // there. Six rounds were spent reading the broker realm's failure as
                // broker-specific without ever checking whether the EDITOR had loaded either.
                title: String(globalThis.document && globalThis.document.title),
                doc: String(globalThis.document && globalThis.document.documentElement &&
                    globalThis.document.documentElement.outerHTML || '').slice(0, 120)
            };`, args: []
        });
        realms.push({handle, ...(seen.body?.value || {error: 'unreadable'})});
    }
    console.log('realms: ' + JSON.stringify(realms, null, 1));
    // Select the editor by IDENTITY, never by position. This read `handles[0]` until the broker
    // realm started loading its document: a second realm then appeared, the order was not the one
    // assumed, and the probe ran INSIDE the broker — where `native_broker_audit` is refused by
    // design, because it is bound to the main label. The harness reported that as "the boundary
    // is broken" when the boundary was working correctly and the harness was standing in the
    // wrong room. A gate that identifies its subject positionally asserts about whatever is at
    // that index.
    const isBroker = realm => /capability-broker\.html/.test(String(realm.href));
    const editors = realms.filter(realm => !isBroker(realm));
    const brokers = realms.filter(isBroker);
    if (editors.length !== 1) {
        await fail(`expected exactly one editor realm, found ${editors.length}: ` +
            JSON.stringify(realms.map(r => r.href)));
    }
    if (brokers.length !== 1) {
        await fail(`expected exactly one broker realm, found ${brokers.length}: ` +
            JSON.stringify(realms.map(r => r.href)));
    }
    // The realm must hold its OWN document. It rendered WebKit's "The URL can't be shown" page
    // for seven CI runs while every other signal looked healthy, so this is asserted, not assumed.
    if (!/Capability Broker/.test(String(brokers[0].doc) + String(brokers[0].title))) {
        await fail('the broker realm did not load its document: ' +
            JSON.stringify({title: brokers[0].title, doc: String(brokers[0].doc).slice(0, 160)}));
    }
    // No reusable handle, asserted rather than logged. All four of these facts were already in
    // the realms dump and nothing checked any of them — the "collected but never gated" shape:
    // a measurement printed beside a verdict reads as though it were part of it.
    if (brokers[0].receiver !== 'function') {
        await fail(`the broker host did not install: receiver is ${brokers[0].receiver}`);
    }
    if (brokers[0].factoryStillThere !== 'undefined') {
        await fail('__brickwrightInstallBrokerHost survived installation — the factory is ' +
            'one-shot precisely so a second host cannot be installed over the first');
    }
    for (const [what, value] of [['a broker receiver', editors[0].receiver],
        ['the broker host factory', editors[0].factoryStillThere]]) {
        if (value !== 'undefined') await fail(`the EDITOR realm exposes ${what} (${value})`);
    }

    await call('POST', `/session/${session}/window`, {handle: editors[0].handle});

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

    // ── CP3-D1: one real semantic operation, driven end to end ────────────────────────────
    // Until this ran the audit returned ZERO rows, so "the audit is readable" was true of an
    // empty list and proved only the grant. A vertical slice has to actually cross the boundary.
    const before = outcome.audit.value.length;
    await call('POST', `/session/${session}/window`, {handle: brokers[0].handle});
    const slice = await evaluate(`
        const done = arguments[arguments.length - 1];
        (async () => {
            const invoke = globalThis.__TAURI_INTERNALS__ && globalThis.__TAURI_INTERNALS__.invoke;
            if (typeof invoke !== 'function') { done({fatal: 'the broker realm has no invoke'}); return; }
            // Each call reports separately. Wrapping the pair in one try produced exactly one
            // word — "capability refused" — with no way to tell WHICH call refused or why, which
            // is the undiagnosable-diagnostic shape this repository exists to catch.
            let lease;
            try { lease = await invoke('native_broker_lease'); }
            catch (error) { done({fatal: 'native_broker_lease refused: ' + String(error)}); return; }

            // sequence 0, because a fresh lease's next_sequence IS 0 and authorize() denies
            // OutOfSequence on anything else. resource 'platform/default', the name
            // Resource::parse accepts — 'platform' is an UnknownResource and denies identically,
            // so a wrong name here would have looked like a broken boundary.
            const call = {lease, sequence: 0, operation: 'platform.kind.read', resource: 'platform/default', args: {}};
            let value;
            try { value = await invoke('native_broker_invoke', call); }
            catch (error) { done({fatal: 'native_broker_invoke refused: ' + String(error)}); return; }

            // Re-sending the SAME sequence must be refused: it was consumed above, so this is a
            // replay. An executor this side-effect-free would otherwise answer twice with
            // nothing visibly going wrong.
            let replay;
            try { replay = {ok: true, value: await invoke('native_broker_invoke', call)}; }
            catch (error) { replay = {ok: false, error: String(error)}; }
            done({lease, value, replay});
        })();`);
    if (!slice || slice.fatal) await fail(`the semantic slice did not run: ${slice && slice.fatal}`);

    // The value is the platform the runner actually is — asserted against the harness's own
    // view of the OS, so this cannot pass by agreeing with itself.
    const expected = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    if (slice.value !== expected) {
        await fail(`platform.kind.read returned ${JSON.stringify(slice.value)}, expected ${expected}`);
    }
    if (slice.replay.ok) {
        await fail(`a replayed sequence was answered: ${JSON.stringify(slice.replay.value)} — the sequence is not a guard`);
    }

    // Back to the editor: the operation must now be VISIBLE in the audit, and still redacted.
    await call('POST', `/session/${session}/window`, {handle: editors[0].handle});
    const after = await evaluate(`
        const done = arguments[arguments.length - 1];
        (async () => {
            try { done({ok: true, rows: await globalThis.__TAURI_INTERNALS__.invoke('native_broker_audit')}); }
            catch (error) { done({ok: false, error: String((error && error.message) || error)}); }
        })();`);
    if (!after) await fail('the audit re-read returned nothing from the editor realm');
    if (!after.ok) await fail(`the editor could not re-read the audit after the operation: ${after.error}`);
    if (!(after.rows.length > before)) {
        await fail(`the audit did not record the operation: ${before} row(s) before, ${after.rows.length} after`);
    }
    const recorded = JSON.stringify(after.rows);
    for (const [what, secret] of [['the lease id', slice.lease], ['the result', slice.value]]) {
        if (recorded.includes(secret)) {
            await fail(`the audit leaked ${what} to the editor: ${recorded.slice(0, 200)}`);
        }
    }
    if (!after.rows.some(row => row.operation === 'platform.kind.read' && row.decision === 'allowed')) {
        await fail(`no allowed platform.kind.read row in the audit: ${recorded.slice(0, 300)}`);
    }

    // ── CP3-D2: the TTL is enforced against the REAL clock ────────────────────────────────
    // `expiry_boundary_and_revocation_are_enforced` proves the rule with an INJECTED `now`, which
    // says nothing about whether the running host advances time the way the policy expects.
    // lease_ttl is 60_000ms, so this waits it out. The wait is on the HARNESS side, in two short
    // scripts: a 61s sleep inside the page would exceed WebDriver's script timeout and report as
    // a driver error rather than as the thing being measured.
    await call('POST', `/session/${session}/window`, {handle: brokers[0].handle});
    const aged = await evaluate(`
        const done = arguments[arguments.length - 1];
        globalThis.__TAURI_INTERNALS__.invoke('native_broker_lease')
            .then(lease => done({lease}))
            .catch(error => done({fatal: 'could not mint a lease to age: ' + String(error)}));`);
    if (!aged || aged.fatal) await fail(`the expiry check could not start: ${aged && aged.fatal}`);
    await sleep(61000);
    const afterTtl = await evaluate(`
        const done = arguments[arguments.length - 1];
        globalThis.__TAURI_INTERNALS__.invoke('native_broker_invoke', {
            lease: ${JSON.stringify(aged.lease)}, sequence: 0,
            operation: 'platform.kind.read', resource: 'platform/default', args: {}
        }).then(value => done({ok: true, value})).catch(error => done({ok: false, error: String(error)}));`);
    if (!afterTtl) await fail('the post-TTL invoke returned nothing');
    if (afterTtl.ok) {
        await fail('a lease older than its 60s TTL still authorised a call ' +
            `(returned ${JSON.stringify(afterTtl.value)}) — the TTL is enforced against the ` +
            'injected clock the unit test uses, but not against the real one');
    }

    // ── CP3-D2 (lifecycle half): a navigation attempt must leave ZERO stale authority ──────
    // The realm guard denies any navigation away from its own document AND revokes on the way
    // past. Proving the denial alone would be half a gate: the interesting claim is that the
    // authority already handed out stops working, not that the page stayed put.
    await call('POST', `/session/${session}/window`, {handle: brokers[0].handle});
    const lifecycle = await evaluate(`
        const done = arguments[arguments.length - 1];
        (async () => {
            const invoke = globalThis.__TAURI_INTERNALS__.invoke;
            const lease = ${JSON.stringify(slice.lease)};
            try { globalThis.location.href = 'tauri://localhost/index.html'; } catch (error) {}
            // The navigation is handled on the Rust side; give it a moment to be refused.
            await new Promise(resolve => setTimeout(resolve, 500));
            const still = {href: String(globalThis.location.href)};
            // sequence 1 is the NEXT legitimate sequence for this lease, so a refusal here is
            // revocation and not the replay guard firing again.
            try {
                still.after = {ok: true, value: await invoke('native_broker_invoke', {
                    lease, sequence: 1, operation: 'platform.kind.read', resource: 'platform/default', args: {}
                })};
            } catch (error) { still.after = {ok: false, error: String(error)}; }
            done(still);
        })();`);
    if (!lifecycle) await fail('the lifecycle probe returned nothing');
    if (!/capability-broker\.html/.test(lifecycle.href)) {
        await fail(`the realm navigated away from its document: ${lifecycle.href}`);
    }
    if (lifecycle.after.ok) {
        await fail('a lease minted before a refused navigation still authorised a call ' +
            `afterwards (returned ${JSON.stringify(lifecycle.after.value)}) — the revocation on ` +
            'the navigation path is not reaching the policy');
    }

    await call('POST', `/session/${session}/window`, {handle: editors[0].handle});
    const revoked = await evaluate(`
        const done = arguments[arguments.length - 1];
        (async () => {
            try { done({ok: true, rows: await globalThis.__TAURI_INTERNALS__.invoke('native_broker_audit')}); }
            catch (error) { done({ok: false, error: String((error && error.message) || error)}); }
        })();`);
    if (!revoked || !revoked.ok) await fail(`could not read the audit after revocation: ${revoked && revoked.error}`);
    if (!revoked.rows.some(row => row.decision === 'revoked')) {
        await fail('the revocation is not visible in the diagnostics the learner can see: ' +
            JSON.stringify(revoked.rows).slice(0, 300));
    }

    console.log(`PASS: acknowledgement reached the ACL; platform.kind.read returned ${JSON.stringify(slice.value)} ` +
        `through a broker-minted lease and is recorded in the audit (${before} -> ${after.rows.length} rows, ` +
        'lease and result both absent from what the editor can see); a replayed sequence was refused; ' +
        'editor refused native_broker_reply and native_broker_lease at the real Tauri boundary; ' +
        'a lease aged past its 60s TTL was refused against the REAL clock; ' +
        'a refused navigation revoked the outstanding lease and the revocation is visible in the audit');
    await shutdown();
    process.exit(0);
} catch (error) {
    await fail(`harness error: ${error && error.stack || error}`);
}
