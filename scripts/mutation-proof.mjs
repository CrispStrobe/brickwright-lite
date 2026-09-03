#!/usr/bin/env node
/**
 * Mutation proofs for every enforcement layer, as a runnable thing rather than a claim.
 *
 * CP5 asks for "mutation proofs for every enforcement layer". Those have been produced all along,
 * by hand, in commit messages — which means the claim decays the moment someone edits a guard,
 * and nobody finds out. This applies each mutation to a real enforcement point and requires the
 * named suite to go RED. A mutation that leaves the suite green is reported as a HOLE: either the
 * guard is unprotected, or the mutation does not do what its author thought.
 *
 * Two results are interesting and both are printed:
 *   RED    the suite caught it. The guard is pinned.
 *   GREEN  the suite did NOT catch it — a gap, or an independently-sufficient sibling defence.
 *
 * The second is not automatically a defect: `native_broker_bootstrap`'s null prototype and its
 * `typeof` guard are each sufficient alone, so removing either leaves the suite green. That was
 * found by exactly this method and is recorded in the table below, because a mutation runner that
 * hides its non-findings teaches the same false confidence as a gate that cannot fail.
 *
 * Usage: node scripts/mutation-proof.mjs [--only <substring>]
 * Exit 1 if any mutation marked `expect: 'red'` failed to turn its suite red.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

/**
 * layer   the enforcement point, in words
 * file    the file to mutate
 * find    exact text to replace (must occur exactly once)
 * with    the weakened form
 * suite   the test file that must go red
 * expect  'red'  — the suite must catch it (a green run fails this script)
 *         'green-known' — documented as not individually caught, with a reason
 */
const MUTATIONS = [
    {
        layer: 'realm: the resource is looked up, never taken from the payload',
        file: 'apps/tauri/src-tauri/src/native_broker_bootstrap.js',
        find: "exact(fields, ['operation', 'args'])",
        with: "(fields && typeof fields === 'object')",
        suite: 'test/native-broker-bootstrap.test.mjs',
        expect: 'red'
    },
    {
        layer: 'realm: a retired session is inert for every kind',
        file: 'apps/tauri/src-tauri/src/native_broker_bootstrap.js',
        find: "        let state = sessions.get(delivery.session);\n        if (!state && retired.has(delivery.session)) return safeReply(delivery,\n            {kind: 'failure', request_kind: delivery.kind, code: 'stale-reply'});\n        if (delivery.kind === 'capability') {",
        with: "        let state = sessions.get(delivery.session);\n        if (delivery.kind === 'capability') {",
        suite: 'test/native-broker-bootstrap.test.mjs',
        expect: 'red'
    },
    {
        layer: 'diagnostics: redaction is a whitelist, not a filter',
        file: 'overlay/scratch-gui/src/lib/capability-diagnostics.js',
        find: '    for (const field of fields) out[field] = scalar(source ? source[field] : undefined);',
        with: '    for (const field of Object.keys(source || {})) out[field] = scalar(source[field]);',
        suite: 'test/capability-diagnostics.test.mjs',
        expect: 'red'
    },
    {
        layer: 'diagnostics: no object is stringified into the DOM',
        file: 'overlay/scratch-gui/src/lib/capability-diagnostics.js',
        find: "    if (typeof value === 'object') return '';   // no object survives to the DOM",
        with: '    if (typeof value === "object") return String(value);',
        suite: 'test/capability-diagnostics.test.mjs',
        expect: 'red'
    },
    {
        layer: 'JS caller: the editor names an operation and never a lease',
        file: 'overlay/scratch-vm/src/extension-support/native-platform-capability.js',
        find: "                payload: JSON.stringify({kind: 'capability', operation: OPERATION, args})",
        with: "                payload: JSON.stringify({kind: 'capability', operation: OPERATION, args, resource: 'platform/default'})",
        suite: 'test/native-platform-capability.test.mjs',
        expect: 'red'
    },
    {
        layer: 'JS caller: a reply that is not a capability result is refused',
        file: 'overlay/scratch-vm/src/extension-support/native-platform-capability.js',
        find: "                reply.kind !== 'capability' || typeof reply.result !== 'string') {",
        with: '                false) {',
        suite: 'test/native-platform-capability.test.mjs',
        expect: 'red'
    },
    {
        layer: 'sweep detector: every shape still fires',
        file: 'scripts/audit-gate-shapes.mjs',
        find: "        if (reaches && !soundEmpty && !soundDomain) {",
        with: '        if (false) {',
        suite: 'test/gate-shapes.test.mjs',
        expect: 'red'
    },
    {
        layer: 'gate coverage: a wrapper-invoked gate still counts as run',
        file: 'test/gate-coverage.test.mjs',
        find: "    `(?:${WRAPPERS}\\\\s+)*` +",
        with: '    `` +',
        suite: 'test/gate-coverage.test.mjs',
        expect: 'red'
    },
    {
        layer: 'realm: the operation table has a null prototype',
        file: 'apps/tauri/src-tauri/src/native_broker_bootstrap.js',
        find: "Object.freeze({__proto__: null, 'platform.kind.read': 'platform/default'})",
        with: "Object.freeze({'platform.kind.read': 'platform/default'})",
        suite: 'test/native-broker-bootstrap.test.mjs',
        expect: 'green-known',
        because: 'the `typeof resource !== "string"` guard is independently sufficient — a ' +
            'prototype name resolves to Object.prototype or a function, neither a string. ' +
            'Removing BOTH is what turns the suite red.'
    }
];

const runSuite = suite => {
    try {
        execFileSync(process.execPath, ['--test', suite],
            {cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 900000});
        return 'green';
    } catch {
        return 'red';
    }
};

let failures = 0;
const results = [];
for (const m of MUTATIONS) {
    if (only && !m.layer.includes(only)) continue;
    const full = path.join(root, m.file);
    const original = readFileSync(full, 'utf8');
    const count = original.split(m.find).length - 1;
    if (count !== 1) {
        console.log(`SKIP  ${m.layer}\n      anchor occurs ${count} times in ${m.file} — the mutation is stale`);
        failures++;
        continue;
    }
    writeFileSync(full, original.replace(m.find, m.with));
    let outcome;
    try {
        outcome = runSuite(m.suite);
    } finally {
        writeFileSync(full, original);   // always restore, even if the runner throws
    }
    const ok = m.expect === 'red' ? outcome === 'red' : outcome === 'green';
    results.push({...m, outcome, ok});
    if (!ok) failures++;
    console.log(`${outcome.toUpperCase().padEnd(5)} ${ok ? ' ' : '!'} ${m.layer}`);
    if (m.expect === 'green-known') console.log(`        known: ${m.because}`);
    if (!ok) {
        console.log(`        EXPECTED ${m.expect} — the guard is not pinned by ${m.suite}, ` +
            'or the mutation does not weaken what its author thought');
    }
}

console.log(`\n${results.filter(r => r.ok).length}/${results.length} mutations behaved as documented`);
if (failures) {
    console.log('A mutation that does not turn its suite red is a gate that cannot fail.');
    process.exit(1);
}
