// Code's infix parser treats the sign in an exponent as an infix operator.
// Canonicalize the same finite Number, then spell it in decimal digits.
// This changes the literal carrier, never the Number-to-text result.
export function numberLiteralCode(value) {
    const numeric=Number(value);
    if(!Number.isFinite(numeric))return String(value);
    const text=String(numeric),match=/^(-?)(\d+)(?:\.(\d+))?e([+-]?)(\d+)$/i.exec(text);
    if(!match)return text;
    const digits=match[2]+(match[3]||''),exponent=Number(match[5])*(match[4]==='-'?-1:1),point=match[2].length+exponent;
    const decimal=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
    return match[1]+decimal;
}
