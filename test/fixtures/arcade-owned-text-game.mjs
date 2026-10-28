// Owned acceptance game and pixel art, authored for this repository (MIT).
// The separately retained TextSprite dependency keeps its original MIT notice.
import {encodeTileImage} from '../../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {TEXT_SPRITE_SOURCE_TEXT} from '../../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
export const GAME_NAME = 'Owned Arcade label game';
export const HERO_IMAGE = Object.freeze({width: 4, height: 4, pixels: Object.freeze([
    2, 2, 2, 2,
    2, 7, 7, 2,
    2, 7, 7, 2,
    2, 2, 2, 2
])});
export function ownedGameFiles ({message = 'READY', edited = false} = {}) {
    if (!/^[A-Z]+$/.test(message)) throw new Error('Acceptance fixture message must be uppercase ASCII');
    const pixels = [...HERO_IMAGE.pixels];
    if (edited) pixels[5] = 3;
    const main = `scene.setBackgroundColor(15)
let hero = sprites.create(assets.image\`hero\`, SpriteKind.Player)
hero.setPosition(40, 60)
let label = textsprite.create("${message}", 0, 1)
label.setPosition(80, 20)
let pressed = 0
let labelText = ""
let heroX = 0
let heroPixel = 0
let ready = 0
function sample() {
    labelText = label.text
    heroX = hero.x
    heroPixel = hero.image.getPixel(1, 1)
}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    pressed += 1
    label.setText("GO" + pressed)
    hero.x += 8
    sample()
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    pressed = 0
    label.setText("RESET")
    hero.setPosition(40, 60)
    sample()
})
sample()
ready = 1
`;
    return {'main.ts': main,
        'images.g.jres': JSON.stringify({'*': {namespace: 'myImages'}, hero: {
            data: encodeTileImage({...HERO_IMAGE, pixels}), dataEncoding: 'base64',
            mimeType: 'image/x-mkcd-f4', displayName: 'hero'
        }}),
        'pxt.json': JSON.stringify({name: GAME_NAME, dependencies: {device: '*',
            'arcade-text': 'github:microsoft/arcade-text#fa2439314c6633943666a763fdae32a5c67a9ae8'},
            files: ['images.g.jres', 'main.ts'], preferredEditor: 'tsprj'})};
}
export const INITIAL_SAMPLE = Object.freeze({pressed: 0, labelText: 'READY', heroX: 40, heroPixel: 7, ready: 1});
export const EDITED_INITIAL_SAMPLE = Object.freeze({...INITIAL_SAMPLE, labelText: 'START', heroPixel: 3});
export const PRESSED_SAMPLE = Object.freeze({...INITIAL_SAMPLE, pressed: 1, labelText: 'GO1', heroX: 48});
export const RESET_SAMPLE = Object.freeze({...INITIAL_SAMPLE, labelText: 'RESET'});

// Offline original comparison supplies the exact retained dependency bytes to
// the unchanged original compiler. This avoids a network fetch during the gate;
// the GUI imports and exports the ordinary pinned-dependency project above.
export function withRetainedTextSprite (files) {
    const manifest = JSON.parse(files['pxt.json']);
    if (manifest.dependencies?.['arcade-text'] !==
        'github:microsoft/arcade-text#fa2439314c6633943666a763fdae32a5c67a9ae8') {
        throw new Error('Owned game must use the reviewed original TextSprite dependency');
    }
    delete manifest.dependencies['arcade-text'];
    manifest.files = ['text.ts', ...manifest.files.filter(name => name !== 'text.ts')];
    return {...files, 'text.ts': TEXT_SPRITE_SOURCE_TEXT, 'pxt.json': JSON.stringify(manifest)};
}
