export const PHYSICS_ENGINE_VALUES_SOURCE=`
let view=game.currentScene()
let saved=view.physicsEngine as ArcadePhysicsEngine
let defaultEngine=new ArcadePhysicsEngine()
let defaultSpeed=defaultEngine.maxSpeed
let defaultMin=defaultEngine.minStep
let defaultMax=defaultEngine.maxStep
let one=new ArcadePhysicsEngine(123)
let two=new ArcadePhysicsEngine(80,3)
let oneSpeed=one.maxSpeed
let oneMin=one.minStep
let twoMax=two.maxStep
let explicit=new ArcadePhysicsEngine(undefined,undefined,undefined)
let explicitSpeed=explicit.maxSpeed
let explicitMin=explicit.minStep
let explicitMax=explicit.maxStep
function engineOf(sceneRef:scene.Scene){return sceneRef.physicsEngine as ArcadePhysicsEngine}
function speedOf(engine:ArcadePhysicsEngine){return engine.maxSpeed}
let engines:ArcadePhysicsEngine[]=[one,two]
let scenes:scene.Scene[]=[view]
let alias=engines[0]
alias.maxSpeed=31.25
alias.minStep=1.75
alias.maxStep=5.5
let roundedSpeed=speedOf(alias)
let roundedMin=alias.minStep
let roundedMax=alias.maxStep
let receiverCalls=0
let amountCalls=0
function owner(){receiverCalls+=1;return alias}
function amount(){amountCalls+=1;return 3}
owner().maxSpeed+=amount()
alias.minStep++
let compoundSpeed=alias.maxSpeed
let incrementMin=alias.minStep
view.physicsEngine=alias
let assignedIdentity=engineOf(scenes[0])===alias
let arrayIdentity=engines[0]===one
view.physicsEngine.setMaxSpeed(47)
let assignedSpeed=speedOf(alias)
game.pushScene()
let child=game.currentScene()
let differentScene=child!==view
view.physicsEngine=two
let hiddenAssigned=engineOf(view)===two
let childUnchanged=engineOf(child)!==two
game.popScene()
let restoredScene=game.currentScene()===view
let restoredEngine=engineOf(game.currentScene())===two
view.physicsEngine=saved
let originalRestored=engineOf(view)===saved
let engineValuesDone=assignedIdentity&&arrayIdentity&&hiddenAssigned&&childUnchanged&&restoredScene&&restoredEngine&&originalRestored
`;

export const PHYSICS_ENGINE_MEMBERSHIP_SOURCE=`
let view=game.currentScene()
let saved=view.physicsEngine as ArcadePhysicsEngine
saved.setMaxSpeed(40)
let oldActor=sprites.create(img\`5\`,SpriteKind.Player)
oldActor.setPosition(20,30)
oldActor.vx=100
let replacement=new ArcadePhysicsEngine(80,2,4)
let newActor:Sprite=null
let phase=0
let ticks=0
let freezeOld=0
let freezeNew=0
let capped=false
let replacementFrozen=false
let replacementMoves=false
let restoredFrozen=false
let restoredMoves=false
let engineMembershipDone=false
game.onUpdate(function(){
    ticks+=1
    if(phase===0&&oldActor.x>22){
        capped=oldActor.vx===40
        view.physicsEngine=replacement
        freezeOld=oldActor.x
        newActor=sprites.create(img\`9\`,SpriteKind.Food)
        newActor.setPosition(80,60)
        newActor.vx=60
        phase=1
        ticks=0
    }else if(phase===1&&ticks>=5&&newActor.x>82){
        replacementFrozen=oldActor.x===freezeOld
        replacementMoves=newActor.x>82
        freezeNew=newActor.x
        view.physicsEngine=saved
        phase=2
        ticks=0
    }else if(phase===2&&ticks>=5&&oldActor.x>freezeOld+2){
        restoredFrozen=newActor.x===freezeNew
        restoredMoves=oldActor.x>freezeOld+2
        oldActor.vx=0
        newActor.vx=0
        engineMembershipDone=capped&&replacementFrozen&&replacementMoves&&restoredFrozen&&restoredMoves
        phase=3
    }
    pause(20)
})
`;

export const PHYSICS_ENGINE_CONTROLLER_SOURCE=`
let view=game.currentScene()
let savedEngine=view.physicsEngine as ArcadePhysicsEngine
let replacementEngine=new ArcadePhysicsEngine(120,2,4)
let yellow=image.create(6,6)
yellow.fill(5)
let blue=image.create(6,6)
blue.fill(9)
let oldActor=sprites.create(yellow,SpriteKind.Player)
oldActor.setPosition(20,40)
let newActor:Sprite=null
let phase=0
let phaseTicks=0
let oldX=20
let newX=80
let freezeX=0
let capObserved=0
let replacementObserved=false
let restoredObserved=false
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    view.physicsEngine=savedEngine
    oldActor.setPosition(20,40)
    savedEngine.maxSpeed=40
    oldActor.vx=100
    capObserved=0
    phase=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    view.physicsEngine=replacementEngine
    freezeX=oldActor.x
    if(!newActor){newActor=sprites.create(blue,SpriteKind.Food)}
    newActor.setPosition(80,80)
    newActor.vx=60
    replacementObserved=false
    phaseTicks=0
    phase=2
})
controller.up.onEvent(ControllerButtonEvent.Pressed,function(){
    view.physicsEngine=savedEngine
    freezeX=newActor.x
    oldActor.setPosition(20,40)
    oldActor.vx=40
    restoredObserved=false
    phaseTicks=0
    phase=3
})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){
    view.physicsEngine=savedEngine
    savedEngine.maxSpeed=500
    savedEngine.minStep=4
    savedEngine.maxStep=2
    oldActor.setPosition(20,40)
    oldActor.vx=100
    phase=4
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    savedEngine.minStep=2
    savedEngine.maxStep=4
    oldActor.vx=0
    oldActor.setPosition(20,40)
    if(newActor){newActor.vx=0;newActor.setPosition(80,80)}
    view.physicsEngine=savedEngine
    phase=0
    capObserved=0
    replacementObserved=false
    restoredObserved=false
})
game.onUpdate(function(){
    phaseTicks+=1
    oldX=oldActor.x
    if(newActor){newX=newActor.x}
    if(phase===1&&oldActor.vx===40){capObserved=oldActor.vx}
    if(phase===1&&oldActor.x>=60){oldActor.vx=0}
    if(phase===2&&phaseTicks>=3&&newActor.x>82){replacementObserved=oldActor.x===freezeX}
    if(phase===2&&newActor.x>=110){newActor.vx=0}
    if(phase===3&&phaseTicks>=3&&oldActor.x>20){restoredObserved=newActor.x===freezeX}
    if(phase===3&&oldActor.x>=60){oldActor.vx=0}
    pause(20)
})
`;
