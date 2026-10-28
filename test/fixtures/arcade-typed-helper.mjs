export const TYPED_HELPER_SOURCE = `namespace Helper {
export function create(pictures:Image[], index:number):Sprite {return sprites.create(pictures[index],SpriteKind.Player)}
export function unused(pictures:Image[]):Sprite {return sprites.create(pictures[0],SpriteKind.Enemy)}
export function move(actors:Array<Sprite>){actors[0].x+=10}
}
let points=[40,120,40,120]
let alias=points
let observed=0
for(let value of points){observed+=value}
let removed=alias.shift()
let remaining=points.length
observed+=removed+remaining
let controllerValue=0
let actorX=0
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
 controllerValue=alias.shift()
 remaining=points.length
 let pictures=[img\`7\`]
 let actor=Helper.create(pictures,0)
 Helper.move([actor])
 actorX=actor.x
})`;
