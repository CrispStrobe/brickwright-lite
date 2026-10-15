const cachedOwner = require('../../../util/bw-cached-primitive-owner');

// Keep the Font service's direct-call and diagnostic contract.
module.exports = function fontSelectorOwner(runtime, util, args, opcode, selectors) {
    return cachedOwner(runtime, util, args, opcode, selectors, 'Arcade Font fixed fields: ');
};
