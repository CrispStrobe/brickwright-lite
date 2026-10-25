// Original authored fixture, no private corpus source/assets.
export const TERRAIN_MAP = 'tiles.setTilemap(tiles.createTilemap(hex`080004000000000001000000000000000100000000000000010000000000000001000000`,img`0 0 0 0 2 0 0 0\n0 0 0 0 2 0 0 0\n0 0 0 0 2 0 0 0\n0 0 0 0 2 0 0 0`,[img`0`,img`2`],TileScale.Eight))';
export const TERRAIN_CONTACT_SOURCE = `${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(20,12)
let before=hero.isHittingTile(CollisionDirection.Right)
hero.vx=60
while(!hero.isHittingTile(CollisionDirection.Right)){pause(10)}
let blockedX=hero.x
let blockedVx=hero.vx
let contactRight=hero.isHittingTile(CollisionDirection.Right)
let contactLeft=hero.isHittingTile(CollisionDirection.Left)
let contactTop=hero.isHittingTile(CollisionDirection.Top)
let contactBottom=hero.isHittingTile(CollisionDirection.Bottom)
function touching(sprite:Sprite,direction:number){return sprite.isHittingTile(direction)}
let throughProcedure=touching(hero,CollisionDirection.Right)
let terrainDone=hero.x===31`;
export const TERRAIN_CONTROLLER_SOURCE = `${TERRAIN_MAP}
let art=image.create(2,2)
art.fill(5)
let hero=sprites.create(art,SpriteKind.Player)
hero.setPosition(20,12)
let touching=false
game.onUpdate(function(){touching=hero.isHittingTile(CollisionDirection.Right)})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){hero.vx=60})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hero.setFlag(SpriteFlag.GhostThroughWalls,true);hero.vx=60})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){hero.vx=0;hero.setFlag(SpriteFlag.GhostThroughWalls,false);hero.setPosition(20,12)})`;
