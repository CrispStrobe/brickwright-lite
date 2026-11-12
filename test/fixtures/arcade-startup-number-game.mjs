// A deterministic actual-writer/caller fixture shared by source and hosted controls.
export const startupNumberPrefix='let result=0;let sz=8;let w=(160/sz)|0;let h=(120/sz)|0;';
export const startupNumberProcedure='function take(n:number){result=n;}';
export const startupNumberConsume='take(Math.min(w-1,h-1));';
export const startupNumberSource=(paint=false)=>startupNumberPrefix+startupNumberProcedure+'function sample(){'+startupNumberConsume+'}'+(paint?'game.onPaint(function(){sample();});':'')+'sample();';
export const startupNumberExpected=Object.freeze({result:14,sz:8,w:20,h:15});
