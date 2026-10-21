// Independently authored control; no third-party tutorial/package source.
export const SCORE_THRESHOLD_SOURCE = `let trace=""
let nested=""
let live=""
let zero=""
let scenes=""
let mutated=false
info.setScore(0)
info.onScore(2,function(){trace+="obsolete"})
info.onScore(2,function(){trace+="A"})
info.onScore(-1,function(){trace+="B"})
info.onScore(0.5,function(){trace+="F"})
let noImmediate=trace
info.setScore(2)
info.setScore(3)
info.setScore(-2)
info.setScore(2)
info.setScore(1.9)
let integerScore=info.score()
info.setScore(0)
info.player2.onScore(1,function(){
 nested+="X"
 if(!mutated){
  mutated=true
  info.player2.onScore(2,function(){nested+="R"})
  info.player2.onScore(3,function(){nested+="N"})
  info.player2.setScore(-1)
 }
})
info.player2.onScore(2,function(){nested+="obsolete"})
info.player2.setScore(4)
let nestedFirst=nested
let two=mp.playerSelector(mp.PlayerNumber.Two)
mp.setPlayerState(two,MultiplayerState.score,2)
mp.changePlayerStateBy(two,MultiplayerState.score,-4)
let mpScore=info.player2.score()
info.player3.onScore(1,function(){
 live+="X"
 info.player3.onScore(2,function(){live+="R"})
 info.player3.onScore(3,function(){live+="N"})
})
info.player3.onScore(2,function(){live+="obsolete"})
info.player3.setScore(4)
let firstLive=live
info.player3.setScore(0)
info.player4.onScore(-0,function(){zero+="obsolete"})
info.player4.onScore(0,function(){zero+="Z"})
info.player4.setScore(0)
info.player4.setScore(1)
info.player4.setScore(-1)
let zeroFirst=zero
info.player4.onScore(7,function(){scenes+="P"})
game.pushScene()
info.player4.onScore(7,function(){scenes+="C"})
info.player4.setScore(7)
game.popScene()
info.player4.setScore(7)
let ready=true`;
