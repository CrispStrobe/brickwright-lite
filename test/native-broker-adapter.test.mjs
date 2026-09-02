import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

// Bracket-match the handler list. The old `generate_handler!\(\[([\s\S]*?)\]\)` was
// non-greedy, so the first `]` ended the match — and once commands carried `#[cfg(desktop)]`
// that `]` arrived before any of them. The registration assertion below then read a truncated
// string and passed while proving nothing.
const handlerBody = source => {
    const at = source.indexOf('generate_handler!');
    assert.notEqual(at, -1, 'the handler must exist');
    const open = source.indexOf('[', at);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '[') depth++;
        if (source[i] === ']' && --depth === 0) return source.slice(open + 1, i);
    }
    assert.fail('unbalanced handler list');
};

const fnBody = (source, name) => {
    const at = source.indexOf(`fn ${name}(`);
    assert.notEqual(at, -1, `${name} must exist`);
    const open = source.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    assert.fail(`unbalanced body for ${name}`);
};

const audit = source => {
    assert.match(fnBody(source, 'native_broker_ready'), /exact_label\(&window, BROKER_LABEL\)\?/u,
        'the acknowledgement binds the broker caller');
    for (const name of ['native_broker_open', 'native_broker_request', 'native_broker_main_teardown']) {
        assert.match(fnBody(source, name), /exact_label\(&window, MAIN_LABEL\)\?/u, `${name} binds main caller`);
    }
    for (const name of ['native_broker_reply', 'native_broker_teardown']) {
        assert.match(fnBody(source, name), /exact_label\(&window, BROKER_LABEL\)\?/u, `${name} binds broker caller`);
    }
    assert.match(source, /origins\.insert[\s\S]*broker\.eval/u, 'origin is installed before eval');
    assert.match(source, /fn close_main_session[\s\S]*main_session_teardown[\s\S]*origins[\s\S]*\.remove/u, 'session close drains relay and origins');
    assert.match(source, /broker\.eval[\s\S]*close_main_session/u, 'eval failure closes the whole session');
    assert.match(source, /getrandom::getrandom/u, 'IDs use OS CSPRNG');
    assert.match(source, /Mutex<Inner>/u, 'relay and origins share a bounded state lock');
};

test('native broker adapter is caller-bound and rollback-safe', () => {
    audit(read('apps/tauri/src-tauri/src/native_broker_adapter.rs'));
    // C5d registers the adapter. Every broker entry must still be desktop-gated, so a phone
    // build carries no transport command at all.
    const handler = handlerBody(read('apps/tauri/src-tauri/src/lib.rs'));
    const entries = handler.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        .split(',').map(entry => entry.trim()).filter(Boolean);
    const brokerEntries = entries.filter(entry => /native_broker_/u.test(entry));
    // Six transport/ack commands from the adapter plus D1's semantic pair, which lives in
    // native_capability.rs so the adapter stays transport-only.
    assert.equal(brokerEntries.length, 8, 'the eight broker commands must be registered');
    assert.equal(brokerEntries.filter(entry => /native_capability::/u.test(entry)).length, 2,
        'the semantic pair must come from the capability module, not the transport adapter');
    for (const entry of brokerEntries) {
        assert.match(entry, /^#\[\s*cfg\(desktop\)\s*\]/u, `${entry} must be desktop-gated`);
    }
});

test('adapter gate detects label, ordering, rollback, and registration mutations', () => {
    const source = read('apps/tauri/src-tauri/src/native_broker_adapter.rs');
    // Scope each label mutation to ONE function: a bare `replace` hits the first occurrence in
    // the file, which after the acknowledgement landed was no longer the function under test.
    const stripLabel = (name, label) => source.replace(fnBody(source, name),
        fnBody(source, name).replace(`exact_label(&window, ${label})?;`, ''));
    for (const mutation of [
        stripLabel('native_broker_open', 'MAIN_LABEL'),
        stripLabel('native_broker_request', 'MAIN_LABEL'),
        stripLabel('native_broker_main_teardown', 'MAIN_LABEL'),
        stripLabel('native_broker_reply', 'BROKER_LABEL'),
        stripLabel('native_broker_teardown', 'BROKER_LABEL'),
        stripLabel('native_broker_ready', 'BROKER_LABEL'),
        source.replace('getrandom::getrandom', 'insecure_random'),
        source.replace('origins.insert', 'origins.get'),
        source.replace('fn close_main_session', 'fn rollback_removed'),
    ]) assert.throws(() => audit(mutation));
});
