// Owned event GUI acceptance fixture (MIT). No corpus artwork or helper source.
export function eventAuthoringFiles({value=1,player=2,message='H'}={}) {
 if(![1,2].includes(value)||![2,3].includes(player)||!['H','PLAY'].includes(message))throw new Error('Unknown event GUI variant');
 return {'main.ts':`scene.setBackgroundColor(15)
let hero=sprites.create(img\`2222\n2772\n2772\n2222\`,SpriteKind.Player)
hero.setPosition(40,60)
let eventSource=control.allocateNotifyEvent()
let trace=""
let hits=0
let waiting=0
let connectionPlayer=0
let pressed=0
let heroX=hero.x
control.onEvent(eventSource,${value},function(){hits++;trace+="${message}";hero.x=40+hits*8;heroX=hero.x;info.setScore(hits)})
control.runInParallel(function(){control.waitForEvent(eventSource,${value});waiting++})
mp.onControllerEvent(ControllerEvent.Connected,function(player){connectionPlayer=mp.getPlayerProperty(player,mp.PlayerProperty.Number)})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){pressed++;controller.player${player}.connected=true;control.raiseEvent(eventSource,${value})})
info.setScore(0)
let ready=1
ready+=0
`, 'pxt.json':JSON.stringify({name:'Owned event authoring game',dependencies:{device:'*',multiplayer:'*'},files:['main.ts'],preferredEditor:'tsprj'})};
}
export const eventSample=({pressed=false,player=2,message='H'}={})=>({ready:1,hits:pressed?1:0,trace:pressed?message:'',waiting:pressed?1:0,connectionPlayer:pressed?player:0,pressed:pressed?1:0,heroX:pressed?48:40});
