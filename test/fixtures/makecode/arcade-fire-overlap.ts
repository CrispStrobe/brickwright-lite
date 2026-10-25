namespace SpriteKind {
    export const Fireball = SpriteKind.create();
    export const Fire = SpriteKind.create();
    export const FireSource = SpriteKind.create();
}
let fireSource: Sprite = null
let mySprite: Sprite = null
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    info.stopCountdown()
})
sprites.onOverlap(SpriteKind.Player, SpriteKind.FireSource, function (sprite, otherSprite) {
    info.changeLifeBy(5)
    otherSprite.destroy()
})
sprites.onCreated(SpriteKind.FireSource, function (sprite) {
    sprite.setPosition(randint(0, scene.screenWidth()), randint(0, scene.screenHeight()))
})
mySprite = sprites.create(img`
. . . . . . . f f f . . . . . .
. . . . . . f 4 4 4 f . . . . .
. . . . . f 4 4 4 4 4 f . . . .
. . . . f 4 4 2 2 4 4 4 f . . .
. . . . f 4 4 2 2 2 4 4 4 f . .
. . . f 4 4 2 2 2 2 2 4 4 f . .
. . . f 4 4 2 2 2 2 2 2 4 4 f .
. . . f 4 4 2 2 2 5 5 2 4 4 f .
. . f 4 4 4 2 2 2 5 5 5 4 4 4 f
. f 4 4 4 2 2 2 5 5 5 5 4 4 4 f
f 4 4 2 2 2 2 5 5 5 5 5 5 4 4 f
f 4 4 2 2 2 2 5 5 5 5 5 5 4 4 f
. f 4 4 4 2 2 5 5 5 5 5 5 4 f .
. . f 4 4 4 4 4 4 4 4 4 4 4 f .
. . . f 4 4 4 4 4 4 4 4 f f . .
. . . . f f f f f f f f . . . .
`, SpriteKind.Player)
controller.moveSprite(mySprite, 50, 50)
mySprite.setStayInScreen(true)
info.setLife(15)
info.startCountdown(3)
game.onUpdateInterval(500, function () {
    fireSource = sprites.create(img`
. . . . . . . . . . . . . . . .
. . 2 2 2 2 2 2 . . 5 . . . . .
. . 2 . . . . 2 2 5 . . . . . .
. . 2 . . . . 2 2 2 . . . . . .
. . 2 2 2 2 2 2 2 2 . . . . . .
. . 2 f 2 2 2 2 f 2 . . . . . .
. . 2 2 f 2 2 f 2 2 . . . . . .
. . 2 2 2 f f 2 2 2 . . . . . .
. . 2 2 2 f f 2 2 2 . . . . . .
. . 2 2 2 f f 2 2 2 . . . . . .
. . 2 2 2 f f 2 2 2 . . . . . .
. . 2 2 f 2 2 f 2 2 . . . . . .
. . 2 f 2 2 2 2 f 2 . . . . . .
. . 2 2 2 2 2 2 2 2 . . . . . .
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
`, SpriteKind.FireSource)
})
