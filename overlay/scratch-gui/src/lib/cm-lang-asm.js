/**
 * Minimal CodeMirror 6 language mode for assembly listing output.
 * Handles 8051, AVR, ARM, and 6502 assembly from the compile service.
 */
import {StreamLanguage} from '@codemirror/language';

const asmMode = {
    startState: () => ({}),
    token (stream) {
        // Comments (various assembler styles)
        if (stream.match(/^;.*/)) return 'comment';
        if (stream.match(/^\/\/.*/)) return 'comment';
        // Hex address at line start (listing format: "0000:")
        if (stream.sol() && stream.match(/^[0-9A-Fa-f]{4,8}:?\s/)) return 'number';
        // Hex literals
        if (stream.match(/^0x[0-9A-Fa-f]+/i)) return 'number';
        if (stream.match(/^[0-9A-Fa-f]+[Hh]\b/)) return 'number';
        if (stream.match(/^\$[0-9A-Fa-f]+/)) return 'number';
        if (stream.match(/#[0-9A-Fa-f]+/)) return 'number';
        // Decimal numbers
        if (stream.match(/^\d+/)) return 'number';
        // Labels (word followed by colon at start of line)
        if (stream.sol() && stream.match(/^[A-Za-z_]\w*:/)) return 'definition';
        // Directives (.db, .org, .section, etc.)
        if (stream.match(/^\.[a-zA-Z]\w*/)) return 'keyword';
        // Mnemonics — common 8051/AVR/ARM/6502 instructions
        if (stream.match(/^(mov|add|sub|inc|dec|jmp|jnz|jz|jc|jnc|jb|jnb|call|ret|reti|push|pop|nop|clr|setb|cpl|anl|orl|xrl|rl|rr|djnz|cjne|acall|ajmp|lcall|ljmp|sjmp|movx|movc|xch|swap|mul|div|da)\b/i)) return 'keyword';
        if (stream.match(/^(lda|sta|ldx|stx|ldy|sty|adc|sbc|and|ora|eor|cmp|cpx|cpy|bit|asl|lsr|rol|ror|jsr|rts|rti|brk|pha|pla|php|plp|tax|txa|tay|tya|tsx|txs|sec|clc|sei|cli|sed|cld|clv|bcc|bcs|beq|bne|bmi|bpl|bvc|bvs|inx|iny|dex|dey)\b/i)) return 'keyword';
        if (stream.match(/^(ldi|lds|sts|lpm|spm|in|out|sbi|cbi|sbic|sbis|brne|breq|brcs|brcc|rcall|rjmp|ijmp|icall|adiw|sbiw|andi|ori|com|neg|tst|cp|cpc|cpi|cpse|sbrc|sbrs|bld|bst|wdr|sleep)\b/i)) return 'keyword';
        // Register names
        if (stream.match(/^[rR]\d{1,2}\b/)) return 'variableName';
        if (stream.match(/^(SP|PC|ACC|PSW|DPTR|A|B|C|X|Y|P[0-3]|TMOD|TCON|TH[01]|TL[01]|SCON|SBUF|IE|IP|PCON)\b/)) return 'variableName';
        // Identifiers
        if (stream.match(/^[A-Za-z_]\w*/)) return null;
        stream.next();
        return null;
    },
    languageData: {
        commentTokens: {line: ';'}
    }
};

export const asm = () => StreamLanguage.define(asmMode);
