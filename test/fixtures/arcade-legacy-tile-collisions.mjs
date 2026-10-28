export const LEGACY_TILE_COLLISIONS_SOURCE=`
let mapImage=img\`
0 0 2 0
0 0 2 0
0 0 2 0
0 0 2 0
\`
scene.setTileMap(mapImage,TileScale.Eight)
scene.setTile(2,img\`2\`,true)
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(12,12)
let order=""
let count=0
let hitBefore=hero.tileHitFrom(CollisionDirection.Right)
let nullHit=scene.tileHitFrom(null,CollisionDirection.Right)
let hitDuring=-9
let hitAfterEdit=-9
let sawVelocity=false
let returned=false
function install(weight:number){
 let captured=weight
 scene.onHitTile(SpriteKind.Player,2,function(sprite:Sprite){
  order+="A"
  count+=captured
  captured+=1
  hitDuring=scene.tileHitFrom(sprite,CollisionDirection.Right)
  mapImage.setPixel(2,1,3)
  hitAfterEdit=sprite.tileHitFrom(CollisionDirection.Right)
  sprite.vx=0
  pause(20)
 })
 captured+=10
}
install(2)
scene.onHitTile(SpriteKind.Player,2,function(sprite:Sprite){order+="B";sawVelocity=sprite.vx===0})
scene.onHitTile(SpriteKind.Food,2,function(sprite:Sprite){order+="wrongKind"})
scene.onHitTile(SpriteKind.Player,1,function(sprite:Sprite){order+="wrongIndex"})
scene.onHitTile(SpriteKind.Player,16,function(sprite:Sprite){order+="invalid"})
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){order+="C";sprite.vx=0})
hero.vx=50
hero.x=16
returned=order==="ABC"&&sawVelocity
let finalX=hero.x
let hitAfter=hero.tileHitFrom(CollisionDirection.Right)
hero.setPosition(12,12)
let parentSceneHits=0
scene.onHitTile(SpriteKind.Player,2,function(sprite:Sprite){parentSceneHits+=1})
game.pushScene()
scene.setTileMap(img\`0 0 2 0
0 0 2 0\`,TileScale.Eight)
scene.setTile(2,img\`2\`,true)
let child=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
child.setPosition(12,4)
let childHits=0
scene.onHitTile(SpriteKind.Player,2,function(sprite:Sprite){childHits+=1})
child.x=16
let childIndex=scene.tileHitFrom(child,CollisionDirection.Right)
game.popScene()
let filterOrder=""
scene.onHitTile(SpriteKind.Enemy,2,function(sprite:Sprite){
 filterOrder+="A"
 sprite.setKind(SpriteKind.Food)
 scene.onHitTile(SpriteKind.Enemy,2,function(sprite:Sprite){filterOrder+="L"})
})
scene.onHitTile(SpriteKind.Enemy,2,function(sprite:Sprite){filterOrder+="B"})
scene.onHitWall(SpriteKind.Food,function(sprite:Sprite,location:tiles.Location){filterOrder+="F"})
let changed=sprites.create(img\`5 5
5 5\`,SpriteKind.Enemy)
changed.setPosition(12,4)
changed.x=16
let firstFilter=filterOrder
changed.setKind(SpriteKind.Enemy)
changed.setPosition(12,4)
changed.x=16
let secondFilter=filterOrder
let parentBeforeController=parentSceneHits
mapImage.setPixel(2,1,2)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hero.x=16})
let legacyTileCollisionsDone=true
`;
