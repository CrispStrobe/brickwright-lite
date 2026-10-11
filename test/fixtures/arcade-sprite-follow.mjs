export const SPRITE_FOLLOW_SOURCE=`let hero=sprites.create(img\`1 1
1 1\`,SpriteKind.Player)
let enemy=sprites.create(img\`2 2
2 2\`,SpriteKind.Enemy)
hero.setPosition(120,90)
enemy.setPosition(40,30)
enemy.follow(hero,25)
let stopped=false
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hero.setPosition(120,30)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){enemy.unfollow();stopped=true})
let followReady=true`;
