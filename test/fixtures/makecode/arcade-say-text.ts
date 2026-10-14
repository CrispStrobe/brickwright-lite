scene.setBackgroundColor(7)
let mySprite = sprites.create(img`
    . . . 5 5 5 5 5 5 5 5 5 5 . . .
    . . . 5 5 5 5 5 5 5 5 5 5 . . .
    . . . 5 5 5 5 5 5 5 5 5 5 . . .
    . . . . 5 5 5 5 5 5 5 5 . . . .
    . . . . 5 5 5 5 5 5 5 5 . . . .
    . . . . 5 5 5 5 5 5 5 5 . . . .
    . . . . . 5 5 5 5 5 5 . . . . .
    . . . . . 5 5 5 5 5 5 . . . . .
    . . . . . 5 5 5 5 5 5 . . . . .
    . . . . . . 5 5 5 5 . . . . . .
    . . . . . . 5 5 5 5 . . . . . .
    . . . . . . 5 5 5 5 . . . . . .
    . . . . . . . 5 5 . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . 5 5 . . . . . . .
    . . . . . . . 5 5 . . . . . . .
`, SpriteKind.Player)
// @highlight
mySprite.setPosition(80, 60)
mySprite.sayText("My name and grade")
pause(1000)
mySprite.sayText("Fact #1")
pause(1000)
mySprite.sayText("Fact #2")
pause(1000)
mySprite.sayText("Fact #3")
pause(1000)
mySprite.sayText("Goodbye!")
