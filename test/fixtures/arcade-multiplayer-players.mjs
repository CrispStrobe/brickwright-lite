export const MULTIPLAYER_PLAYERS_SOURCE=`
let one=mp.playerSelector(mp.PlayerNumber.One)
let two=mp.getPlayerByIndex(1)
let three=mp.getPlayerByNumber(3)
let four=mp.playerSelector(mp.PlayerNumber.Four)
let players=mp.allPlayers()
let count=players.length
let same=players[0]===one
let absent=mp.getPlayerSprite(one)===undefined
let invalid=mp.getPlayerByNumber(0)===undefined
let nullIndex=mp.getPlayerByIndex(null)===undefined
let nanIndex=mp.getPlayerByIndex(NaN)===undefined
let infiniteIndex=mp.getPlayerByIndex(Infinity)===undefined
let fractional=mp.getPlayerByIndex(1.5)===undefined
let missingOwner=mp.getPlayerBySprite(undefined)===one
let actor=sprites.create(img\`3\`,SpriteKind.Player)
actor.x=70
mp.setPlayerSprite(three,actor)
let reverse=mp.getPlayerBySprite(actor)===three
function spriteFor(player:mp.Player):Sprite{return mp.getPlayerSprite(player)}
let selected=spriteFor(three)
selected.left=60
let observedX=actor.x
let number=mp.getPlayerProperty(three,mp.PlayerProperty.Number)
let index=two.index
let fourth=four.number
let rows=[players]
let nested=rows[0][2]===three
players.pop()
let copied=mp.allPlayers().length
mp.setPlayerSprite(two,null)
let cleared=mp.getPlayerSprite(two)===null
let nullOwner=mp.getPlayerBySprite(null)===two
mp.setPlayerSprite(undefined,actor)
let invalidProperty=mp.getPlayerProperty(undefined,mp.PlayerProperty.Number)
game.pushScene()
let other=mp.getPlayerByNumber(3)
let distinct=other!==three
let oldSprite=spriteFor(three)===actor
let newEmpty=mp.getPlayerSprite(other)===undefined
game.popScene()
let restored=mp.playerSelector(mp.PlayerNumber.Three)===three
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){let chosen=mp.getPlayerSprite(three);chosen.x+=5;observedX=chosen.x})
`;
