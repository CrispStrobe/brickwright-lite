// Authored fixtures; no private corpus source or assets.
export function cameraMap(columns=64,rows=48){
    const bytes=[columns&255,columns>>8,rows&255,rows>>8,...Array(columns*rows).fill(0)];
    if(columns>25 && rows>12)bytes[4+12*columns+25]=1;
    const hex=bytes.map(n=>n.toString(16).padStart(2,'0')).join('');
    const walls=Array.from({length:rows},()=>Array(columns).fill('0').join(' ')).join('\n');
    const red=Array.from({length:8},()=>Array(8).fill('2').join(' ')).join('\n');
    return `tiles.setTilemap(tiles.createTilemap(hex\`${hex}\`,img\`${walls}\`,[img\`0\`,img\`${red}\`],TileScale.Eight))`;
}
export const CAMERA_SOURCE=`${cameraMap()}
let art=image.create(4,8)
art.fill(5)
let hero=sprites.create(art,SpriteKind.Player)
hero.setPosition(200,100)
let hudArt=image.create(2,2)
hudArt.fill(9)
let hud=sprites.create(hudArt,SpriteKind.Food)
hud.setFlag(SpriteFlag.RelativeToCamera,true)
hud.setPosition(10,10)
function cameraValue(property:number){return scene.cameraProperty(property)}
scene.cameraFollowSprite(hero)
let followX=cameraValue(CameraProperty.X)
let followY=cameraValue(CameraProperty.Y)
let followLeft=scene.cameraProperty(CameraProperty.Left)
let followRight=scene.cameraProperty(CameraProperty.Right)
let followTop=scene.cameraProperty(CameraProperty.Top)
let followBottom=scene.cameraProperty(CameraProperty.Bottom)
hero.setPosition(220.75,110.25)
let movedX=scene.cameraProperty(CameraProperty.X)
let movedY=scene.cameraProperty(CameraProperty.Y)
scene.cameraFollowSprite(null)
hero.setPosition(230,120)
let detachedX=scene.cameraProperty(CameraProperty.X)
let detachedY=scene.cameraProperty(CameraProperty.Y)
scene.centerCameraAt(173.75,91.25)
let centeredX=scene.cameraProperty(CameraProperty.X)
let centeredY=scene.cameraProperty(CameraProperty.Y)
hero.setPosition(250,150)
let stillCentered=scene.cameraProperty(CameraProperty.X)
scene.centerCameraAt(1000,-100)
let clampLeft=scene.cameraProperty(CameraProperty.Left)
let clampTop=scene.cameraProperty(CameraProperty.Top)
let clampRight=scene.cameraProperty(CameraProperty.Right)
let unknown=scene.cameraProperty(99)
let unknownIsUndefined=unknown===undefined
${cameraMap(8,4)}
scene.centerCameraAt(1000,1000)
let smallX=scene.cameraProperty(CameraProperty.X)
let smallY=scene.cameraProperty(CameraProperty.Y)
tiles.setTilemap(null)
scene.centerCameraAt(-10.25,30.75)
let freeX=scene.cameraProperty(CameraProperty.X)
let freeY=scene.cameraProperty(CameraProperty.Y)
let retainedHeroX=hero.x
let retainedHeroY=hero.y
let retainedHudX=hud.x
let retainedHudY=hud.y
let cameraDone=followX===200`;
export const CAMERA_CONTROLLER_SOURCE=`${cameraMap()}
let art=image.create(4,8)
art.fill(5)
let hero=sprites.create(art,SpriteKind.Player)
hero.setPosition(200,100)
let hudArt=image.create(2,2)
hudArt.fill(9)
let hud=sprites.create(hudArt,SpriteKind.Food)
hud.setFlag(SpriteFlag.RelativeToCamera,true)
hud.setPosition(10,10)
scene.cameraFollowSprite(hero)
let cameraX=scene.cameraProperty(CameraProperty.X)
let cameraY=scene.cameraProperty(CameraProperty.Y)
game.onUpdate(function(){cameraX=scene.cameraProperty(CameraProperty.X);cameraY=scene.cameraProperty(CameraProperty.Y)})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){hero.x+=40})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){scene.centerCameraAt(180,100)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){hero.setPosition(200,100);scene.cameraFollowSprite(hero)})`;
