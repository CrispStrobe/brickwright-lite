import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).

test('Arcade splash with a subtitle survives Code and Blocks', async () => {
    const imported = arcadeToPseudocode('game.splash("Ready", "Press A")');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade splash "Ready" subtitle "Press A"/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_splash'));
    assert.match(creator.decompile(), /arcade splash "Ready" subtitle "Press A"/);
});

test('Arcade splash waits for dismissal and queues simultaneous dialogs', async () => {
    const runtime = new EventEmitter();
    runtime.requestRedraw = () => {};
    const Arcade = loadExtensionClass('arcade');
    const extension = new Arcade(runtime);
    const displayed = [];
    runtime.on('ARCADE_DIALOG', dialog => displayed.push(dialog));
    const first = extension.splash({TITLE: 'First', SUBTITLE: ''});
    const second = extension.splash({TITLE: 'Second', SUBTITLE: 'Subtitle'});
    assert.equal(runtime.bwArcadeDialogOpen, true);
    assert.equal(displayed.length, 1);
    assert.equal(displayed[0].title, 'First');
    displayed[0].dismiss();
    await first;
    assert.equal(displayed[1].title, 'Second');
    displayed[1].dismiss();
    await second;
    assert.equal(displayed[2], null);
    assert.equal(runtime.bwArcadeDialogOpen, false);
    const third = extension.splash({TITLE: 'Third', SUBTITLE: ''});
    runtime.emit('ARCADE_BUTTON_DOWN', 'a');
    await third;
    assert.equal(displayed.at(-1), null);
    const fourth = extension.splash({TITLE: 'Fourth', SUBTITLE: ''});
    runtime.emit('PROJECT_START');
    await fourth;
    assert.equal(runtime.bwArcadeDialogOpen, false);
});

test('Arcade long text keeps its layout through Code, Blocks and runtime', async () => {
    const imported = arcadeToPseudocode('game.showLongText("Read this", DialogLayout.Right)');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade long text "Read this" layout "Right"/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_showLongText'));
    assert.match(creator.decompile(), /arcade long text "Read this" layout "Right"/);
    const runtime = new EventEmitter();
    runtime.requestRedraw = () => {};
    const Arcade = loadExtensionClass('arcade');
    const extension = new Arcade(runtime);
    let dialog;
    runtime.on('ARCADE_DIALOG', current => { if (current) dialog = current; });
    const pending = extension.showLongText({TEXT: 'Read this', LAYOUT: 'Right'});
    assert.equal(dialog.layout, 'Right');
    dialog.dismiss();
    await pending;
});
