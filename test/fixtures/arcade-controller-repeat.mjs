// Owned finite fixtures using selected MIT controller public API.
export const repeatOperandSource="let calls=0\nlet initial=controller.A.repeatDelay===undefined\ncontroller.A.repeatDelay=10\nfunction rhs(){calls+=1;controller.A.repeatDelay=30;return 5}\ncontroller.A.repeatDelay+=rhs()\nlet compound=controller.A.repeatDelay\ncontroller.player2.B.repeatInterval=(null as any)\nlet rawNull=controller.player2.B.repeatInterval===null\ncontroller.A.repeatDelay=undefined\nlet unset=controller.A.repeatDelay===undefined\ncontroller.A.repeatInterval=NaN\nlet observedNaN=controller.A.repeatInterval\nlet rawNaN=observedNaN!==observedNaN\ncontroller.A.repeatDelay=24.5\ngame.pushScene()\nlet child=controller.A.repeatDelay\ngame.popScene()\nlet parent=controller.A.repeatDelay\nlet done=false\ndone=child===parent\n";
export const repeatAllPairsSource=(()=>{
 const lines=['let initialPairs=0','let total=0'];let ordinal=0;
 for(const player of [1,2,3,4])for(const button of ['A','B','up','down','left','right']){
  const receiver=`controller.player${player}.${button}`;ordinal++;
  lines.push(`if(${receiver}.repeatDelay===undefined && ${receiver}.repeatInterval===undefined)initialPairs+=1`,
   `${receiver}.repeatDelay=${ordinal}`,`${receiver}.repeatInterval=${100+ordinal}`,
   `total+=${receiver}.repeatDelay+${receiver}.repeatInterval`);
 }
 lines.push('controller.player2.B.repeatDelay=40','controller.player2.B.repeatInterval=20',
  'let trace=""','let repeats=0',
  'mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Repeated,function(){repeats+=1;trace+=game.runtime()+","})',
  'let ready=0','let done=0','game.onUpdate(function(){ready=1;if(game.runtime()>=240)done=1})','pause(240)');
 return lines.join('\n');
})();
