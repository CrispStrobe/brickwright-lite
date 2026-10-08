export const DESTROY_KIND_CONTROLLER_SOURCE = `let destroyed=0
sprites.onDestroyed(SpriteKind.Enemy,function(sprite){destroyed+=1})
let player=sprites.create(img\`5 5 5\n5 5 5\`,SpriteKind.Player)
player.setPosition(20,20)
function addEnemy(){
    let enemy=sprites.create(img\`2 2 2\n2 2 2\`,SpriteKind.Enemy)
    enemy.setPosition(80,60)
}
addEnemy()
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){addEnemy()})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    sprites.destroyAllSpritesOfKind(SpriteKind.Enemy)
})`;
