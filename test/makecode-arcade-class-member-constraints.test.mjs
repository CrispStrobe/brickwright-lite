import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// Arcade 2c, class part: an <any> Text or Boolean argument into a declared
// Number formal stays refused, for ordinary declarations at import and for
// class constructor and method formals on the class primitive export route.
const route=async source=>{
 const imported=arcadeToPseudocode(source);
 if(imported.unsupported.length)return {stage:'import',unsupported:imported.unsupported};
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
 const creator=new Creator();creator.parse(imported.code);
 return {stage:'export',unsupported:projectToArcade(creator.project).unsupported};
};
const refused=async(source,stage,pattern)=>{
 const result=await route(source);
 assert.equal(result.stage,stage,source+' -> '+JSON.stringify(result));
 assert.ok(result.unsupported.some(message=>pattern.test(message)),source+' -> '+JSON.stringify(result.unsupported));
};
const box='class Box{constructor(public n:number){}put(a:number){this.n=a}read():number{return this.n}}';

test('class constructor and method sites with Number arguments export (positive control)',async()=>{
 const result=await route(box+'let b=new Box(2);b.put(3);let r=b.read();');
 assert.deepEqual(result,{stage:'export',unsupported:[]});
});

test('new Box(<any>"x") into a Number constructor formal stays refused',async()=>{
 await refused(box+'let b=new Box(<any>"x");let r=b.read();','export',/^Class primitive export: argument Box\..*\.n conflicts with declared number \(actual String\)$/);
});

test('an <any> Boolean into a Number formal stays refused for class and ordinary formals',async()=>{
 await refused('let no=false;'+box+'let b=new Box(<any>(no&&true));let r=b.read();','export',/^Class primitive export: argument Box\..*\.n conflicts with declared number \(actual Boolean\)$/);
 await refused('let no=false;'+box+'let b=new Box(1);b.put(<any>(no&&true));let r=b.read();','export',/^Class primitive export: argument Box\..*\.a conflicts with declared number \(actual Boolean\)$/);
 await refused('let no=false;function tap(n:number){return n}function pair(a:number,b:number){return a*10+b}let r=pair(tap(1),<any>(no&&tap(2)));','import',/^Procedure parameter constraint: pair\.b requires Number from actual producers$/);
});

test('an <any> Text into a Number method formal stays refused',async()=>{
 await refused(box+'let b=new Box(1);b.put(<any>"x");let r=b.read();','export',/^Class primitive export: argument Box\..*\.a conflicts with declared number \(actual String\)$/);
});
