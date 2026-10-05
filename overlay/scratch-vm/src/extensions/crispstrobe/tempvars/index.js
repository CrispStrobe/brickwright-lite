// ID: lmsTempVars2
// Brickwright clean-room implementation of the four temporary-variable
// opcodes present in TurboWarp's public Thread vs. Runtime .sb3 sample.
// Their scope follows the documented thread/runtime distinction; no upstream
// extension implementation is imported or copied.
const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');
const Cast = require('../../../util/cast');

class TemporaryVariables {
    constructor () {
        this.byThread = new WeakMap();
        this.byRuntime = new Map();
    }

    getInfo () {
        const name = {VAR: {type: ArgumentType.STRING, defaultValue: 'variable'}};
        const change = {...name, NUM: {type: ArgumentType.NUMBER, defaultValue: 1}};
        return {id: 'lmsTempVars2', name: 'Temporary variables', color1: '#e883b1', blocks: [
            {opcode: 'changeThreadVariable', blockType: BlockType.COMMAND,
                text: 'change thread [VAR] by [NUM]', arguments: change},
            {opcode: 'getThreadVariable', blockType: BlockType.REPORTER,
                text: 'thread [VAR]', arguments: name},
            {opcode: 'changeRuntimeVariable', blockType: BlockType.COMMAND,
                text: 'change runtime [VAR] by [NUM]', arguments: change},
            {opcode: 'getRuntimeVariable', blockType: BlockType.REPORTER,
                text: 'runtime [VAR]', arguments: name}
        ]};
    }

    threadMap (util) {
        if (!util || !util.thread) throw new Error('Temporary thread variable requires a running thread');
        let vars = this.byThread.get(util.thread);
        if (!vars) { vars = new Map(); this.byThread.set(util.thread, vars); }
        return vars;
    }

    changeThreadVariable (args, util) {
        const vars = this.threadMap(util);
        const key = Cast.toString(args.VAR);
        vars.set(key, Cast.toNumber(vars.get(key) || 0) + Cast.toNumber(args.NUM));
    }
    getThreadVariable (args, util) { return this.threadMap(util).get(Cast.toString(args.VAR)) || 0; }
    changeRuntimeVariable (args) {
        const key = Cast.toString(args.VAR);
        this.byRuntime.set(key, Cast.toNumber(this.byRuntime.get(key) || 0) + Cast.toNumber(args.NUM));
    }
    getRuntimeVariable (args) { return this.byRuntime.get(Cast.toString(args.VAR)) || 0; }
}

module.exports = TemporaryVariables;
