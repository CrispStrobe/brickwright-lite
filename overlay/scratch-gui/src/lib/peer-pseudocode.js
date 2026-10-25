// App-owned peer vocabulary layered over the pinned sb3-creator compiler.
// The upstream parser stays byte-identical; Code tab compilation and its
// From Blocks path both obtain this subclass through register-art.js.

const REPORTERS = {
    'selected peer': 'peerName',
    'last peer photo': 'lastPhoto',
    'peer photo width': 'photoWidth',
    'peer photo height': 'photoHeight'
};
const REPORTER_PHRASES = Object.fromEntries(
    Object.entries(REPORTERS).map(([phrase, opcode]) => [`peersessions_${opcode}`, phrase]));
const COMMANDS = {
    'take photo on peer': 'takePhoto',
    'send project to peer': 'sendProject',
    'send code to peer': 'sendCode',
    'get project from peer': 'requestProject',
    'get code from peer': 'requestCode',
    'run peer project': 'run',
    'stop peer project': 'stop'
};
const COMMAND_PHRASES = Object.fromEntries(
    Object.entries(COMMANDS).map(([phrase, opcode]) => [`peersessions_${opcode}`, phrase]));
const ARGUMENT_COMMANDS = [
    {opcode: 'takePhotoFrom', pattern: /^take photo on peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'sendProjectTo', pattern: /^send project to peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'sendCodeTo', pattern: /^send code to peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'requestProjectFrom', pattern: /^get project from peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'requestCodeFrom', pattern: /^get code from peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'runOn', pattern: /^run project on peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'stopOn', pattern: /^stop project on peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'broadcastOn',
        pattern: /^broadcast\s+(.+?)\s+on peer\s+(.+)$/i,
        inputs: ['MESSAGE', 'PEER']},
    {opcode: 'setVariableOn',
        pattern: /^set variable\s+(.+?)\s+to\s+(.+?)\s+on peer\s+(.+)$/i,
        inputs: ['NAME', 'VALUE', 'PEER']},
    {opcode: 'moveSpriteOn',
        pattern: /^move sprite\s+(.+?)\s+on peer\s+(.+?)\s+to x\s+(.+?)\s+y\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER', 'X', 'Y']},
    {opcode: 'pointSpriteOn',
        pattern: /^point sprite\s+(.+?)\s+on peer\s+(.+?)\s+in direction\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER', 'DIRECTION']},
    {opcode: 'sizeSpriteOn',
        pattern: /^set sprite\s+(.+?)\s+on peer\s+(.+?)\s+size to\s+(.+?)\s*%?$/i,
        inputs: ['SPRITE', 'PEER', 'SIZE']},
    {opcode: 'showSpriteOn',
        pattern: /^show sprite\s+(.+?)\s+on peer\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER']},
    {opcode: 'hideSpriteOn',
        pattern: /^hide sprite\s+(.+?)\s+on peer\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER']},
    {opcode: 'broadcast', pattern: /^broadcast\s+(.+?)\s+on peer$/i, inputs: ['MESSAGE']},
    {opcode: 'setVariable',
        pattern: /^set peer variable\s+(.+?)\s+to\s+(.+)$/i,
        inputs: ['NAME', 'VALUE']},
    {opcode: 'moveSprite',
        pattern: /^move peer sprite\s+(.+?)\s+to x\s+(.+?)\s+y\s+(.+)$/i,
        inputs: ['SPRITE', 'X', 'Y']},
    {opcode: 'pointSprite',
        pattern: /^point peer sprite\s+(.+?)\s+in direction\s+(.+)$/i,
        inputs: ['SPRITE', 'DIRECTION']},
    {opcode: 'sizeSprite',
        pattern: /^set peer sprite\s+(.+?)\s+size to\s+(.+?)\s*%?$/i,
        inputs: ['SPRITE', 'SIZE']},
    {opcode: 'showSprite', pattern: /^show peer sprite\s+(.+)$/i, inputs: ['SPRITE']},
    {opcode: 'hideSprite', pattern: /^hide peer sprite\s+(.+)$/i, inputs: ['SPRITE']}
];
const ARGUMENT_REPORTERS = [
    {opcode: 'lastPhotoFrom', pattern: /^last photo from peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'photoWidthFrom', pattern: /^photo width from peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'photoHeightFrom', pattern: /^photo height from peer\s+(.+)$/i, inputs: ['PEER']},
    {opcode: 'photoColorFrom',
        pattern: /^photo color from peer\s+(.+?)\s+at\s+(.+?)\s*,\s*(.+)$/i,
        inputs: ['PEER', 'X', 'Y']},
    {opcode: 'photoBrightnessFrom',
        pattern: /^photo brightness from peer\s+(.+?)\s+at\s+(.+?)\s*,\s*(.+)$/i,
        inputs: ['PEER', 'X', 'Y']},
    {opcode: 'getVariableFrom',
        pattern: /^variable\s+(.+?)\s+on peer\s+(.+)$/i,
        inputs: ['NAME', 'PEER']},
    {opcode: 'spriteXFrom',
        pattern: /^sprite\s+(.+?)\s+x on peer\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER']},
    {opcode: 'spriteYFrom',
        pattern: /^sprite\s+(.+?)\s+y on peer\s+(.+)$/i,
        inputs: ['SPRITE', 'PEER']},
    {opcode: 'getVariable', pattern: /^peer variable\s+(.+)$/i, inputs: ['NAME']},
    {opcode: 'spriteX', pattern: /^peer sprite\s+(.+?)\s+x$/i, inputs: ['SPRITE']},
    {opcode: 'spriteY', pattern: /^peer sprite\s+(.+?)\s+y$/i, inputs: ['SPRITE']}
];
const createInputs = (creator, context, opcode, inputs, values) => {
    const id = creator.pushBlock(context, `peersessions_${opcode}`);
    const parentId = context.parentId;
    context.parentId = id;
    context.extraBlocks[id].inputs = Object.fromEntries(inputs.map((input, index) =>
        [input, creator.parseValue(values[index], context)]));
    context.parentId = parentId;
    return id;
};

/**
 * Add app-owned peer phrases while keeping the pinned compiler unchanged.
 * @param {Function} Base - The registered SB3Creator class.
 * @returns {Function} The compiler with Peer Sessions pseudocode support.
 */
export default function withPeerPseudocode (Base) {
    return class PeerPseudocodeCreator extends Base {
        parseReporter (source, context) {
            const text = source.trim();
            for (const {opcode, pattern, inputs} of ARGUMENT_REPORTERS) {
                const match = text.match(pattern);
                if (match) return this.valueOfBlock(createInputs(this, context, opcode, inputs, match.slice(1)));
            }
            const coordinate = text.match(/^peer photo (color|brightness) at\s+(.+?)\s*,\s*(.+)$/i);
            if (coordinate) {
                const opcode = coordinate[1].toLowerCase() === 'color' ? 'photoColor' : 'photoBrightness';
                const id = this.pushBlock(context, `peersessions_${opcode}`);
                const parentId = context.parentId;
                context.parentId = id;
                context.extraBlocks[id].inputs = {
                    X: this.parseValue(coordinate[2], context),
                    Y: this.parseValue(coordinate[3], context)
                };
                context.parentId = parentId;
                return this.valueOfBlock(id);
            }
            const opcode = REPORTERS[text.toLowerCase()];
            if (opcode) return this.valueOfBlock(this.pushBlock(context, `peersessions_${opcode}`));
            return super.parseReporter(source, context);
        }

        parseCondition (source, context) {
            const text = this.stripOuterParens(source.trim());
            const paired = text.match(/^peer\s+(.+?)\s+paired\?$/i);
            if (paired) return createInputs(this, context, 'hasPeer', ['PEER'], [paired[1]]);
            if (/^peer selected\??$/i.test(text)) {
                return this.pushBlock(context, 'peersessions_connected');
            }
            return super.parseCondition(source, context);
        }

        parseCommand (source, target) {
            const line = source.trim();
            for (const {opcode: argumentOpcode, pattern, inputs} of ARGUMENT_COMMANDS) {
                const match = line.match(pattern);
                if (!match) continue;
                const context = {target, extraBlocks: {}, parentId: null};
                const {id, block} = this.createBlock(`peersessions_${argumentOpcode}`);
                context.parentId = id;
                inputs.forEach((input, index) => {
                    block[id].inputs[input] = this.parseValue(match[index + 1], context);
                });
                return {block, extraBlocks: context.extraBlocks};
            }
            let opcode = COMMANDS[line.toLowerCase()];
            const selected = line.match(/^select peer\s+(.+)$/i);
            if (selected) opcode = 'selectPeer';
            if (!opcode) return super.parseCommand(source, target);
            const context = {target, extraBlocks: {}, parentId: null};
            const {id, block} = this.createBlock(`peersessions_${opcode}`);
            if (selected) {
                context.parentId = id;
                block[id].inputs.NAME = this.parseValue(selected[1], context);
            }
            return {block, extraBlocks: context.extraBlocks};
        }

        drep (block, blocks) {
            const value = input => this.dval(block.inputs[input], blocks);
            const namedPhrases = {
                peersessions_lastPhotoFrom: () => `last photo from peer ${value('PEER')}`,
                peersessions_photoWidthFrom: () => `photo width from peer ${value('PEER')}`,
                peersessions_photoHeightFrom: () => `photo height from peer ${value('PEER')}`,
                peersessions_photoColorFrom: () =>
                    `photo color from peer ${value('PEER')} at ${value('X')}, ${value('Y')}`,
                peersessions_photoBrightnessFrom: () =>
                    `photo brightness from peer ${value('PEER')} at ${value('X')}, ${value('Y')}`,
                peersessions_getVariableFrom: () =>
                    `variable ${value('NAME')} on peer ${value('PEER')}`,
                peersessions_spriteXFrom: () =>
                    `sprite ${value('SPRITE')} x on peer ${value('PEER')}`,
                peersessions_spriteYFrom: () =>
                    `sprite ${value('SPRITE')} y on peer ${value('PEER')}`
            };
            if (namedPhrases[block?.opcode]) return namedPhrases[block.opcode]();
            if (block?.opcode === 'peersessions_getVariable') {
                return `peer variable ${this.dval(block.inputs.NAME, blocks)}`;
            }
            if (block?.opcode === 'peersessions_spriteX' || block?.opcode === 'peersessions_spriteY') {
                const coordinate = block.opcode === 'peersessions_spriteX' ? 'x' : 'y';
                return `peer sprite ${this.dval(block.inputs.SPRITE, blocks)} ${coordinate}`;
            }
            if (block?.opcode === 'peersessions_photoColor' ||
                block?.opcode === 'peersessions_photoBrightness') {
                const kind = block.opcode === 'peersessions_photoColor' ? 'color' : 'brightness';
                const x = this.dval(block.inputs.X, blocks);
                const y = this.dval(block.inputs.Y, blocks);
                return `peer photo ${kind} at ${x}, ${y}`;
            }
            const phrase = REPORTER_PHRASES[block?.opcode];
            return phrase || super.drep(block, blocks);
        }

        dcond (ref, blocks) {
            if (blocks[ref]?.opcode === 'peersessions_connected') return 'peer selected?';
            if (blocks[ref]?.opcode === 'peersessions_hasPeer') {
                return `peer ${this.dval(blocks[ref].inputs.PEER, blocks)} paired?`;
            }
            return super.dcond(ref, blocks);
        }

        decompileStackBlock (block, blocks, level) {
            const value = input => this.dval(block.inputs[input], blocks);
            const argumentPhrases = {
                peersessions_takePhotoFrom: () => `take photo on peer ${value('PEER')}`,
                peersessions_sendProjectTo: () => `send project to peer ${value('PEER')}`,
                peersessions_sendCodeTo: () => `send code to peer ${value('PEER')}`,
                peersessions_requestProjectFrom: () => `get project from peer ${value('PEER')}`,
                peersessions_requestCodeFrom: () => `get code from peer ${value('PEER')}`,
                peersessions_runOn: () => `run project on peer ${value('PEER')}`,
                peersessions_stopOn: () => `stop project on peer ${value('PEER')}`,
                peersessions_broadcastOn: () =>
                    `broadcast ${value('MESSAGE')} on peer ${value('PEER')}`,
                peersessions_setVariableOn: () =>
                    `set variable ${value('NAME')} to ${value('VALUE')} on peer ${value('PEER')}`,
                peersessions_moveSpriteOn: () =>
                    `move sprite ${value('SPRITE')} on peer ${value('PEER')} ` +
                    `to x ${value('X')} y ${value('Y')}`,
                peersessions_pointSpriteOn: () =>
                    `point sprite ${value('SPRITE')} on peer ${value('PEER')} ` +
                    `in direction ${value('DIRECTION')}`,
                peersessions_sizeSpriteOn: () =>
                    `set sprite ${value('SPRITE')} on peer ${value('PEER')} size to ${value('SIZE')}%`,
                peersessions_showSpriteOn: () =>
                    `show sprite ${value('SPRITE')} on peer ${value('PEER')}`,
                peersessions_hideSpriteOn: () =>
                    `hide sprite ${value('SPRITE')} on peer ${value('PEER')}`,
                peersessions_broadcast: () => `broadcast ${value('MESSAGE')} on peer`,
                peersessions_setVariable: () => `set peer variable ${value('NAME')} to ${value('VALUE')}`,
                peersessions_moveSprite: () =>
                    `move peer sprite ${value('SPRITE')} to x ${value('X')} y ${value('Y')}`,
                peersessions_pointSprite: () =>
                    `point peer sprite ${value('SPRITE')} in direction ${value('DIRECTION')}`,
                peersessions_sizeSprite: () =>
                    `set peer sprite ${value('SPRITE')} size to ${value('SIZE')}%`,
                peersessions_showSprite: () => `show peer sprite ${value('SPRITE')}`,
                peersessions_hideSprite: () => `hide peer sprite ${value('SPRITE')}`
            };
            if (argumentPhrases[block.opcode]) {
                return [`${'  '.repeat(level)}${argumentPhrases[block.opcode]()}`];
            }
            if (block.opcode === 'peersessions_selectPeer') {
                return [`${'  '.repeat(level)}select peer ${this.dval(block.inputs.NAME, blocks)}`];
            }
            const phrase = COMMAND_PHRASES[block.opcode];
            if (phrase) return [`${'  '.repeat(level)}${phrase}`];
            return super.decompileStackBlock(block, blocks, level);
        }
    };
}
