/**
 * Minimal CodeMirror 6 language mode for BrickWright pseudocode.
 * StreamLanguage — no Lezer grammar needed for keyword + string + comment highlighting.
 */
import {StreamLanguage} from '@codemirror/language';

const STRUCTURAL = /^(SPRITE|STAGE|GLOBAL|LOCAL|LIST|SHAPE|COSTUME|BACKDROP|SOUND|WHEN|DEFINE|DEVICE|PIN|CLOCK)$/;
const CONTROL = /^(IF|THEN|ELSE|FOREVER|REPEAT|UNTIL|FAST|STOP)$/;
const KEYWORD = /^(set|change|say|think|ask|wait|move|turn|go|glide|point|broadcast|create|delete|stop|add|insert|replace|call|play|hide|show|switch|next|when|and|or|not|of|to|by|until|contains|mod|join|item|pick|random|round|sqrt|length|clone|myself|OUTPUT|INPUT|ANALOG|ACTIVE|LOW|HIGH)$/i;

const pseudocodeMode = {
    startState: () => ({}),
    token (stream) {
        // Comments
        if (stream.match(/^#.*/)) return 'comment';
        // Strings
        if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
        if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return 'string';
        // Numbers
        if (stream.match(/^0x[0-9a-fA-F]+/)) return 'number';
        if (stream.match(/^\d+(\.\d+)?/)) return 'number';
        // Words
        if (stream.match(/^[A-Za-z_]\w*/)) {
            const word = stream.current();
            if (STRUCTURAL.test(word)) return 'keyword';
            if (CONTROL.test(word)) return 'keyword';
            if (KEYWORD.test(word)) return 'variableName';
            return null;
        }
        stream.next();
        return null;
    },
    languageData: {
        commentTokens: {line: '#'}
    }
};

export const pseudocode = () => StreamLanguage.define(pseudocodeMode);
