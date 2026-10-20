// Owned GUI acceptance game (MIT); portable settings helper retains MPL-2.0.
import {STRING_ARRAY_SETTINGS_PATH, STRING_ARRAY_SETTINGS_SOURCE} from '../../overlay/scratch-gui/src/lib/bw-makecode/string-array-settings.generated.js';
export function numericAuthoringFiles({maximum = 10, operation = 'min', message = '猫'} = {}) {
    if (![10, 12].includes(maximum) || !['min', 'max'].includes(operation) || !['猫', 'PLAY'].includes(message)) throw new Error('Unknown owned GUI fixture variant');
    return {
        [STRING_ARRAY_SETTINGS_PATH]: STRING_ARRAY_SETTINGS_SOURCE,
        'main.ts': `scene.setBackgroundColor(15)
let hero = sprites.create(img\`2222\n2772\n2772\n2222\`, SpriteKind.Player)
hero.setPosition(40, 60)
let pressed = 0
let count = 0
while (count < 3) { count += 1 }
let ordered = Math.${operation}(1, 4)
let noise = Math.random()
let range = Math.randomRange(-3, -3)
let never = Math.percentChance(0)
let always = Math.percentChance(100)
bwStringArraySettings.write("bw-owned-numeric-gui", ["Ä", "${message}"])
let saved = bwStringArraySettings.read("bw-owned-numeric-gui")[1]
let result = 0
let heroX = hero.x
info.setScore(count)
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    pressed += 1
    result = Math.clamp(-2, ${maximum}, 99)
    hero.x = 40 + result
    heroX = hero.x
    info.setScore(result)
})
let ready = 1
ready += 0
`,
        'pxt.json': JSON.stringify({name: 'Owned numeric authoring game', dependencies: {device: '*'}, files: [STRING_ARRAY_SETTINGS_PATH, 'main.ts'], preferredEditor: 'tsprj'})
    };
}
export const numericSample = ({pressed = false, maximum = 10, operation = 'min', message = '猫'} = {}) => ({ready: 1, count: 3, ordered: operation === 'min' ? 1 : 4, range: -3, never: false, always: true, saved: message, pressed: pressed ? 1 : 0, result: pressed ? maximum : 0, heroX: pressed ? 40 + maximum : 40});
