/**
 * Minimal CodeMirror 6 language mode for BASIC (BBC BASIC / 6502 BASIC).
 * StreamLanguage — no Lezer grammar needed.
 */
import {StreamLanguage} from '@codemirror/language';

const KEYWORD = /^(REM|LET|PRINT|INPUT|IF|THEN|ELSE|ENDIF|FOR|TO|STEP|NEXT|WHILE|WEND|ENDWHILE|REPEAT|UNTIL|GOTO|GOSUB|RETURN|DEF|PROC|ENDPROC|FN|END|DIM|DATA|READ|RESTORE|ON|AND|OR|NOT|MOD|DIV|TRUE|FALSE|ABS|INT|RND|SQR|SGN|ASC|CHR\$|STR\$|VAL|LEFT\$|RIGHT\$|MID\$|LEN|TIME|POKE|PEEK|CLS|STOP|RUN|NEW)$/i;

const basicMode = {
    startState: () => ({afterLineNum: false}),
    token (stream, state) {
        // At start of line, check for line number
        if (stream.sol()) {
            state.afterLineNum = false;
            if (stream.match(/^\d+/)) {
                state.afterLineNum = true;
                return 'number';
            }
        }
        // REM comment — rest of line
        if (stream.match(/^REM\b.*/i)) return 'comment';
        // Strings
        if (stream.match(/^"[^"]*"/)) return 'string';
        // Numbers
        if (stream.match(/^&[0-9A-Fa-f]+/)) return 'number';
        if (stream.match(/^\d+(\.\d+)?/)) return 'number';
        // Words
        if (stream.match(/^[A-Za-z_]\w*\$?/)) {
            const word = stream.current();
            if (KEYWORD.test(word)) return 'keyword';
            return 'variableName';
        }
        stream.next();
        return null;
    },
    languageData: {
        commentTokens: {line: 'REM'}
    }
};

export const basic = () => StreamLanguage.define(basicMode);
