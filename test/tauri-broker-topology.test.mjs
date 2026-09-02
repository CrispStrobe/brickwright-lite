import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const tauri = path.join(root, 'apps/tauri/src-tauri');
const BROKER_LABEL = 'capability-broker';
const ACK_PERMISSION = 'allow-native-broker-ready';
const DENY_CROSS_LABEL_DEVTOOLS = 'core:webview:deny-internal-toggle-devtools';
// C5c4 replaced the single `capability_broker::invoke` this gate was first written against with
// disjoint main and broker commands, because one command reachable from both realms cannot be
// scoped by an ACL to either. The set is pinned here so growing it stays a reviewed act.
const TRANSPORT_COMMANDS = [
    'native_broker_main_teardown',
    'native_broker_open',
    'native_broker_reply',
    'native_broker_request',
    'native_broker_teardown'
];
const ACK_COMMAND = 'native_broker_ready';

const balancedBody = (source, marker, open = '[', close = ']') => {
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing ${marker}`);
    const first = source.indexOf(open, start + marker.length);
    assert.notEqual(first, -1, `missing ${open} after ${marker}`);
    let depth = 0;
    for (let i = first; i < source.length; i++) {
        if (source[i] === open) depth++;
        if (source[i] === close && --depth === 0) return source.slice(first + 1, i);
    }
    assert.fail(`unbalanced ${marker}`);
};

const registeredCommands = source => balancedBody(source, 'tauri::generate_handler!')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map(entry => entry.replace(/^#\[\s*cfg\([^)]*\)\s*\]/, '').trim())
    .filter(Boolean)
    .map(entry => entry.split('::').at(-1));

// A fixed character window is not a function body: deleting a guard from one command simply
// matched the next command's guard, and the mutation survived. Brace-match instead.
const fnBody = (source, name) => {
    const at = source.indexOf(`fn ${name}(`);
    assert.notEqual(at, -1, `${name} must exist`);
    const open = source.indexOf('{', at);
    assert.notEqual(open, -1, `${name} must have a body`);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    assert.fail(`unbalanced body for ${name}`);
};

const audit = ({handler, broker, adapter, transport, capabilities, runtime, config}) => {
    const commands = registeredCommands(handler);
    const brokerCommands = commands.filter(command => /(?:capability|broker)/i.test(command)).sort();
    if (brokerCommands.length === 0) return {implemented: false, commands};

    assert.deepEqual(brokerCommands, [ACK_COMMAND, ...TRANSPORT_COMMANDS].sort(),
        'the native boundary must register exactly the acknowledgement and the disjoint transport');
    assert.match(transport, /pub\(crate\)\s+const\s+BROKER_LABEL\s*:\s*&str\s*=\s*"capability-broker"\s*;/,
        'the broker caller label must be a single Rust constant');
    assert.match(transport, /pub\(crate\)\s+const\s+MAIN_LABEL\s*:\s*&str\s*=\s*"main"\s*;/,
        'the main caller label must be a single Rust constant');

    // Every command binds itself to exactly one caller label before it does anything else.
    for (const command of [ACK_COMMAND, ...TRANSPORT_COMMANDS]) {
        const body = fnBody(adapter, command);
        assert.match(body, /exact_label\(&window,\s*(?:MAIN_LABEL|BROKER_LABEL)\)\?;/,
            `${command} must bind its caller label before dispatch`);
    }
    assert.match(fnBody(adapter, 'native_broker_reply'), /exact_label\(&window,\s*BROKER_LABEL\)/,
        'only the broker webview may reply');
    assert.match(fnBody(adapter, 'native_broker_request'), /exact_label\(&window,\s*MAIN_LABEL\)/,
        'only the main webview may drive a request');
    assert.match(fnBody(adapter, ACK_COMMAND), /exact_label\(&window,\s*BROKER_LABEL\)/,
        'only the broker webview may acknowledge');

    // The acknowledgement is the ONLY grant path, and it claims its one shot before widening.
    assert.equal((adapter.match(/add_capability\(/g) || []).length, 1,
        'the ACL may be widened from exactly one place');
    assert.match(adapter,
        /granted\s*\.\s*swap\(true,\s*Ordering::SeqCst\)[\s\S]{0,200}add_capability\(/,
        'the one-shot guard must be claimed before any capability is added');
    assert.match(fnBody(adapter, ACK_COMMAND), /grant_transport_once/,
        'only the acknowledgement may grant the transport');
    for (const command of TRANSPORT_COMMANDS) {
        assert.doesNotMatch(fnBody(adapter, command), /grant_transport_once/,
            `${command} must not grant capabilities`);
    }

    assert.match(broker,
        /WebviewWindowBuilder::new\([\s\S]{0,300}LABEL[\s\S]{0,300}WebviewUrl::App\(/,
        'the broker must be created from immutable local app content');
    assert.match(broker, /\.visible\(false\)/, 'the broker webview must be hidden');
    assert.match(broker, /\.focused\(false\)/, 'the broker webview must not steal focus');

    // Startup holds no transport authority at all.
    const transportPermissions = TRANSPORT_COMMANDS.map(c => `allow-${c.replaceAll('_', '-')}`);
    for (const capability of capabilities) {
        for (const permission of capability.permissions) {
            assert.ok(!transportPermissions.includes(permission),
                `${capability.identifier} must not grant transport at startup`);
        }
        assert.ok(!(capability.windows || []).includes('*'),
            `${capability.identifier} must not wildcard webview access once the broker exists`);
    }
    const ack = capabilities.find(item => item.permissions.includes(ACK_PERMISSION));
    assert.ok(ack, 'the acknowledgement must be granted to something');
    assert.deepEqual(ack.webviews, [BROKER_LABEL],
        'the acknowledgement must target only the exact broker webview label');
    assert.deepEqual(ack.windows || [], [],
        'window scope would grant every child webview in that window and must stay empty');
    assert.deepEqual(ack.permissions, [ACK_PERMISSION],
        'the startup broker capability carries the acknowledgement and nothing else');

    const brokerHalf = runtime.find(item => item.identifier === 'native-capability-broker');
    assert.ok(brokerHalf, 'an isolated native-capability-broker capability is required');
    assert.deepEqual(brokerHalf.webviews, [BROKER_LABEL],
        'the capability must target only the exact broker webview label');
    assert.deepEqual(brokerHalf.windows || [], [], 'window scope must stay empty');

    const main = capabilities.find(item => (item.windows || []).includes('main'));
    assert.ok(main && main.permissions.includes(DENY_CROSS_LABEL_DEVTOOLS),
        'main must explicitly lose core:default cross-label devtools authority');
    assert.ok(!(config.app.windows || []).some(window => window.label === BROKER_LABEL),
        'the privileged broker must not be an ordinary visible config window');
    return {implemented: true, commands};
};

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const liveInputs = () => ({
    handler: readFileSync(path.join(tauri, 'src/lib.rs'), 'utf8'),
    broker: readFileSync(path.join(tauri, 'src/native_broker.rs'), 'utf8'),
    adapter: readFileSync(path.join(tauri, 'src/native_broker_adapter.rs'), 'utf8'),
    transport: readFileSync(path.join(tauri, 'src/native_broker_transport.rs'), 'utf8'),
    config: readJson(path.join(tauri, 'tauri.conf.json')),
    capabilities: readdirSync(path.join(tauri, 'capabilities'))
        .filter(file => file.endsWith('.json'))
        .map(file => readJson(path.join(tauri, 'capabilities', file))),
    runtime: readdirSync(path.join(tauri, 'runtime-capabilities'))
        .filter(file => file.endsWith('.json'))
        .map(file => readJson(path.join(tauri, 'runtime-capabilities', file)))
});

test('the native broker topology binds every caller and grants transport only on acknowledgement', () => {
    const result = audit(liveInputs());
    assert.equal(result.implemented, true, 'the broker transport is registered by this checkpoint');
});

test('topology contract rejects independently weakened boundaries', () => {
    const mutations = [
        input => { input.adapter = input.adapter.replace(
            'exact_label(&window, BROKER_LABEL)?;\n    state.grant_transport_once(&app)',
            'state.grant_transport_once(&app)'); },
        input => { input.adapter = input.adapter.replace(
            'fn native_broker_reply(', 'fn native_broker_reply_renamed('); },
        input => { input.adapter = input.adapter.replace(
            'if self.granted.swap(true, Ordering::SeqCst) {\n            return Err("broker refused".into());\n        }\n', ''); },
        input => { input.broker = input.broker.replace('.visible(false)', '.visible(true)'); },
        input => { input.broker = input.broker.replace('.focused(false)', '.focused(true)'); },
        input => { input.broker = input.broker.replace('WebviewUrl::App(', 'WebviewUrl::External('); },
        input => { input.transport = input.transport.replace(
            'pub(crate) const BROKER_LABEL: &str = "capability-broker";', ''); },
        input => { input.capabilities.find(c => c.identifier === 'native-broker-ack')
            .permissions.push('allow-native-broker-request'); },
        input => { input.capabilities.find(c => c.identifier === 'native-broker-ack').webviews = ['main']; },
        input => { input.capabilities.find(c => c.identifier === 'native-broker-ack').windows = ['main']; },
        input => { input.capabilities.find(c => c.identifier === 'default').windows = ['*']; },
        input => { input.capabilities.find(c => c.identifier === 'default').permissions =
            input.capabilities.find(c => c.identifier === 'default').permissions
                .filter(p => p !== DENY_CROSS_LABEL_DEVTOOLS); },
        input => { input.runtime.find(c => c.identifier === 'native-capability-broker').webviews = ['main']; },
        input => { input.runtime.find(c => c.identifier === 'native-capability-broker').windows = [BROKER_LABEL]; },
        input => { input.handler = input.handler.replace(
            'native_broker_adapter::native_broker_reply,', ''); }
    ];
    const survivors = [];
    mutations.forEach((mutate, index) => {
        const input = structuredClone(liveInputs());
        mutate(input);
        try { audit(input); survivors.push(index); } catch { /* red as required */ }
    });
    assert.deepEqual(survivors, [], `mutations that did NOT turn the gate red: ${survivors}`);
});
