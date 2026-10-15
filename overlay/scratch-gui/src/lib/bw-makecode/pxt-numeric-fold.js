// SPDX-License-Identifier: MPL-2.0
import {numberLiteralCode} from './source-number-literal.js';
// Numeric formulas adapted from MIT PXT; Copyright (c) Microsoft Corporation.
// Retained notice: scratch-gui/static/licenses/pxt-core.MIT.txt.
// Source profile: https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts
// Owned numeric subset of the PXT compiler's constant-fold profile.
// The retained MIT-licensed pxt compiler folds these pure operations, then its
// JS number-literal emitter renders negative zero as 0. No bindings or effects
// are evaluated here; the caller supplies only proven SDK numeric constants.
const binary={'+':(a,b)=>a+b,'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'**':(a,b)=>a**b,
 '&':(a,b)=>a&b,'|':(a,b)=>a|b,'^':(a,b)=>a^b,'<<':(a,b)=>a<<b,'>>':(a,b)=>a>>b,'>>>':(a,b)=>a>>>b};
export function foldPxtNumeric(node,constant,root=true){
 if(node?.parenthesized && !root)return null;
 if(node?.type==='Number'){const value=Number(node.value);return Number.isNaN(value)?null:{value};}
 if(node?.type==='Identifier')return constant(node.name);
 if(node?.type==='Unary' && ['+','-','~'].includes(node.op)){const operand=foldPxtNumeric(node.argument,constant,false);if(!operand)return null;return {value:node.op==='+'?+operand.value:node.op==='-'?-operand.value:~operand.value};}
 if(node?.type==='Binary' && Object.prototype.hasOwnProperty.call(binary,node.op)){const left=foldPxtNumeric(node.left,constant,false),right=foldPxtNumeric(node.right,constant,false);if(left && right)return {value:binary[node.op](left.value,right.value)};}
 return null;
}
export function pxtFoldedNumberCode(value){
 if(Number.isNaN(value))return 'calculate value ((0 + (0))) op "/" with ((0 + (0)))';
 if(!Number.isFinite(value))return `calculate value ((0 + (${value<0?-1:1}))) op "/" with ((0 + (0)))`;
 return `(0 + (${numberLiteralCode(value)}))`;
}
