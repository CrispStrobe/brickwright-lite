export const TRUNCATE_NUMBER_SOURCE = `let hero=sprites.create(img\`11\n11\`,SpriteKind.Player)
hero.setPosition(35.75,40.5)
let calls=0
function next(){calls+=1;return -3.75}
let sample=Math.trunc(next())
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
hero.x=Math.trunc(hero.x)
hero.y=Math.trunc(hero.y)
sample=Math.trunc(next())
})`;
