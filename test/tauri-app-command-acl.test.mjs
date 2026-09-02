import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const native = path.join(root, 'apps/tauri/src-tauri');
const BROKER_PREFIX = 'native_broker_';
const BROKER_WEBVIEW = 'capability-broker';
const ACK_COMMAND = 'native_broker_ready';

const balanced = (source, marker, open, close) => {
    const markerAt = source.indexOf(marker);
    assert.notEqual(markerAt, -1, `missing ${marker}`);
    const start = source.indexOf(open, markerAt + marker.length);
    assert.notEqual(start, -1, `missing ${open} after ${marker}`);
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === open) depth++;
        if (source[i] === close && --depth === 0) return source.slice(start + 1, i);
    }
    assert.fail(`unbalanced ${marker}`);
};

const stringArray = body => [...body.matchAll(/"([a-z0-9_-]+)"/g)].map(match => match[1]);
const uniqueSorted = values => [...new Set(values)].sort();

// Entries may carry a `#[cfg(...)]` attribute, which is how the broker transport stays off
// mobile. The attribute holds no comma, so splitting the list on commas keeps it attached to
// the command it guards — and the guard is part of what this gate checks, not noise to strip.
// Comments are stripped from the WHOLE body before splitting, not from each fragment after:
// a prose comma inside a `//` line otherwise becomes a list separator and invents an entry.
const handlerEntries = source => balanced(source, 'tauri::generate_handler!', '[', ']')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
        const cfg = /^#\[\s*cfg\(([^)]*)\)\s*\]/.exec(entry);
        return {
            cfg: cfg ? cfg[1].trim() : null,
            name: entry.replace(/^#\[\s*cfg\([^)]*\)\s*\]/, '').trim().split('::').at(-1)
        };
    });

const manifestCommands = source => {
    assert.match(source, /tauri_build::try_build\s*\(/, 'fallible ACL generation must not be discarded');
    assert.match(source, /AppManifest::new\(\)\.commands\(APP_COMMANDS\)/,
        'the generated app manifest must use the reviewed command constant');
    return stringArray(balanced(source, 'const APP_COMMANDS: &[&str] = &', '[', ']'));
};

const allowName = command => `allow-${command.replaceAll('_', '-')}`;
const allowsOf = capability => capability.permissions.filter(value => value.startsWith('allow-'));

const audit = ({handler, build, main, mobile, ack, runtime}) => {
    const entries = handlerEntries(handler);
    const registered = entries.map(entry => entry.name);
    const manifested = manifestCommands(build);
    assert.equal(registered.length, 23, 'review a deliberate command-count change');
    assert.equal(new Set(registered).size, registered.length, 'handler commands must be unique');
    assert.equal(new Set(manifested).size, manifested.length, 'manifest commands must be unique');
    assert.deepEqual(uniqueSorted(manifested), uniqueSorted(registered),
        'the app manifest must cover exactly every registered application command');

    const broker = entries.filter(entry => entry.name.startsWith(BROKER_PREFIX));
    const ordinary = entries.filter(entry => !entry.name.startsWith(BROKER_PREFIX));
    assert.ok(broker.length > 0, 'the broker transport must be registered by this checkpoint');
    // Mobile stays unregistered at COMPILE time, not merely ungranted: an ACL that forgot a
    // platform would still leave a callable command behind on a phone.
    for (const entry of broker) {
        assert.equal(entry.cfg, 'desktop', `${entry.name} must be registered only on desktop`);
    }
    for (const entry of ordinary) {
        assert.equal(entry.cfg, null, `${entry.name} must not be conditionally registered`);
    }

    const brokerAllows = broker.map(entry => allowName(entry.name));
    const ordinaryAllows = ordinary.map(entry => allowName(entry.name));
    const mainAllows = allowsOf(main);
    assert.deepEqual(uniqueSorted(mainAllows), uniqueSorted(ordinaryAllows),
        'main must receive exactly the non-broker application-command permissions');
    assert.equal(mainAllows.length, ordinaryAllows.length, 'main grants must not be duplicated');
    // The whole point of the checkpoint: the editor window holds no transport permission, so a
    // compromised editor realm cannot reply on the broker's behalf or open a session at all.
    assert.deepEqual(mainAllows.filter(value => brokerAllows.includes(value)), [],
        'main must hold no broker transport permission');
    assert.deepEqual(mobile.permissions.filter(value =>
        ordinaryAllows.includes(value) || brokerAllows.includes(value)), [],
    'the additive mobile capability must duplicate no application-command grant');

    // Startup grants only the acknowledgement, and only to the broker webview.
    assert.deepEqual(ack.webviews, [BROKER_WEBVIEW], 'the ack capability must target the broker webview');
    assert.deepEqual(ack.windows || [], [], 'window scope would reach every child webview');
    assert.deepEqual(ack.permissions, [allowName(ACK_COMMAND)],
        'the only startup broker grant is the acknowledgement itself');

    // The transport halves are runtime-only and disjoint.
    const runtimeAllows = runtime.flatMap(allowsOf);
    assert.deepEqual(uniqueSorted(runtimeAllows),
        uniqueSorted(brokerAllows.filter(value => value !== allowName(ACK_COMMAND))),
        'the runtime capabilities must cover exactly the transport commands, ack excluded');
    assert.equal(new Set(runtimeAllows).size, runtimeAllows.length,
        'no transport permission may be granted twice');
    for (const capability of runtime) {
        assert.equal((capability.webviews || []).length, 1,
            `${capability.identifier} must target exactly one webview`);
        assert.deepEqual(capability.windows || [], [],
            `${capability.identifier} must not use window scope`);
        assert.deepEqual(capability.platforms, ['linux', 'macOS', 'windows'],
            `${capability.identifier} must stay desktop-only`);
    }
    const byWebview = new Map(runtime.map(capability => [capability.webviews[0], allowsOf(capability)]));
    assert.deepEqual(uniqueSorted([...byWebview.keys()]), uniqueSorted(['main', BROKER_WEBVIEW]),
        'exactly two disjoint halves must exist: the editor and the broker');
    const mainHalf = byWebview.get('main');
    const brokerHalf = byWebview.get(BROKER_WEBVIEW);
    assert.deepEqual(mainHalf.filter(value => brokerHalf.includes(value)), [],
        'the two transport halves must be disjoint');
    assert.ok(!mainHalf.includes('allow-native-broker-reply'),
        'the editor must never be able to reply on the broker path');
    assert.ok(!brokerHalf.includes('allow-native-broker-open') &&
        !brokerHalf.includes('allow-native-broker-request'),
    'the broker must never be able to open or drive a session');
};

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const live = () => ({
    handler: readFileSync(path.join(native, 'src/lib.rs'), 'utf8'),
    build: readFileSync(path.join(native, 'build.rs'), 'utf8'),
    main: readJson(path.join(native, 'capabilities/default.json')),
    mobile: readJson(path.join(native, 'capabilities/mobile.json')),
    ack: readJson(path.join(native, 'capabilities/native-broker-ack.json')),
    runtime: ['native-broker-main', 'native-capability-broker']
        .map(name => readJson(path.join(native, `runtime-capabilities/${name}.json`)))
});

test('Tauri application-command manifest and main grants exactly match generate_handler', () => {
    audit(live());
});

test('Tauri application-command ACL rejects omissions, extras, and mobile duplication', () => {
    const mutations = [
        input => { input.build = input.build.replace('        "save_project",\n', ''); },
        input => { input.build = input.build.replace('        "save_project",', '        "invented_command",'); },
        input => { input.main.permissions = input.main.permissions.filter(value => value !== 'allow-save-project'); },
        input => { input.main.permissions.push('allow-invented-command'); },
        input => { input.mobile.permissions.push('allow-save-project'); },
        // The broker-specific half of the contract.
        input => { input.main.permissions.push('allow-native-broker-request'); },
        input => { input.main.permissions.push('allow-native-broker-reply'); },
        input => { input.mobile.permissions.push('allow-native-broker-request'); },
        input => { input.handler = input.handler.replace(
            '#[cfg(desktop)]\n            native_broker_adapter::native_broker_request', 
            'native_broker_adapter::native_broker_request'); },
        input => { input.ack.permissions.push('allow-native-broker-request'); },
        input => { input.ack.webviews = ['main']; },
        input => { input.ack.windows = ['main']; },
        input => { input.runtime[0].webviews = ['capability-broker']; },
        input => { input.runtime[0].permissions.push('allow-native-broker-reply'); },
        input => { input.runtime[1].permissions.push('allow-native-broker-open'); },
        input => { input.runtime[0].windows = ['main']; },
        input => { input.runtime[0].platforms = ['linux', 'macOS', 'windows', 'android']; },
        input => { input.runtime[1].permissions = []; }
    ];
    for (const mutate of mutations) {
        const input = structuredClone(live());
        mutate(input);
        assert.throws(() => audit(input), `mutation did not turn the gate red`);
    }
});
