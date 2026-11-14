// SPDX-License-Identifier: BSD-3-Clause
// Compatibility words for historical receiver overlap handlers, layered over
// the pinned compiler through the same app-owned door as Robot Lab words.
import {compileArcadeWord} from './arcadeDialect.js';

const WORDS = [
    {op: 'arcade_registerInstanceOverlapHandler', kind: 'command',
        words: 'arcade register instance overlap of {ID} as {TOKEN} capturing {CAPTURES}'},
    {op: 'arcade_whenRegisteredInstanceOverlap', kind: 'hat',
        words: 'when arcade instance overlap handler {TOKEN} runs'}
];
// Match keywords only outside strings/parentheses; preserve original slot text.
const matchTopLevel = (text, re) => {
    let depth = 0;
    let quoted = false;
    let masked = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted && ch === '\\' && i + 1 < text.length) {
            masked += '\u0001\u0001';
            i++;
            continue;
        }
        if (ch === '"') { quoted = !quoted; masked += ch; continue; }
        if (!quoted && ch === '(') { depth++; masked += depth === 1 ? ch : '\u0001'; continue; }
        if (!quoted && ch === ')') { masked += depth === 1 ? ch : '\u0001'; depth = Math.max(0, depth - 1); continue; }
        masked += quoted || depth > 0 ? '\u0001' : ch;
    }
    const indexed = new RegExp(re.source, re.flags.includes('d') ? re.flags : `${re.flags}d`);
    const match = indexed.exec(masked);
    return match && match.indices.map(span => span ? text.slice(...span) : undefined);
};

export default function withArcadeInstanceOverlap (Base) {
    return class extends Base {
        parseCommand (line, target, allowLoop = false) {
            const raw = String(line).trim();
            const hat = /^when\b/i.test(raw) && /:$/.test(raw);
            const text = hat ? raw.slice(0, -1) : raw;
            for (const entry of WORDS) {
                if ((entry.kind === 'hat') !== hat) continue;
                const match = matchTopLevel(text, compileArcadeWord(entry).re);
                if (!match) continue;
                const context = {target, extraBlocks: {}, parentId: null};
                const {id, block} = this.createBlock(entry.op, entry.kind === 'hat' ? {topLevel: true} : {});
                context.parentId = id;
                const read = source => {
                    if (typeof this.refuseSpilledReporter === 'function') this.refuseSpilledReporter(text, source, target);
                    return this.parseValue(source, context);
                };
                const slots = this.arcadeSlots(entry, match, context, read);
                if (!slots) continue;
                Object.assign(block[id], slots);
                return {block, extraBlocks: context.extraBlocks};
            }
            return super.parseCommand(line, target, allowLoop);
        }
        decompileHat (block, blocks) {
            const entry = WORDS.find(word => word.op === block?.opcode && word.kind === 'hat');
            return entry ? this.spellArcade(entry, block, blocks) : super.decompileHat(block, blocks);
        }
        decompileStackBlock (block, blocks, level) {
            const entry = WORDS.find(word => word.op === block?.opcode && word.kind === 'command');
            return entry ? [`${'  '.repeat(level)}${this.spellArcade(entry, block, blocks)}`] : super.decompileStackBlock(block, blocks, level);
        }
    };
}
