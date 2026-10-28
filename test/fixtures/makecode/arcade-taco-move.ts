let mySprite: Sprite = sprites.create(sprites.food.smallTaco, SpriteKind.Player)
mySprite.setPosition(80, 80)
controller.moveSprite(mySprite, 50, 0)
// @highlight
mySprite.say(":)", 1000)
