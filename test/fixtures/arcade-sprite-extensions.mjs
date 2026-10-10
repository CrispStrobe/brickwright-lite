// Original authored fixtures, no private corpus source/assets: the darts and
// corgio extensions recorded frame by frame in game.onUpdate. Creation and
// controls start inside the first update, so both runtimes begin at the same
// frame; held buttons are pressed before the program starts.
const record = ({type, setup = '', start, frames, fields, pressed = []}) => ({pressed, source: (original) => `let hero: ${type} = null
let trace = ""
let frame = 0
let traceDone = false
${original ? pressed.map(button => `controller.${button}.setPressed(true)`).join('\n') : ''}
${setup}
game.onUpdate(function () {
    if (frame == 0) {
        ${start.split('\n').join('\n        ')}
    }
    if (frame < ${frames}) {
        trace = trace + ${fields.map(field => field).join(' + "," + ')} + "," + control.eventContext().deltaTime + ";"
        frame += 1
    } else {
        traceDone = true
    }
})`});
const DART = `darts.create(img\`
    . 2 2 .
    2 4 4 2
    2 4 4 2
    . 2 2 .
\`, SpriteKind.Player, 20, 100)`;
const motion = ['hero.x', 'hero.y', 'hero.vx', 'hero.vy'];
export const EXTENSION_TRAJECTORIES = {
    dartThrow: record({type: 'Dart', start: `hero = ${DART}\nhero.angle = 45\nhero.pow = 60\nhero.throwDart()`, frames: 40, fields: motion}),
    dartWindStop: record({type: 'Dart', start: `hero = ${DART}\nhero.wind = -15\nhero.gravity = 35\nhero.throwDart()`, frames: 30,
        fields: [...motion, 'hero.ax', 'hero.ay']}),
    dartArrowKeys: record({type: 'Dart', start: `hero = ${DART}\nhero.angleRate = 2\nhero.controlWithArrowKeys()`, frames: 20,
        fields: ['hero.angle', 'hero.pow'], pressed: ['right', 'up']}),
    corgiRun: record({type: 'Corgio', start: 'hero = corgio.create(SpriteKind.Player, 40, 60)\nhero.horizontalMovement()\nhero.updateSprite()\nhero.cameraFollow()',
        frames: 45, fields: [...motion, 'hero.width', 'hero.height', 'hero.image.getPixel(3, 3)', 'scene.cameraProperty(CameraProperty.X)'], pressed: ['right']}),
    corgiJump: record({type: 'Corgio', start: 'hero = corgio.create(SpriteKind.Player, 80, 100)\nhero.jumpVelocity = 140\nhero.verticalMovement()',
        frames: 60, fields: [...motion, 'hero.ay'], pressed: ['up']}),
};
// Screen captures need a still scene: the original's screen is read a few
// frames after the trace ends.
export const DART_TRACE = record({type: 'Dart', start: `hero = ${DART}\nhero.setTrace()\nhero.traceColor = 8\nhero.angle = 60`, frames: 6, fields: motion});
export const CORGI_BARK = record({type: 'Corgio', start: 'hero = corgio.create(SpriteKind.Player, 50, 60)\nhero.ay = 0\nhero.addToScript("bark")\nhero.bark()', frames: 6, fields: motion});
