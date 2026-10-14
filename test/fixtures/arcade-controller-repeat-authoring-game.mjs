// Owned repeat GUI acceptance fixture (MIT). No corpus artwork or helper source.
export function repeatAuthoringFiles({delay=60,interval=20}={}) {
 if(![60,40].includes(delay)||![20,30].includes(interval))throw new Error('Unknown repeat GUI variant');
 return {'main.ts':`scene.setBackgroundColor(15)
let hero=sprites.create(img\`2222\n2772\n2772\n2222\`,SpriteKind.Player)
hero.setPosition(80,60)
let first=0
let second=0
let firstReleased=0
let secondReleased=0
let observedDelay=0
let observedInterval=0
controller.setRepeatDefault(500,30)
controller.A.repeatDelay=${delay}
controller.A.repeatInterval=${interval}
controller.player2.B.repeatDelay=80
controller.player2.B.repeatInterval=20
controller.A.onEvent(ControllerButtonEvent.Repeated,function(){if(first<(firstReleased==0?2:4)){first++;info.setScore(first+second);hero.image.fill(first+second+1)}})
mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Repeated,function(player){if(mp.getPlayerProperty(player,mp.PlayerProperty.Number)==2 && second<(secondReleased==0?2:4)){second++;info.setScore(first+second);hero.image.fill(first+second+1)}})
controller.A.onEvent(ControllerButtonEvent.Released,function(){firstReleased++})
mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Released,function(player){if(mp.getPlayerProperty(player,mp.PlayerProperty.Number)==2)secondReleased++})
observedDelay=controller.A.repeatDelay
observedInterval=controller.A.repeatInterval
info.setScore(0)
let ready=1
ready+=0
`, 'pxt.json':JSON.stringify({name:'Owned controller repeat authoring game',dependencies:{device:'*',multiplayer:'*'},files:['main.ts'],preferredEditor:'tsprj'})};
}
export const repeatSample=({delay=60,interval=20,held=false}={})=>({ready:1,first:held?4:0,second:held?4:0,firstReleased:held?2:0,secondReleased:held?2:0,observedDelay:delay,observedInterval:interval});

export function editRepeatDelayCode(code) {
 let changes=0;
 const result=code.replace(/(arcade set player 1 button A repeat property repeatDelay to )\(40\)/g,(_,prefix)=>{changes++;return prefix+'(60)'});
 if(!changes)throw new Error('No authored player1 A delay40 literal to edit');
 return result;
}
