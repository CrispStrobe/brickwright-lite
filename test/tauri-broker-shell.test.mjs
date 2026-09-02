import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const rustPath = path.join(root, 'apps/tauri/src-tauri/src/native_broker.rs');
const libPath = path.join(root, 'apps/tauri/src-tauri/src/lib.rs');
const htmlPath = path.join(root, 'overlay/scratch-gui/static/capability-broker.html');

const readInputs = () => ({
    rust: readFileSync(rustPath, 'utf8'),
    lib: readFileSync(libPath, 'utf8'),
    html: readFileSync(htmlPath, 'utf8')
});

const assertBuilderFlag = (rust, method, value) => {
    assert.match(rust, new RegExp(`\\.${method}\\(\\s*${value}\\s*\\)`),
        `broker shell must set ${method}(${value}) explicitly`);
};

const balancedBody = (source, marker, open = '{', close = '}') => {
    const markerAt = source.indexOf(marker);
    assert.notEqual(markerAt, -1, `missing ${marker}`);
    const start = source.indexOf(open, markerAt + marker.length);
    assert.notEqual(start, -1, `missing ${open} after ${marker}`);
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        if (source[index] === open) depth++;
        if (source[index] === close && --depth === 0) return source.slice(start + 1, index);
    }
    assert.fail(`unbalanced ${marker}`);
};

const audit = ({rust, lib, html}) => {
    assert.match(rust, /const\s+(?:BROKER_LABEL|LABEL)\s*:\s*&str\s*=\s*"capability-broker"\s*;/,
        'the privileged window label must be one exact constant');
    assert.match(rust, /const\s+(?:BROKER_DOCUMENT|DOCUMENT)\s*:\s*&str\s*=\s*"capability-broker\.html"\s*;/,
        'the packaged broker document must be one exact constant');
    assert.match(rust,
        /WebviewWindowBuilder::new\([\s\S]{0,240}(?:BROKER_LABEL|LABEL)[\s\S]{0,240}WebviewUrl::App\(\s*(?:BROKER_DOCUMENT|DOCUMENT)\.into\(\)\s*\)/,
        'the broker must load only its packaged local asset');

    for (const [method, value] of [
        ['visible', 'false'],
        ['focused', 'false'],
        ['focusable', 'false'],
        ['decorations', 'false'],
        ['resizable', 'false'],
        ['maximizable', 'false'],
        ['minimizable', 'false'],
        ['closable', 'false'],
        ['skip_taskbar', 'true'],
        ['devtools', 'false'],
        ['incognito', 'true']
    ]) assertBuilderFlag(rust, method, value);

    assert.match(rust, /\.on_navigation\(\s*(?:[A-Za-z_][A-Za-z0-9_:]*|\|[^|]*\|)/,
        'the shell must install a navigation predicate');
    for (const check of [
        /url\.path\(\)/,
        /url\.query\(\)\.is_some\(\)/,
        /url\.fragment\(\)\.is_some\(\)/,
        /url\.username\(\)\.is_empty\(\)/,
        /url\.password\(\)\.is_some\(\)/,
        /url\.port\(\)\.is_some\(\)/,
        /url\.scheme\(\)/,
        /"tauri"/,
        /"localhost"/,
        /"https"/,
        /"tauri\.localhost"/
    ]) assert.match(rust, check, 'navigation policy must accept only the exact local asset URL');
    assert.equal((rust.match(/url\.host_str\(\)/g) || []).length, 2,
        'both platform URL forms must compare their exact local host');
    assert.match(rust, /\.on_new_window\([\s\S]{0,240}(?:false|Deny)/,
        'new-window creation must be denied');

    assert.match(lib, /#\[cfg\(desktop\)\][\s\S]{0,160}mod\s+native_broker\s*;/,
        'the shell module must compile on desktop only');
    assert.match(lib,
        /#\[cfg\(desktop\)\][\s\S]{0,240}native_broker::(?:setup|create)\(\s*(?:app|app\.handle\(\))\s*,\s*native_policy\.clone\(\)\s*\)\s*\?\s*;/,
        'desktop startup must create the broker shell and propagate failure');

    const navigation = balancedBody(rust, 'fn handle_navigation');
    assert.match(navigation,
        /let\s+allowed\s*=\s*is_exact_local_document\(url\)\s*;[\s\S]*if\s+!allowed\s*\{\s*revoke\(\)\s*;\s*\}[\s\S]*allowed\s*$/,
        'disallowed navigation must revoke synchronously before returning false');
    assert.equal((navigation.match(/revoke\(\)/g) || []).length, 1,
        'allowed navigation must not revoke policy state');
    const windowEvent = balancedBody(rust, 'fn handle_window_event');
    assert.match(windowEvent,
        /^\s*if\s+matches!\(event,\s*WindowEvent::Destroyed\)\s*\{\s*revoke\(\)\s*;\s*\}\s*$/,
        'Destroyed must revoke and every other window event must remain inert');
    assert.match(rust, /\.on_window_event\([\s\S]{0,240}handle_window_event\([\s\S]{0,180}revoke_all\(LABEL\)/,
        'the built broker window must connect Destroyed lifecycle revocation to managed policy');

    const manageAt = lib.indexOf('builder.manage(native_policy.clone())');
    const setupAt = lib.indexOf('.setup(');
    assert.ok(manageAt !== -1 && setupAt !== -1 && manageAt < setupAt,
        'native policy state must be managed before broker setup');
    const handler = balancedBody(lib, 'tauri::generate_handler!', '[', ']')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // C5d registers TRANSPORT, and only transport. The shell stayed inert for as long as it
    // could; what must stay true now is narrower and more useful than "no broker command":
    // the registered broker surface is exactly the acknowledgement plus the five relay
    // commands, and no SEMANTIC native operation has slipped in beside them (that is D1's
    // job, behind its own lease). An unrecognised broker-ish command fails here.
    const ALLOWED_BROKER_COMMANDS = new Set(['native_broker_ready', 'native_broker_open',
        'native_broker_request', 'native_broker_reply', 'native_broker_main_teardown',
        'native_broker_teardown']);
    // Match on the FULL path, not the final segment: `native_broker::invoke` is broker-ish in
    // its module and innocuous in its name, and checking only the name let it through.
    const registered = handler.split(',')
        .map(entry => entry.replace(/^#\[\s*cfg\([^)]*\)\s*\]/, '').trim())
        .filter(Boolean);
    for (const path of registered.filter(entry => /native_(?:broker|policy)|capability|broker/i.test(entry))) {
        assert.ok(ALLOWED_BROKER_COMMANDS.has(path.split('::').at(-1)),
            `${path} is not a reviewed broker transport command`);
    }
    assert.doesNotMatch(handler, /platform_kind|platform\.kind|native_broker_invoke|capability_broker::invoke/i,
        'no semantic native operation may be registered at this checkpoint');

    assert.doesNotMatch(html, /<script\b|<link\b|<iframe\b|<object\b|<embed\b|<img\b|<audio\b|<video\b/i,
        'the broker document must be inert and carry no executable or fetched subresources');
    assert.doesNotMatch(html, /(?:https?:)?\/\//i, 'the broker document must contain no remote URL');
    const cspTag = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
    assert.ok(cspTag, 'the inert broker document must carry an inline CSP');
    const csp = cspTag[0].match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    assert.ok(csp, 'the CSP meta element must have a content value');
    const policy = csp[1] || csp[2];
    assert.match(policy, /(?:^|;)\s*default-src\s+'none'\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*script-src\s+blob:\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*worker-src\s+blob:\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*connect-src\s+'none'\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*base-uri\s+'none'\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*form-action\s+'none'\s*(?:;|$)/i);
    assert.match(policy, /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i);
};

test('desktop creates one inert, local, non-interactive capability broker shell', () => {
    audit(readInputs());
});

test('broker shell gate detects independently weakened controls', () => {
    const baseline = readInputs();
    const mutations = [
        input => { input.rust = input.rust.replace('"capability-broker"', '"main"'); },
        input => { input.rust = input.rust.replace('WebviewUrl::App', 'WebviewUrl::External'); },
        input => { input.rust = input.rust.replace('.visible(false)', '.visible(true)'); },
        input => { input.rust = input.rust.replace('.focused(false)', '.focused(true)'); },
        input => { input.rust = input.rust.replace('.focusable(false)', '.focusable(true)'); },
        input => { input.rust = input.rust.replace('.decorations(false)', '.decorations(true)'); },
        input => { input.rust = input.rust.replace('.resizable(false)', '.resizable(true)'); },
        input => { input.rust = input.rust.replace('.maximizable(false)', '.maximizable(true)'); },
        input => { input.rust = input.rust.replace('.minimizable(false)', '.minimizable(true)'); },
        input => { input.rust = input.rust.replace('.closable(false)', '.closable(true)'); },
        input => { input.rust = input.rust.replace('.skip_taskbar(true)', '.skip_taskbar(false)'); },
        input => { input.rust = input.rust.replace('.devtools(false)', '.devtools(true)'); },
        input => { input.rust = input.rust.replace('.incognito(true)', '.incognito(false)'); },
        input => { input.rust = input.rust.replace('.on_navigation', '.without_navigation_policy'); },
        input => { input.rust = input.rust.replace('url.query().is_some()', 'false'); },
        input => { input.rust = input.rust.replace('url.host_str()', 'url.any_host()'); },
        input => { input.rust = input.rust.replace('.on_new_window', '.without_new_window_policy'); },
        input => { input.rust = input.rust.replace('if !allowed {', 'if allowed {'); },
        input => { input.rust = input.rust.replace('WindowEvent::Destroyed', 'WindowEvent::Focused(false)'); },
        input => { input.rust = input.rust.replace('    allowed\n}', '    revoke();\n    allowed\n}'); },
        input => { input.lib = input.lib.replace('builder.manage(native_policy.clone())', 'builder'); },
        input => { input.lib = input.lib.replace('fileio::save_project,', 'native_broker::invoke,\n            fileio::save_project,'); },
        input => { input.lib = input.lib.replace('#[cfg(desktop)]', '#[cfg(mobile)]'); },
        input => { input.html = input.html.replace("default-src 'none'", "default-src 'self'"); },
        input => { input.html = input.html.replace('script-src blob:', "script-src 'unsafe-eval'"); },
        input => { input.html = input.html.replace('worker-src blob:', "worker-src 'self'"); },
        input => { input.html = input.html.replace("connect-src 'none'", "connect-src 'self'"); },
        input => { input.html = input.html.replace('</body>', '<script src="https://evil.invalid/x.js"></script></body>'); }
    ];

    for (const [index, mutate] of mutations.entries()) {
        const input = {...baseline};
        mutate(input);
        assert.throws(() => audit(input), `mutation ${index} must fail the shell audit`);
    }
});
