(function (Scratch) {
    'use strict';

    class CapabilityProbe {
        getInfo () {
            return {
                id: 'capabilityprobe',
                name: 'Capability broker proof',
                blocks: [
                    {opcode: 'allowed', blockType: Scratch.BlockType.REPORTER, text: 'allowed capability'},
                    {opcode: 'sequence', blockType: Scratch.BlockType.REPORTER, text: 'sequential capabilities'},
                    {opcode: 'undeclared', blockType: Scratch.BlockType.REPORTER, text: 'undeclared capability'}
                ]
            };
        }

        allowed () {
            return Scratch.capabilities.request('project.metadata.read', {field: 'locale'});
        }

        async sequence () {
            const first = await Scratch.capabilities.request('project.metadata.read', {field: 'title'});
            const second = await Scratch.capabilities.request('project.metadata.read', {field: 'locale'});
            return `${first}|${second}`;
        }

        async undeclared () {
            try {
                await Scratch.capabilities.request('project.metadata.read', {field: 'locale'});
                return 'UNEXPECTED_ALLOW';
            } catch (error) {
                return JSON.stringify({code: error.code, message: error.message});
            }
        }
    }

    Scratch.extensions.register(new CapabilityProbe());
})(Scratch);
