import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

const audit = source => {
    for (const name of ['native_broker_open', 'native_broker_request', 'native_broker_main_teardown']) {
        const body = source.slice(source.indexOf(`fn ${name}`), source.indexOf('\n}', source.indexOf(`fn ${name}`)) + 2);
        assert.match(body, /exact_label\(&window, MAIN_LABEL\)\?/u, `${name} binds main caller`);
    }
    for (const name of ['native_broker_reply', 'native_broker_teardown']) {
        const body = source.slice(source.indexOf(`fn ${name}`), source.indexOf('\n}', source.indexOf(`fn ${name}`)) + 2);
        assert.match(body, /exact_label\(&window, BROKER_LABEL\)\?/u, `${name} binds broker caller`);
    }
    assert.match(source, /origins\.insert[\s\S]*broker\.eval/u, 'origin is installed before eval');
    assert.match(source, /fn close_main_session[\s\S]*main_session_teardown[\s\S]*origins[\s\S]*\.remove/u, 'session close drains relay and origins');
    assert.match(source, /broker\.eval[\s\S]*close_main_session/u, 'eval failure closes the whole session');
    assert.match(source, /getrandom::getrandom/u, 'IDs use OS CSPRNG');
    assert.match(source, /Mutex<Inner>/u, 'relay and origins share a bounded state lock');
};

test('staged native broker adapter is caller-bound and rollback-safe', () => {
    audit(read('apps/tauri/src-tauri/src/native_broker_adapter.rs'));
    const handler = read('apps/tauri/src-tauri/src/lib.rs').match(/generate_handler!\(\[(?<body>[\s\S]*?)\]\)/u)?.groups.body ?? '';
    assert.doesNotMatch(handler, /native_broker_/u, 'staged adapter remains unregistered');
});

test('adapter gate detects label, ordering, rollback, and registration mutations', () => {
    const source = read('apps/tauri/src-tauri/src/native_broker_adapter.rs');
    for (const mutation of [
        source.replace('exact_label(&window, MAIN_LABEL)?;', ''),
        source.replace('exact_label(&window, BROKER_LABEL)?;', ''),
        source.replace('getrandom::getrandom', 'insecure_random'),
        source.replace('origins.insert', 'origins.get'),
        source.replace('fn close_main_session', 'fn rollback_removed'),
    ]) assert.throws(() => audit(mutation));
});
