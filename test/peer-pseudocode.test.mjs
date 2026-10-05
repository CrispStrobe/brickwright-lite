import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';

const source = readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/peers/index.js',
    import.meta.url), 'utf8');
const extensionModule = {exports: {}};
new Function('require', 'module', 'exports', source)(id => {
    if (id.endsWith('/block-type')) return {COMMAND: 'command', BOOLEAN: 'boolean', REPORTER: 'reporter'};
    if (id.endsWith('/argument-type')) return {STRING: 'string', NUMBER: 'number'};
    throw new Error(`Unexpected peer extension import: ${id}`);
}, extensionModule, extensionModule.exports);
const PeerSessions = extensionModule.exports;

const program = `WHEN flag clicked:
  select peer "Phone"
  IF peer selected? THEN:
    take photo on peer
    set width to peer photo width
    set light to peer photo brightness at 100, 50
    set color to peer photo color at 100, 50
    set picture to last peer photo
    send project to peer
    send code to peer
    get project from peer
    get code from peer
    run peer project
    stop peer project
    set peer variable "speed" to 50
    broadcast "drive" on peer
    set measured to peer variable "speed"
    move peer sprite "Sprite1" to x 40 y -20
    point peer sprite "Sprite1" in direction 90
    set peer sprite "Sprite1" size to 120%
    show peer sprite "Sprite1"
    hide peer sprite "Sprite1"
    set position to peer sprite "Sprite1" x
    set height to peer sprite "Sprite1" y`;

test('peer pseudocode compiles to the built-in blocks and decompiles without losing actions', () => {
    const first = new Creator();
    first.parse(program);
    const opcodes = project => project.targets.flatMap(target =>
        Object.values(target.blocks).map(block => block.opcode).filter(op => op.startsWith('peersessions_'))).sort();
    const expected = [
        'connected', 'selectPeer', 'takePhoto', 'photoWidth', 'photoBrightness',
        'photoColor', 'lastPhoto', 'sendProject', 'sendCode', 'requestProject',
        'requestCode', 'run', 'stop', 'setVariable', 'broadcast', 'getVariable',
        'moveSprite', 'pointSprite', 'sizeSprite', 'showSprite', 'hideSprite', 'spriteX', 'spriteY'
    ].map(op => `peersessions_${op}`).sort();
    assert.deepEqual(opcodes(first.project), expected);
    assert.ok(first.project.extensions.includes('peersessions'));

    const text = new Creator().decompile(first.project);
    assert.match(text, /peer photo brightness at 100, 50/);
    assert.match(text, /IF peer selected\? THEN:/);
    assert.match(text, /broadcast "drive" on peer/);
    const second = new Creator();
    second.parse(text);
    assert.deepEqual(opcodes(second.project), expected);
});

test('peer block selection uses a paired name without putting the secret in a project', () => {
    const calls = [];
    const oldWindow = globalThis.window;
    globalThis.window = {__brickwrightPeers: {
        selected: () => 'Phone',
        select: name => calls.push(['select', name]),
        pixelColor: (x, y) => `#${x}${y}`,
        pixelBrightness: (x, y) => x + y
    }};
    try {
        const extension = new PeerSessions();
        extension.selectPeer({NAME: 'Phone'});
        assert.deepEqual(calls, [['select', 'Phone']]);
        assert.equal(extension.connected(), true);
        assert.equal(extension.photoColor({X: 2, Y: 3}), '#23');
        assert.equal(extension.photoBrightness({X: 2, Y: 3}), 5);
    } finally {
        globalThis.window = oldWindow;
    }
});

test('peer control blocks send variable, broadcast, and sprite actions to the paired session', async () => {
    const calls = [];
    const oldWindow = globalThis.window;
    globalThis.window = {__brickwrightPeers: {
        broadcast: message => calls.push(['broadcast', message]),
        setVariable: (name, value) => calls.push(['setVariable', name, value]),
        getVariable: async name => name === 'speed' ? 55 : 0,
        moveSprite: (name, x, y) => calls.push(['moveSprite', name, x, y]),
        pointSprite: (name, direction) => calls.push(['pointSprite', name, direction]),
        sizeSprite: (name, size) => calls.push(['sizeSprite', name, size]),
        showSprite: (name, visible) => calls.push(['showSprite', name, visible]),
        getSprite: async () => ({x: 12, y: -8})
    }};
    try {
        const extension = new PeerSessions();
        await extension.setVariable({NAME: 'speed', VALUE: 55});
        await extension.broadcast({MESSAGE: 'drive'});
        await extension.moveSprite({SPRITE: 'Robot', X: 12, Y: -8});
        await extension.pointSprite({SPRITE: 'Robot', DIRECTION: 45});
        await extension.sizeSprite({SPRITE: 'Robot', SIZE: 120});
        await extension.hideSprite({SPRITE: 'Robot'});
        assert.equal(await extension.getVariable({NAME: 'speed'}), 55);
        assert.equal(await extension.spriteX({SPRITE: 'Robot'}), 12);
        assert.equal(await extension.spriteY({SPRITE: 'Robot'}), -8);
        assert.deepEqual(calls, [
            ['setVariable', 'speed', 55], ['broadcast', 'drive'],
            ['moveSprite', 'Robot', 12, -8], ['pointSprite', 'Robot', 45],
            ['sizeSprite', 'Robot', 120], ['showSprite', 'Robot', false]
        ]);
    } finally {
        globalThis.window = oldWindow;
    }
});

test('named peer commands round-trip and route concurrently without changing selection', async () => {
    const namedProgram = `WHEN flag clicked:
  IF peer "Phone" paired? THEN:
    take photo on peer "Phone"
    set w to photo width from peer "Phone"
    set h to photo height from peer "Phone"
    set c to photo color from peer "Phone" at 3, 4
    set b to photo brightness from peer "Phone" at 3, 4
    set p to last photo from peer "Phone"
    send project to peer "Phone"
    send code to peer "Phone"
    get project from peer "Phone"
    get code from peer "Phone"
    run project on peer "Robot"
    set variable "speed" to 50 on peer "Robot"
    broadcast "drive" on peer "Robot"
    set speed to variable "speed" on peer "Robot"
    move sprite "Bot" on peer "Robot" to x 12 y -8
    point sprite "Bot" on peer "Robot" in direction 45
    set sprite "Bot" on peer "Robot" size to 120%
    show sprite "Bot" on peer "Robot"
    hide sprite "Bot" on peer "Robot"
    set x to sprite "Bot" x on peer "Robot"
    set y to sprite "Bot" y on peer "Robot"
    stop project on peer "Robot"`;
    const opcodes = project => project.targets.flatMap(target =>
        Object.values(target.blocks).map(block => block.opcode)
            .filter(opcode => opcode.startsWith('peersessions_'))).sort();
    const first = new Creator();
    first.parse(namedProgram);
    const expected = ['hasPeer', 'takePhotoFrom', 'photoWidthFrom', 'photoHeightFrom',
        'photoColorFrom', 'photoBrightnessFrom', 'lastPhotoFrom', 'sendProjectTo',
        'sendCodeTo', 'requestProjectFrom', 'requestCodeFrom', 'runOn', 'setVariableOn',
        'broadcastOn', 'getVariableFrom', 'moveSpriteOn', 'pointSpriteOn', 'sizeSpriteOn',
        'showSpriteOn', 'hideSpriteOn', 'spriteXFrom', 'spriteYFrom', 'stopOn']
        .map(opcode => `peersessions_${opcode}`).sort();
    assert.deepEqual(opcodes(first.project), expected);
    const text = new Creator().decompile(first.project);
    const second = new Creator();
    second.parse(text);
    assert.deepEqual(opcodes(second.project), expected);

    const calls = [];
    const oldWindow = globalThis.window;
    globalThis.window = {__brickwrightPeers: {
        selected: () => 'Phone',
        has: name => name === 'Robot',
        broadcast: async (message, name) => calls.push(['broadcast', message, name]),
        moveSprite: async (sprite, x, y, name) => calls.push(['move', sprite, x, y, name]),
        getVariable: async (variable, name) => `${variable}:${name}`
    }};
    try {
        const extension = new PeerSessions();
        assert.equal(extension.hasPeer({PEER: 'Robot'}), true);
        await Promise.all([
            extension.broadcastOn({MESSAGE: 'drive', PEER: 'Robot'}),
            extension.moveSpriteOn({SPRITE: 'Bot', X: 12, Y: -8, PEER: 'Phone'})
        ]);
        assert.equal(await extension.getVariableFrom({NAME: 'speed', PEER: 'Robot'}), 'speed:Robot');
        assert.deepEqual(calls, [
            ['broadcast', 'drive', 'Robot'], ['move', 'Bot', 12, -8, 'Phone']
        ]);
        assert.equal(extension.peerName(), 'Phone');
    } finally {
        globalThis.window = oldWindow;
    }
});

test('every named peer block has a peer input and an implementation', () => {
    const extension = new PeerSessions();
    const blocks = extension.getInfo().blocks;
    const named = blocks.filter(block => block.opcode === 'hasPeer' ||
        /(?:From|To|On)$/.test(block.opcode));
    assert.equal(named.length, 23);
    assert.equal(new Set(named.map(block => block.opcode)).size, named.length);
    for (const block of named) {
        assert.ok(block.arguments.PEER, `${block.opcode} has a peer input`);
        assert.equal(typeof extension[block.opcode], 'function');
    }
});
