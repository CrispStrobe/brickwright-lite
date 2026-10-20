// Independently authored selected-SDK controls. No runtime or source patches.
export const extendableControls={
    constructorPause:`let updates=0
let ready=0
game.onUpdate(function(){ready=1})
let early=0
let dtTrace=""
class Actor extends sprites.ExtendableSprite {
 marker:number
 constructor(){super(img\`1\`,SpriteKind.Player);pause(40);this.marker=7}
 update(dt:number){updates+=1;if(this.marker===undefined)early+=1;dtTrace+=dt+","}
}
let actor=new Actor()
let completed=actor.marker
pause(40)
let total=updates
let before=early
let deltas=dtTrace`,
    imagePause:`let updates=0
let ready=0
game.onUpdate(function(){ready=1})
let early=0
class Actor extends sprites.ExtendableSprite {
 marker:number
 constructor(){super(img\`1\`,SpriteKind.Player);this.marker=7}
 setImage(value:Image){super.setImage(value);pause(40)}
 update(dt:number){updates+=1;if(this.marker===undefined)early+=1}
}
let actor=new Actor()
let completed=actor.marker
pause(40)
let total=updates
let before=early`,
    destroyedUpdate:`let updates=0
let ready=0
game.onUpdate(function(){ready=1})
let destroyedAtUpdate=0
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1;if(sprites.allOfKind(SpriteKind.Player).length===0)destroyedAtUpdate+=1}
}
let actor=new Actor()
let alias:Sprite=actor
actor.lifespan=0
pause(40)
let total=updates
let destroyedCalls=destroyedAtUpdate
let same=actor===alias
let remaining=sprites.allOfKind(SpriteKind.Player).length
let kind=actor.kind()`
};
export const extendableLifecycleControls={
    plainRemoval:`let ready=0
game.onUpdate(function(){ready=1})
let updates=0
let plain=sprites.create(img\`2\`,SpriteKind.Food)
let plainIndefinite=plain.lifespan===undefined
plain.setPosition(180,60)
plain.setFlag(SpriteFlag.AutoDestroy,true)
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1}
}
let actor=new Actor()
let indefinite=actor.lifespan===undefined
pause(1)
let first=updates
pause(39)
let total=updates
let remaining=sprites.allOfKind(SpriteKind.Food).length
let sequence="mixed"`,
    updatePause:`let ready=0
game.onUpdate(function(){ready=1})
let updates=0
let trace=""
let dtTrace=""
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1;dtTrace+=dt+",";if(updates===1){trace+="A";pause(40);trace+="B"}else trace+="C"}
}
let actor=new Actor()
pause(80)
let total=updates
let sequence=trace
let deltas=dtTrace`,
    destroyedScene:`let ready=0
game.onUpdate(function(){ready=1})
let updates=0
let trace=""
let destroyedDelta=-1
sprites.onDestroyed(SpriteKind.Player,function(sprite){trace+="D";game.pushScene()})
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1;trace+="U";if(sprites.allOfKind(SpriteKind.Player).length===0){destroyedDelta=dt;game.popScene()}}
}
let actor=new Actor()
actor.lifespan=20
pause(60)
let total=updates
let sequence=trace
let delta=destroyedDelta`,
    scenePause:`let ready=0
game.onUpdate(function(){ready=1})
let updates=0
let childUpdates=0
let trace=""
let dtTrace=""
class Child extends sprites.ExtendableSprite {
 constructor(){super(img\`2\`,SpriteKind.Food)}
 update(dt:number){childUpdates+=1}
}
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1;dtTrace+=dt+",";if(updates===1){trace+="A";game.pushScene();let child=new Child();pause(40);trace+="B";game.popScene();trace+="C"}else trace+="D"}
}
let actor=new Actor()
pause(80)
let total=updates
let children=childUpdates
let sequence=trace
let deltas=dtTrace`
};
