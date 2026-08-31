import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const tauri = path.join(root, 'apps/tauri/src-tauri');
const BROKER_LABEL = 'capability-broker';
const BROKER_PERMISSION = 'allow-capability-broker-invoke';
const DENY_CROSS_LABEL_DEVTOOLS = 'core:webview:deny-internal-toggle-devtools';

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
    .split(',')
    .map(command => command.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim())
    .filter(Boolean);

const audit = ({rust, config, capabilities}) => {
    const commands = registeredCommands(rust);
    const brokerCommands = commands.filter(command => /(?:capability|broker)/i.test(command));
    if (brokerCommands.length === 0) return {implemented: false, commands};

    assert.deepEqual(brokerCommands, ['capability_broker::invoke'],
        'the native boundary must have one deliberately named broker command');
    assert.match(rust, /const\s+CAPABILITY_BROKER_LABEL\s*:\s*&str\s*=\s*"capability-broker"\s*;/,
        'the caller label must be a single Rust constant');
    assert.match(rust,
        /(?:webview|window)\.label\(\)\s*!=\s*CAPABILITY_BROKER_LABEL[\s\S]{0,300}(?:return|Err\s*\()/,
        'Rust must reject every caller except the exact broker label before dispatch');
    assert.match(rust,
        /WebviewWindowBuilder::new\([\s\S]{0,300}CAPABILITY_BROKER_LABEL[\s\S]{0,300}WebviewUrl::App\(/,
        'the broker must be created from immutable local app content');
    assert.match(rust, /\.visible\(false\)/, 'the broker webview must be hidden');
    assert.match(rust, /\.focused\(false\)/, 'the broker webview must not steal focus');

    const broker = capabilities.find(item => item.identifier === 'native-capability-broker');
    assert.ok(broker, 'an isolated native-capability-broker capability is required');
    assert.deepEqual(broker.webviews, [BROKER_LABEL],
        'the capability must target only the exact broker webview label');
    assert.deepEqual(broker.windows || [], [],
        'window scope would grant every child webview in that window and must stay empty');
    assert.deepEqual(broker.permissions, [BROKER_PERMISSION],
        'the broker must receive only its generated app-command permission');
    for (const capability of capabilities.filter(item => item !== broker)) {
        assert.ok(!capability.permissions.includes(BROKER_PERMISSION),
            `${capability.identifier} must not grant the native broker command`);
        assert.ok(!(capability.windows || []).includes('*'),
            `${capability.identifier} must not wildcard webview access once the broker exists`);
    }
    const main = capabilities.find(item => (item.windows || []).includes('main'));
    assert.ok(main && main.permissions.includes(DENY_CROSS_LABEL_DEVTOOLS),
        'main must explicitly lose core:default cross-label devtools authority');
    assert.ok(!(config.app.windows || []).some(window => window.label === BROKER_LABEL),
        'the privileged broker must not be an ordinary visible config window');
    return {implemented: true, commands};
};

const liveInputs = () => ({
    rust: readFileSync(path.join(tauri, 'src/lib.rs'), 'utf8'),
    config: JSON.parse(readFileSync(path.join(tauri, 'tauri.conf.json'), 'utf8')),
    capabilities: readdirSync(path.join(tauri, 'capabilities'))
        .filter(file => file.endsWith('.json'))
        .map(file => JSON.parse(readFileSync(path.join(tauri, 'capabilities', file), 'utf8')))
});

test('native capability command stays absent until the isolated broker topology is complete', () => {
    const result = audit(liveInputs());
    assert.equal(typeof result.implemented, 'boolean');
    if (!result.implemented) {
        assert.ok(!result.commands.some(command => /(?:capability|broker)/i.test(command)),
            'the pre-implementation state must register no partial native broker command');
    }
});

const completeFuture = () => ({
    rust: `
const CAPABILITY_BROKER_LABEL: &str = "capability-broker";
fn command(webview: tauri::WebviewWindow) -> Result<(), String> {
  if webview.label() != CAPABILITY_BROKER_LABEL { return Err("unauthorized caller".into()); }
  Ok(())
}
fn setup(app: &tauri::App) {
  tauri::WebviewWindowBuilder::new(app, CAPABILITY_BROKER_LABEL,
    tauri::WebviewUrl::App("broker.html".into())).visible(false).focused(false).build();
}
fn run() { x.invoke_handler(tauri::generate_handler![capability_broker::invoke]); }
`,
    config: {app: {windows: [{label: 'main'}]}},
    capabilities: [
        {identifier: 'default', windows: ['main'], permissions: ['core:default', DENY_CROSS_LABEL_DEVTOOLS]},
        {identifier: 'native-capability-broker', webviews: [BROKER_LABEL], permissions: [BROKER_PERMISSION]}
    ]
});

test('future topology contract rejects independently weakened boundaries', () => {
    assert.equal(audit(completeFuture()).implemented, true);
    const mutations = [
        input => { input.rust = input.rust.replace(' != CAPABILITY_BROKER_LABEL', ' == CAPABILITY_BROKER_LABEL'); },
        input => { input.rust = input.rust.replace('WebviewUrl::App(', 'WebviewUrl::External('); },
        input => { input.rust = input.rust.replace('.visible(false)', '.visible(true)'); },
        input => { input.capabilities[1].webviews = ['main']; },
        input => { input.capabilities[1].windows = [BROKER_LABEL]; },
        input => { input.capabilities[1].permissions.push('core:default'); },
        input => { input.capabilities[0].permissions.push(BROKER_PERMISSION); },
        input => { input.capabilities[0].permissions = ['core:default']; },
        input => { input.capabilities[0].windows = ['*']; }
    ];
    for (const mutate of mutations) {
        const input = structuredClone(completeFuture());
        mutate(input);
        assert.throws(() => audit(input));
    }
});
