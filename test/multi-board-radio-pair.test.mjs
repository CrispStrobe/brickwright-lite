/**
 * Two boards in one project, built per board: the radio pair of the tutorial
 * (a micro:bit remote, a Calliope mini car).
 *
 * One text holds both boards. Each board's view of the project goes through
 * the same exporter and the same pinned MakeCode compiler a one-board project
 * uses — the board layer adds a filter, not a second code path.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {projectToMakeCodeTs, exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {boardMakeCodeProjects} from '../overlay/scratch-gui/src/lib/bw-boards/makecode-boards.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {PXT_GLUE_JS} from '../overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js';
import {readBoards, boardTargets, boardProject, makeCodeTargetOf, BOARDS_MAGIC} from
    '../overlay/scratch-gui/src/lib/bw-boards/model.js';

const COMPILER = path.join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const canCompile = fs.existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;
const skip = canCompile ? false : 'packages/scratch-gui not integrated — run `npm run integrate` first';

// The tutorial's two programs, as MakeCode writes them.
const REMOTE_TS = `radio.setGroup(1)
radio.setTransmitPower(7)
basic.forever(function () {
    if (input.buttonIsPressed(Button.A)) {
        radio.sendNumber(0)
    } else {
        radio.sendNumber(1)
    }
    if (input.buttonIsPressed(Button.B)) {
        radio.sendNumber(2)
    } else {
        radio.sendNumber(3)
    }
})
`;
const CAR_TS = `radio.setGroup(1)
radio.setTransmitPower(7)
radio.onReceivedNumber(function (receivedNumber) {
    if (receivedNumber == 0) {
        motors.dualMotorPower(Motor.A, 50)
    }
    if (receivedNumber == 1) {
        motors.dualMotorPower(Motor.A, 0)
    }
    if (receivedNumber == 2) {
        motors.dualMotorPower(Motor.B, 50)
    }
    if (receivedNumber == 3) {
        motors.dualMotorPower(Motor.B, 0)
    }
})
`;
// One text, two boards: each import's own lines under a board header in place
// of its DEVICE line.
const section = (ts, board, device, name) => {
    const {code, unsupported} = microbitToPseudocode(ts, {board});
    assert.deepEqual(unsupported, [], `${name}: the import refused something`);
    const lines = code.split('\n');
    const at = lines.findIndex(l => /^DEVICE\b/.test(l));
    assert.ok(at >= 0, `${name}: no DEVICE line`);
    lines[at] = `DEVICE ${device} AS ${name}:`;
    return lines.join('\n');
};
const PAIR = `${section(REMOTE_TS, 'microbit', 'MICROBIT', 'Remote')}\n${section(CAR_TS, 'calliopemini', 'CALLIOPEMINI', 'Car')}`;

// The same text as a program file: what scripts/verify-makecode.mjs opens in the
// built app. It is the importer's output, so it is regenerated, never edited:
//   BW_WRITE_FIXTURES=1 node --test test/multi-board-radio-pair.test.mjs
const PAIR_FILE = path.join(REPO, 'test/fixtures/multi-board/radio-pair.bw');
test('the program file the browser gate opens is the imported pair', () => {
    if (process.env.BW_WRITE_FIXTURES) {
        fs.mkdirSync(path.dirname(PAIR_FILE), {recursive: true});
        fs.writeFileSync(PAIR_FILE, PAIR);
    }
    assert.equal(fs.readFileSync(PAIR_FILE, 'utf8'), PAIR);
});

test('the model and the compiler agree on the marker', {skip}, () => {
    assert.equal(BOARDS_MAGIC, SB3Creator.BOARDS_MAGIC);
});

test('a one-board project is its own view', {skip}, () => {
    const project = new SB3Creator().parse('DEVICE MICROBIT\nWHEN flag clicked:\n  radio send number 1\n');
    assert.equal(readBoards(project), null);
    assert.equal(boardProject(project), project);
    assert.equal(boardProject(project, 'Anything'), project);
});

test('each board sees its own targets and block, also after a save has dropped the keys', {skip}, () => {
    const project = new SB3Creator().parse(PAIR);
    const saved = JSON.parse(JSON.stringify(project));
    delete saved.boards;
    delete saved.stc;
    for (const p of [project, saved]) {
        const boards = readBoards(p);
        assert.deepEqual(boards.map(b => [b.name, b.stc.device]), [['Remote', 'microbit'], ['Car', 'calliopemini']]);
        assert.deepEqual(boardTargets(p, boards, 'Remote').map(t => t.name), ['Stage']);
        assert.deepEqual(boardTargets(p, boards, 'Car').map(t => t.name), ['Car']);
        assert.deepEqual(boardTargets(p, boards, 'Nobody'), []);
        assert.equal(boardProject(p, 'Car').stc.device, 'calliopemini');
        assert.equal(boardProject(p).stc.device, 'microbit', 'the first board is the default view');
        assert.equal(boardProject(p, 'Nobody'), null);
    }
    // A sprite added in the editor, listed by no board, is the first board's.
    saved.targets.push({isStage: false, name: 'Stray', blocks: {}, variables: {}});
    assert.deepEqual(boardTargets(saved, readBoards(saved), 'Remote').map(t => t.name), ['Stage', 'Stray']);
    assert.deepEqual(boardTargets(saved, readBoards(saved), 'Car').map(t => t.name), ['Car']);
});

test('each board exports its own MakeCode program and nothing of the other', {skip}, () => {
    const project = new SB3Creator().parse(PAIR);
    const remote = projectToMakeCodeTs(boardProject(project, 'Remote'));
    const car = projectToMakeCodeTs(boardProject(project, 'Car'));
    assert.deepEqual([...remote.unsupported, ...car.unsupported], []);
    assert.match(remote.ts, /radio\.sendNumber\(0\)/);
    assert.doesNotMatch(remote.ts, /motors\.|onReceivedNumber/);
    assert.match(car.ts, /radio\.onReceivedNumber\(function \(receivedNumber\)/);
    assert.match(car.ts, /motors\.dualMotorPower\(Motor\.A, 50\)/);
    assert.doesNotMatch(car.ts, /sendNumber|buttonIsPressed/);
    assert.equal(makeCodeTargetOf(boardProject(project, 'Remote').stc.device), 'microbit');
    assert.equal(makeCodeTargetOf(boardProject(project, 'Car').stc.device), 'calliopemini');
    assert.equal(makeCodeTargetOf('arduino-uno'), null);
});

test('the pair becomes two MakeCode projects, and a board MakeCode cannot build is named', {skip}, () => {
    const one = new SB3Creator().parse('DEVICE MICROBIT\nWHEN flag clicked:\n  radio send number 1\n');
    assert.equal(boardMakeCodeProjects(one, {exportToMakeCode}), null);
    const built = boardMakeCodeProjects(new SB3Creator().parse(PAIR), {exportToMakeCode, name: 'pair'});
    assert.deepEqual(built.map(b => [b.name, b.device, b.target]),
        [['Remote', 'microbit', 'microbit'], ['Car', 'calliopemini', 'calliopemini']]);
    assert.match(built[0].files['main.ts'], /radio\.sendNumber\(0\)/);
    assert.match(built[1].files['main.ts'], /motors\.dualMotorPower\(Motor\.B, 50\)/);
    assert.deepEqual(JSON.parse(built[1].files['pxt.json']).dependencies, {core: '*', radio: '*'});
    const mixed = new SB3Creator().parse(`${PAIR}\nDEVICE ARDUINO-UNO AS Logger:\nWHEN flag clicked:\n  set n to 1\n`);
    assert.throws(() => boardMakeCodeProjects(mixed, {exportToMakeCode}),
        e => e.code === 'NOT_MAKECODE_BOARD' && e.board === 'Logger' && e.device === 'arduino-uno');
});

const STATIC = path.join(REPO, 'packages/scratch-gui/static/makecode');
const synced = ['microbit', 'calliopemini'].every(t => fs.existsSync(path.join(STATIC, t, 'pxtworker.js')));
const pxtFor = target => {
    const dir = path.join(STATIC, target);
    const quiet = () => {};
    const sb = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))};
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    return sb;
};

test('MakeCode\'s compiler builds each board for its own target, offline', {skip: skip ||
    (synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent')}, async () => {
    const project = new SB3Creator().parse(PAIR);
    for (const board of readBoards(project)) {
        const view = boardProject(project, board.name);
        const target = makeCodeTargetOf(view.stc.device);
        const {ts} = projectToMakeCodeTs(view);
        const pxtJson = {name: board.name, dependencies: {core: '*', radio: '*'}, files: ['main.ts']};
        if (target === 'microbit') pxtJson.targetVersions = {target: '9.1.1'};
        const files = {'pxt.json': JSON.stringify(pxtJson), 'main.ts': ts};
        for (const native of [false, true]) {
            const r = JSON.parse(JSON.stringify(await pxtFor(target).bwMakeCode.compile(files, {native,
                getBaseHex: async sha => {
                    const p = path.join(STATIC, target, 'hexcache', `${sha}.hex`);
                    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
                }})));
            assert.equal(r.success, true, `${board.name} (${target}, native ${native}): ` +
                JSON.stringify((r.diagnostics || []).slice(0, 3)));
            assert.deepEqual(r.netAttempts, [], `${board.name}: the compile reached for the network`);
            // The per-board firmware download saves exactly this file.
            if (native) assert.match(r.outfiles['binary.hex'] || '', /^:[0-9A-F]+\r?\n/, `${board.name}: no binary.hex`);
        }
    }
});

test('a multi-board program is saved per board, never as one mixed program', () => {
    const src = fs.readFileSync(path.join(REPO,
        'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    const body = name => {
        const at = src.indexOf(`    async ${name} () {`);
        assert.notEqual(at, -1, name);
        return src.slice(at, src.indexOf('\n    }\n', at));
    };
    // Each single-program action hands a program with board sections to its
    // per-board twin BEFORE it would build the whole project as one program.
    for (const [action, twin, single] of [
        ['runInMakeCode', 'runBoardsInMakeCode', 'this.makeCodeSubject()'],
        ['downloadMakeCodeFirmware', 'downloadBoardsFirmware', 'this.makeCodeSubject()'],
        ['exportMakeCode', 'exportBoardsMakeCode', 'creator.parse(source)']
    ]) {
        const text = body(action);
        const handOff = text.search(new RegExp(`if \\(this\\.hasBoards\\(\\w+\\)\\) \\{ await this\\.${twin}\\(\\w+\\); return; \\}`));
        assert.notEqual(handOff, -1, `${action} does not hand off to ${twin}`);
        assert.ok(handOff < text.indexOf(single), `${action} builds one program before checking for boards`);
    }
    // All boards are built before the first file is saved.
    const dl = src.slice(src.indexOf('    async downloadBoardsFirmware (source) {'));
    assert.ok(dl.indexOf('built.push(') < dl.indexOf('await downloadBlob('));
});
