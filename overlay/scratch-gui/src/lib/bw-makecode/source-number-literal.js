// Code's infix parser treats the minus in a small exponent as subtraction.
// Spell that same finite literal in decimal digits before it reaches the parser.
// This changes the literal carrier, never the Number-to-text result.
export function numberLiteralCode(value) {
    const text=String(value),match=/^(-?)(\d+)(?:\.(\d+))?e-(\d+)$/i.exec(text);
    if(!match)return text;
    const digits=match[2]+(match[3]||''),point=match[2].length-Number(match[4]);
    const decimal=point<=0?'0.'+'0'.repeat(-point)+digits:digits.slice(0,point)+'.'+digits.slice(point);
    return match[1]+decimal;
}
