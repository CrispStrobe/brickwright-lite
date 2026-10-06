// Native project documents in the desktop app (task E4 of docs/OPEN-TASKS-2026-09-29.md):
// File > Load / Save / Save As / Recent Projects through apps/tauri/src-tauri/src/fileio.rs.
// tauri-app-command-acl.test.mjs holds the grants; this file holds what the commands may do.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const native = path.join(root, 'apps/tauri/src-tauri');
const read = file => readFileSync(path.join(root, file), 'utf8');

// Each `#[tauri::command]` function, from its attribute to the `}` that closes it at column 0
// (rustfmt layout, which `cargo fmt` keeps).
const commands = source => [...source.matchAll(
    /#\[tauri::command\]\npub (async )?fn ([a-z_]+)(\([\s\S]*?\))[\s\S]*?\n\}\n/g
)].map(([body, async, name, params]) => ({async: Boolean(async), name, params, body}));

const live = () => ({
    fileio: read('apps/tauri/src-tauri/src/fileio.rs'),
    cargo: read('apps/tauri/src-tauri/Cargo.toml'),
    lock: read('apps/tauri/src-tauri/Cargo.lock'),
    vendored: existsSync(path.join(native, 'vendor/tauri-plugin-dialog')),
    bridge: read('overlay/scratch-gui/src/lib/tauri-bridge.js'),
    menu: read('overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx')
});

const audit = ({fileio, cargo, lock, vendored, bridge, menu}) => {
    const all = commands(fileio);
    const byName = new Map(all.map(command => [command.name, command]));
    for (const name of ['save_project', 'open_project_document', 'open_recent_project',
        'recent_projects', 'pending_project', 'clear_project_document',
        'activate_project_document', 'discard_open_project', 'save_project_document']) {
        assert.ok(byName.has(name), `fileio.rs must define the ${name} command`);
    }

    // A synchronous command runs on the thread that dispatches IPC, and the dialog plugin's
    // blocking calls wait for the event loop that thread runs.
    const dialogs = all.filter(command => command.body.includes('.blocking_'));
    assert.ok(dialogs.length >= 3, 'the Save As, Open and document-save dialogs are found');
    for (const command of dialogs) {
        assert.ok(command.async, `${command.name} opens a dialog, so it must be an async command`);
        assert.match(command.body, /off_ipc_thread\(/,
            `${command.name} must run its dialog on a blocking worker`);
    }

    // The web layer never names a path to write: Save goes to the open document or to a path
    // the user picked in the dialog.
    const save = byName.get('save_project_document');
    assert.doesNotMatch(save.params, /\bpath\b/, 'save_project_document must not accept a path');
    const production = fileio.split('#[cfg(test)]')[0];
    assert.equal([...production.matchAll(/\bwrite_document\(&/g)].length, 1,
        'write_document must have exactly one caller outside the unit tests');
    assert.match(save.body, /write_document\(&path/, 'the one caller is save_project_document');
    assert.match(save.body, /unchanged_on_disk\(&document\.path, &document\.digest\)/,
        'an in-place save must refuse a file changed on disk since it was opened');
    assert.ok(save.body.indexOf('unchanged_on_disk(') < save.body.indexOf('write_document('),
        'the conflict check must come before the write');
    // ...and a path the web layer names is only ever read when it is already a recent project.
    const recent = byName.get('open_recent_project');
    assert.ok(recent.body.indexOf('read_recents(&app)') >= 0 &&
        recent.body.indexOf('read_recents(&app)') < recent.body.indexOf('read_document('),
    'open_recent_project must refuse a path that is not in Recent Projects before reading it');
    const activate = byName.get('activate_project_document');
    assert.doesNotMatch(activate.body, /read_document|write_document|std::fs/,
        'activate_project_document only compares its path with the candidate');

    // Vendoring decision: the published crate. The WIP's local copy patched only Android's
    // picker (persistable write grants) for an in-place Android save this port does not ship.
    assert.doesNotMatch(cargo, /tauri-plugin-dialog\s*=\s*\{[^}]*path\s*=/,
        'tauri-plugin-dialog must come from crates.io, not a local path');
    assert.match(lock,
        /name = "tauri-plugin-dialog"\nversion = "[^"]+"\nsource = "registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index"\nchecksum = "[0-9a-f]{64}"/,
        'the lockfile must pin the published tauri-plugin-dialog by checksum');
    assert.equal(vendored, false, 'no vendored tauri-plugin-dialog tree');

    // Phones keep the web file input and the share sheet; native documents are desktop-only.
    assert.match(bridge, /invoke\('is_mobile'\)\)\.then\(mobile => !mobile/,
        'native documents must be offered only when the app is not mobile');
    assert.match(menu, /this\.state\.nativeDocuments \?\s*\(\) => this\.handleNativeOpen\(\) :\s*this\.props\.onStartSelectingFileUpload/,
        'Load from your computer keeps the web file input outside the desktop app');
    // The menu's own SB3Downloader is unmounted while the menu is closed, so the save
    // shortcut needs its own.
    assert.match(menu, /<SB3Downloader>\{this\.rememberDocumentSaver\}<\/SB3Downloader>/,
        'the save shortcut needs an always-mounted SB3Downloader');
    assert.match(menu, /this\.saveDocument\('save'\)/, 'the save shortcut saves the document');
};

test('native project documents: dialogs off the IPC thread, no web-named write path, published plugin', () => {
    audit(live());
});

test('native project documents audit turns red on each defect it names', () => {
    const base = live();
    audit(structuredClone(base));
    const mutations = [
        input => { input.fileio = input.fileio.replace('pub async fn save_project(', 'pub fn save_project('); },
        input => { input.fileio = input.fileio.replace(
            'pub async fn open_project_document(app: AppHandle) -> Result<Option<LoadPayload>, String> {\n    let picker = app.clone();\n    let picked = off_ipc_thread(move || {',
            'pub async fn open_project_document(app: AppHandle) -> Result<Option<LoadPayload>, String> {\n    let picker = app.clone();\n    let picked = (move || {'); },
        input => { input.fileio = input.fileio.replace(
            'pub async fn save_project_document(\n    app: AppHandle,\n',
            'pub async fn save_project_document(\n    app: AppHandle,\n    path: String,\n'); },
        input => { input.fileio = input.fileio.replace(
            'if !unchanged_on_disk(&document.path, &document.digest) {', 'if false {'); },
        input => { input.fileio = input.fileio.replace(
            'if !read_recents(&app).iter().any(|recent| recent.path == path) {\n        return Err("This project is not in Recent Projects".into());\n    }\n', ''); },
        input => { input.fileio = input.fileio.replace(
            '    *lock(&documents.pending)? = None;\n    remember(&app, &candidate.path);',
            '    *lock(&documents.pending)? = None;\n    write_document(&candidate.path, b"", Path::new("x"))?;'); },
        input => { input.cargo = input.cargo.replace('tauri-plugin-share = { path = "vendor/tauri-plugin-share" }',
            'tauri-plugin-share = { path = "vendor/tauri-plugin-share" }\ntauri-plugin-dialog = { path = "vendor/tauri-plugin-dialog" }'); },
        input => { input.vendored = true; },
        input => { input.bridge = input.bridge.replace(".then(mobile => !mobile", ".then(() => true"); },
        input => { input.menu = input.menu.replace('<SB3Downloader>{this.rememberDocumentSaver}</SB3Downloader>', ''); }
    ];
    for (const mutate of mutations) {
        const input = structuredClone(base);
        const before = JSON.stringify(input);
        mutate(input);
        assert.notEqual(JSON.stringify(input), before, `mutation did not apply: ${mutate}`);
        assert.throws(() => audit(input), `mutation did not turn the gate red: ${mutate}`);
    }
});
