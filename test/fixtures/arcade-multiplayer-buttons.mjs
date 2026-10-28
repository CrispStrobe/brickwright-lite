export const MULTIPLAYER_BUTTONS_SOURCE = `let actor=sprites.create(img\`1\`,SpriteKind.Player)
actor.setPosition(40,40)
let two=mp.playerSelector(mp.PlayerNumber.Two)
mp.setPlayerSprite(two,actor)
let pressed=0
let released=0
let observed=0
let identity=false
let held=false
let legacy=0
let quick=0
mp.onButtonEvent(mp.MultiplayerButton.A,ControllerButtonEvent.Pressed,function(player){pressed+=100})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){legacy+=1})
function install(){
 let weight=3
 mp.onButtonEvent(mp.MultiplayerButton.A,ControllerButtonEvent.Pressed,function(player){
  pressed+=weight
  observed=player.number
  identity=player===two
  held=mp.isButtonPressed(player,mp.MultiplayerButton.A)
  let sprite=mp.getPlayerSprite(player)
  sprite.x+=5
 })
 weight=4
}
install()
mp.onButtonEvent(mp.MultiplayerButton.A,ControllerButtonEvent.Released,function(player){released+=player.number})
mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Pressed,function(player){quick+=player.number})
mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Released,function(player){quick+=player.number*10})`;
