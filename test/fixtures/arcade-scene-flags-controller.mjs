// Owned programs, images and text. Flags refer to the selected SDK's actual
// Scene and BaseSprite contracts, not an alternate rendering implementation.
export const flagsSource=`let parent=game.currentScene()
let initial=parent.flags
let a=sprites.create(img\`2\`,SpriteKind.Player)
let afterCreate=parent.flags
parent.flags=0
a.z=0
let unchanged=parent.flags
a.z=3
let changed=parent.flags
parent.flags=0
game.pushScene()
let child=game.currentScene()
let childInitial=child.flags
a.z=4
let parentAfterOther=parent.flags
let childAfterOther=child.flags
child.flags=2.5
let raw=child.flags
child.flags|=scene.Flag.SeeThrough
let merged=child.flags
game.popScene()
let popped=child.flags
let resumed=game.currentScene()===parent
initial+=0;afterCreate+=0;unchanged+=0;changed+=0;childInitial+=0;parentAfterOther+=0;childAfterOther+=0;raw+=0;merged+=0;popped+=0`;
export const flagsExpected={initial:0,afterCreate:1,unchanged:0,changed:1,childInitial:0,parentAfterOther:0,childAfterOther:1,raw:2.5,merged:2,popped:2,resumed:true};
export const renderingSource=`scene.setBackgroundColor(9)
let a=sprites.create(img\`2 2\n2 2\`,SpriteKind.Player)
let b=sprites.create(img\`3 3\n3 3\`,SpriteKind.Player)
a.setPosition(40,40);b.setPosition(40,40)
a.z=1
let frame=0
let trace=""
let masks=""
let paintMasks=""
let done=false
game.onPaint(function(){if(!done)paintMasks+=game.currentScene().flags+","})
game.onUpdate(function(){
 if(done)return
 frame++
 trace+=screen.getPixel(40,40)+",";masks+=game.currentScene().flags+",";
 if(frame==2){a.z=0;game.currentScene().flags=0}
 if(frame==3){game.currentScene().flags|=scene.Flag.NeedsSorting}
 if(frame==4){b.z=1}
 if(frame==5){a.z=1}
 if(frame==6){game.currentScene().flags|=scene.Flag.IsRendering}
 if(frame==7){game.currentScene().flags&=~scene.Flag.IsRendering;scene.setBackgroundColor(8)}
 if(frame==8){done=true}
})`;
export const gatingSource=`let downs=0
let ups=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){downs++})
controller.A.onEvent(ControllerButtonEvent.Released,function(){ups++})
controller._setUserEventsEnabled(false)
let ready=1
ready+=0
pause(40)
let heldWhileDisabled=controller.A.isPressed()
controller._setUserEventsEnabled(true)
pause(80)
let heldLater=controller.A.isPressed()
let downResult=downs
let upResult=ups
downResult+=0;upResult+=0`;
export const gatingActions=[{at:20,held:true},{at:60,held:false},{at:80,held:true},{at:100,held:false}];
export const compoundSource=`let trace=""
game.currentScene().flags=1
function receiver(){trace+="L";return game.currentScene()}
function rhs(){trace+="R";game.currentScene().flags=4;return 2}
receiver().flags|=rhs()
let result=game.currentScene().flags
result+=0;trace+=""`;
export const throughSource=`scene.setBackgroundColor(9)
let a=sprites.create(img\`2 2\n2 2\`,SpriteKind.Player);a.setPosition(20,30)
let parent=game.currentScene()
game.pushScene();scene.setBackgroundColor(8)
let child=game.currentScene();child.flags|=scene.Flag.SeeThrough
let b=sprites.create(img\`3 3\n3 3\`,SpriteKind.Player);b.setPosition(40,50)
let ticks=0;let done=false;let paintMask=0
let parentMask=parent.flags
game.onPaint(function(){paintMask=game.currentScene().flags})
game.onUpdate(function(){ticks++;if(ticks==3){done=true}})`;
export const nonfiniteZSource=`let a=sprites.create(img\`2\`,SpriteKind.Player)
game.currentScene().flags=0;a.z=NaN
let first=game.currentScene().flags;let nanZ=a.z!==a.z
game.currentScene().flags=0;a.z=NaN
let second=game.currentScene().flags
game.currentScene().flags=0;a.z=Infinity
let third=game.currentScene().flags;let infinite=a.z===Infinity
game.currentScene().flags=0;a.z=Infinity
let fourth=game.currentScene().flags
a.z=2.5
let raw=a.z;let fifth=game.currentScene().flags
first+=0;second+=0;third+=0;fourth+=0;fifth+=0;raw+=0`;
