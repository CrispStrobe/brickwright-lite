const BlockType = require('../../../extension-support/block-type');
const ArgumentType = require('../../../extension-support/argument-type');

const NAMED_BLOCKS = [
    ['takePhotoFrom', 'takePhoto', 'take photo on peer [PEER]'],
    ['lastPhotoFrom', 'lastPhoto', 'last photo from peer [PEER]'],
    ['photoWidthFrom', 'photoWidth', 'photo width from peer [PEER]'],
    ['photoHeightFrom', 'photoHeight', 'photo height from peer [PEER]'],
    ['photoColorFrom', 'photoColor', 'photo color from peer [PEER] at x [X] y [Y]'],
    ['photoBrightnessFrom', 'photoBrightness', 'photo brightness from peer [PEER] at x [X] y [Y]'],
    ['sendProjectTo', 'sendProject', 'send project and code to peer [PEER]'],
    ['sendCodeTo', 'sendCode', 'send Code tab to peer [PEER]'],
    ['requestProjectFrom', 'requestProject', 'get project and code from peer [PEER]'],
    ['requestCodeFrom', 'requestCode', 'get Code tab from peer [PEER]'],
    ['runOn', 'run', 'run project on peer [PEER]'],
    ['stopOn', 'stop', 'stop project on peer [PEER]'],
    ['broadcastOn', 'broadcast', 'broadcast [MESSAGE] on peer [PEER]'],
    ['setVariableOn', 'setVariable', 'set variable [NAME] to [VALUE] on peer [PEER]'],
    ['getVariableFrom', 'getVariable', 'variable [NAME] on peer [PEER]'],
    ['moveSpriteOn', 'moveSprite', 'move sprite [SPRITE] on peer [PEER] to x [X] y [Y]'],
    ['pointSpriteOn', 'pointSprite', 'point sprite [SPRITE] on peer [PEER] in direction [DIRECTION]'],
    ['sizeSpriteOn', 'sizeSprite', 'set sprite [SPRITE] on peer [PEER] size to [SIZE] %'],
    ['showSpriteOn', 'showSprite', 'show sprite [SPRITE] on peer [PEER]'],
    ['hideSpriteOn', 'hideSprite', 'hide sprite [SPRITE] on peer [PEER]'],
    ['spriteXFrom', 'spriteX', 'sprite [SPRITE] x on peer [PEER]'],
    ['spriteYFrom', 'spriteY', 'sprite [SPRITE] y on peer [PEER]']
];

class PeerSessions {
    getInfo () {
        const blocks = [
                {opcode: 'connected', blockType: BlockType.BOOLEAN, text: 'peer selected?'},
                {opcode: 'peerName', blockType: BlockType.REPORTER, text: 'selected peer'},
                {opcode: 'selectPeer', blockType: BlockType.COMMAND, text: 'select peer [NAME]',
                    arguments: {NAME: {type: ArgumentType.STRING, defaultValue: 'Phone'}}},
                {opcode: 'takePhoto', blockType: BlockType.COMMAND, text: 'take photo on peer'},
                {opcode: 'lastPhoto', blockType: BlockType.REPORTER, text: 'last peer photo'},
                {opcode: 'photoWidth', blockType: BlockType.REPORTER, text: 'peer photo width'},
                {opcode: 'photoHeight', blockType: BlockType.REPORTER, text: 'peer photo height'},
                {opcode: 'photoColor', blockType: BlockType.REPORTER,
                    text: 'peer photo color at x [X] y [Y]', arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 100},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 100}
                    }},
                {opcode: 'photoBrightness', blockType: BlockType.REPORTER,
                    text: 'peer photo brightness at x [X] y [Y]', arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 100},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 100}
                    }},
                {opcode: 'sendProject', blockType: BlockType.COMMAND, text: 'send project and code to peer'},
                {opcode: 'sendCode', blockType: BlockType.COMMAND, text: 'send Code tab to peer'},
                {opcode: 'requestProject', blockType: BlockType.COMMAND, text: 'get project and code from peer'},
                {opcode: 'requestCode', blockType: BlockType.COMMAND, text: 'get Code tab from peer'},
                {opcode: 'run', blockType: BlockType.COMMAND, text: 'run peer project'},
                {opcode: 'stop', blockType: BlockType.COMMAND, text: 'stop peer project'},
                {opcode: 'broadcast', blockType: BlockType.COMMAND, text: 'broadcast [MESSAGE] on peer',
                    arguments: {MESSAGE: {type: ArgumentType.STRING, defaultValue: 'drive'}}},
                {opcode: 'setVariable', blockType: BlockType.COMMAND,
                    text: 'set peer variable [NAME] to [VALUE]', arguments: {
                        NAME: {type: ArgumentType.STRING, defaultValue: 'speed'},
                        VALUE: {type: ArgumentType.STRING, defaultValue: '50'}
                    }},
                {opcode: 'getVariable', blockType: BlockType.REPORTER,
                    text: 'peer variable [NAME]', arguments: {
                        NAME: {type: ArgumentType.STRING, defaultValue: 'speed'}
                    }},
                {opcode: 'moveSprite', blockType: BlockType.COMMAND,
                    text: 'move peer sprite [SPRITE] to x [X] y [Y]', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }},
                {opcode: 'pointSprite', blockType: BlockType.COMMAND,
                    text: 'point peer sprite [SPRITE] in direction [DIRECTION]', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'},
                        DIRECTION: {type: ArgumentType.NUMBER, defaultValue: 90}
                    }},
                {opcode: 'sizeSprite', blockType: BlockType.COMMAND,
                    text: 'set peer sprite [SPRITE] size to [SIZE] %', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'},
                        SIZE: {type: ArgumentType.NUMBER, defaultValue: 100}
                    }},
                {opcode: 'showSprite', blockType: BlockType.COMMAND,
                    text: 'show peer sprite [SPRITE]', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'}
                    }},
                {opcode: 'hideSprite', blockType: BlockType.COMMAND,
                    text: 'hide peer sprite [SPRITE]', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'}
                    }},
                {opcode: 'spriteX', blockType: BlockType.REPORTER,
                    text: 'peer sprite [SPRITE] x', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'}
                    }},
                {opcode: 'spriteY', blockType: BlockType.REPORTER,
                    text: 'peer sprite [SPRITE] y', arguments: {
                        SPRITE: {type: ArgumentType.STRING, defaultValue: 'Sprite1'}
                    }}
        ];
        return {
            id: 'peersessions',
            name: 'Peer Sessions',
            color1: '#157D9A',
            color2: '#116981',
            blocks: [
                ...blocks,
                {opcode: 'hasPeer', blockType: BlockType.BOOLEAN, text: 'peer [PEER] paired?',
                    arguments: {PEER: {type: ArgumentType.STRING, defaultValue: 'Phone'}}},
                ...NAMED_BLOCKS.map(([opcode, baseOpcode, text]) => {
                    const base = blocks.find(block => block.opcode === baseOpcode);
                    return {
                        ...base,
                        opcode,
                        text,
                        arguments: {...base.arguments,
                            PEER: {type: ArgumentType.STRING, defaultValue: 'Phone'}}
                    };
                })
            ]
        };
    }

    api () {
        const api = typeof window !== 'undefined' && window.__brickwrightPeers;
        if (!api) throw new Error('Peer Sessions requires the Brickwright native app');
        return api;
    }
    connected () { return Boolean(this.api()?.selected()); }
    peerName () { return this.api()?.selected() || ''; }
    selectPeer (args) { this.api()?.select(String(args.NAME)); }
    async takePhoto () { await this.api()?.capture(); }
    lastPhoto () { return this.api()?.lastPhoto() || ''; }
    photoWidth () { return this.api()?.width() || 0; }
    photoHeight () { return this.api()?.height() || 0; }
    photoColor (args) { return this.api()?.pixelColor(args.X, args.Y) || ''; }
    photoBrightness (args) { return this.api()?.pixelBrightness(args.X, args.Y) || 0; }
    async sendProject () { await this.api()?.sendProject(); }
    async sendCode () { await this.api()?.sendCode(); }
    async requestProject () { await this.api()?.requestProject(); }
    async requestCode () { await this.api()?.requestCode(); }
    async run () { await this.api()?.run(); }
    async stop () { await this.api()?.stop(); }
    async broadcast (args) { await this.api()?.broadcast(args.MESSAGE); }
    async setVariable (args) { await this.api()?.setVariable(args.NAME, args.VALUE); }
    async getVariable (args) { return this.api()?.getVariable(args.NAME); }
    async moveSprite (args) { await this.api()?.moveSprite(args.SPRITE, args.X, args.Y); }
    async pointSprite (args) { await this.api()?.pointSprite(args.SPRITE, args.DIRECTION); }
    async sizeSprite (args) { await this.api()?.sizeSprite(args.SPRITE, args.SIZE); }
    async showSprite (args) { await this.api()?.showSprite(args.SPRITE, true); }
    async hideSprite (args) { await this.api()?.showSprite(args.SPRITE, false); }
    async spriteX (args) { return (await this.api()?.getSprite(args.SPRITE))?.x || 0; }
    async spriteY (args) { return (await this.api()?.getSprite(args.SPRITE))?.y || 0; }
    hasPeer (args) { return this.api().has(String(args.PEER)); }
    async takePhotoFrom (args) { await this.api().capture(String(args.PEER)); }
    lastPhotoFrom (args) { return this.api().lastPhoto(String(args.PEER)); }
    photoWidthFrom (args) { return this.api().width(String(args.PEER)); }
    photoHeightFrom (args) { return this.api().height(String(args.PEER)); }
    photoColorFrom (args) { return this.api().pixelColor(args.X, args.Y, String(args.PEER)); }
    photoBrightnessFrom (args) { return this.api().pixelBrightness(args.X, args.Y, String(args.PEER)); }
    async sendProjectTo (args) { await this.api().sendProject(String(args.PEER)); }
    async sendCodeTo (args) { await this.api().sendCode(String(args.PEER)); }
    async requestProjectFrom (args) { await this.api().requestProject(String(args.PEER)); }
    async requestCodeFrom (args) { await this.api().requestCode(String(args.PEER)); }
    async runOn (args) { await this.api().run(String(args.PEER)); }
    async stopOn (args) { await this.api().stop(String(args.PEER)); }
    async broadcastOn (args) { await this.api().broadcast(args.MESSAGE, String(args.PEER)); }
    async setVariableOn (args) { await this.api().setVariable(args.NAME, args.VALUE, String(args.PEER)); }
    async getVariableFrom (args) { return this.api().getVariable(args.NAME, String(args.PEER)); }
    async moveSpriteOn (args) {
        await this.api().moveSprite(args.SPRITE, args.X, args.Y, String(args.PEER));
    }
    async pointSpriteOn (args) {
        await this.api().pointSprite(args.SPRITE, args.DIRECTION, String(args.PEER));
    }
    async sizeSpriteOn (args) { await this.api().sizeSprite(args.SPRITE, args.SIZE, String(args.PEER)); }
    async showSpriteOn (args) { await this.api().showSprite(args.SPRITE, true, String(args.PEER)); }
    async hideSpriteOn (args) { await this.api().showSprite(args.SPRITE, false, String(args.PEER)); }
    async spriteXFrom (args) { return (await this.api().getSprite(args.SPRITE, String(args.PEER)))?.x || 0; }
    async spriteYFrom (args) { return (await this.api().getSprite(args.SPRITE, String(args.PEER)))?.y || 0; }
}

module.exports = PeerSessions;
