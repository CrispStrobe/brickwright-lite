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
        /#\[cfg\(desktop\)\][\s\S]{0,240}native_broker::(?:setup|create)\(\s*(?:app|app\.handle\(\))\s*\)\s*\?\s*;/,
        'desktop startup must create the broker shell and propagate failure');

    assert.doesNotMatch(html, /<script\b|<link\b|<iframe\b|<object\b|<embed\b|<img\b|<audio\b|<video\b/i,
        'the broker document must be inert and carry no executable or fetched subresources');
    assert.doesNotMatch(html, /(?:https?:)?\/\//i, 'the broker document must contain no remote URL');
    const cspTag = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
    assert.ok(cspTag, 'the inert broker document must carry an inline CSP');
    const csp = cspTag[0].match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    assert.ok(csp, 'the CSP meta element must have a content value');
    const policy = csp[1] || csp[2];
    assert.match(policy, /(?:^|;)\s*default-src\s+'none'\s*(?:;|$)/i);
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
        input => { input.lib = input.lib.replace('#[cfg(desktop)]', '#[cfg(mobile)]'); },
        input => { input.html = input.html.replace("default-src 'none'", "default-src 'self'"); },
        input => { input.html = input.html.replace('</body>', '<script src="https://evil.invalid/x.js"></script></body>'); }
    ];

    for (const [index, mutate] of mutations.entries()) {
        const input = {...baseline};
        mutate(input);
        assert.throws(() => audit(input), `mutation ${index} must fail the shell audit`);
    }
});
