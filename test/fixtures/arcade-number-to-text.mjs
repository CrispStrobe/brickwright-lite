// Bounded primitive Number oracle. A real frame callback consumes every result
// so the selected compiler retains the observations and readiness publication.
export const NUMBER_TEXT_SOURCE=`
let numberTextCalls=0
function numberTextLabel(String:number):string {numberTextCalls++;return String.toString()}
let numberTextMain=numberTextLabel(-1.25)
let numberTextZero=(0).toString()
let numberTextNegativeZero=(-0).toString()
let numberTextSigned=(-1).toString()
let numberTextFraction=(1.25).toString()
let numberTextLargeNumber=1e+21
let numberTextAlias=numberTextLargeNumber
let numberTextLarge=numberTextAlias.toString()
let numberTextSmall=(1e-7).toString()
let numberTextSubnormal=(5e-324).toString()
let numberTextSnapshot=""
let numberTextReady=false
game.onUpdate(function(){
 numberTextSnapshot=numberTextMain+"|"+numberTextZero+"|"+numberTextNegativeZero+"|"+numberTextSigned+"|"+numberTextFraction+"|"+numberTextLarge+"|"+numberTextSmall+"|"+numberTextSubnormal
 numberTextReady=numberTextCalls===1
})
`;
export const NUMBER_TEXT_EXPECTED='-1.25|0|0|-1|1.25|1e+21|1e-7|5e-324';
