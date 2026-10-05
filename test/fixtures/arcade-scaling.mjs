export const SCALING_VALUES_SOURCE=`
let actor=sprites.create(img\`55.\n555\`,SpriteKind.Player)
actor.setPosition(40.25,50.5)
let initialWidth=actor.width
let initialHeight=actor.height
actor.sx=1.501
actor.sy=2.251
let quantizedX=actor.sx
let quantizedY=actor.sy
let scaledWidth=actor.width
let scaledHeight=actor.height
let uniform=actor.scale
let centerX=actor.x
let centerY=actor.y
function sizeOf(sprite:Sprite){return sprite.scale}
let sizes:Sprite[]=[actor]
let typedValue=sizeOf(sizes[0])
let ownerCalls=0
let amountCalls=0
function owner(){ownerCalls+=1;return actor}
function amount(){amountCalls+=1;return .5}
owner().sx+=amount()
actor.sy++
let compoundX=actor.sx
let incrementY=actor.sy
actor.setScale(2,ScaleAnchor.TopLeft)
let anchoredX=actor.x
let anchoredY=actor.y
let left=actor.left
let top=actor.top
actor.changeScale(.5,ScaleAnchor.BottomRight)
let changedX=actor.x
let changedY=actor.y
actor.setScaleCore(undefined,1,ScaleAnchor.Left,true)
let proportionalX=actor.sx
let proportionalY=actor.sy
actor.setScaleCore(null,undefined)
let omittedX=actor.sx
let omittedY=actor.sy
actor.sx=-2
let clampedX=actor.sx
let zeroWidth=actor.width
actor.scale=1.125
let restoredX=actor.sx
let restoredY=actor.sy
let scaleDone=actor.sx===1.125 && actor.sy===1.125 && ownerCalls===1 && amountCalls===1
`;
export const SCALING_VALUE_NAMES=['initialWidth','initialHeight','quantizedX','quantizedY','scaledWidth','scaledHeight','uniform','centerX','centerY','typedValue','ownerCalls','amountCalls','compoundX','incrementY','anchoredX','anchoredY','left','top','changedX','changedY','proportionalX','proportionalY','omittedX','omittedY','clampedX','zeroWidth','restoredX','restoredY','scaleDone'];
