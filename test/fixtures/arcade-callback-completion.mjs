export const CALLBACK_COMPLETION_SOURCE=`scene.setTileMap(img\`0 0 2 0\n0 0 2 0\`,TileScale.Eight)
scene.setTile(2,img\`2\`,true)
let s=sprites.create(img\`5 5\n5 5\`,SpriteKind.Player)
s.setPosition(12,4)
let before=0
let after=0
let inB=0
let inC=0
scene.onHitTile(SpriteKind.Player,2,function(a:Sprite){before=a.x;a.vx=-40;pause(70);after=a.x})
scene.onHitTile(SpriteKind.Player,2,function(a:Sprite){inB=a.x})
scene.onHitWall(SpriteKind.Player,function(a:Sprite,l:tiles.Location){inC=a.x;a.vx=0})
s.vx=50
s.x=16
let finalX=s.x
let completed=1
let done=true
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){s.setPosition(12,4);s.vx=50;s.x=16;finalX=s.x;completed+=1})`;
