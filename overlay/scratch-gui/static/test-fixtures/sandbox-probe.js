(function (Scratch) {
    'use strict';

    class SandboxProbe {
        getInfo () {
            return {
                id: 'sandboxprobe',
                name: 'Sandbox probe',
                blocks: [{
                    opcode: 'inspect',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'inspect sandbox'
                }]
            };
        }

        inspect () {
            return JSON.stringify({
                unsandboxed: Scratch.extensions.unsandboxed,
                document: typeof document,
                editor: typeof Scratch.vm,
                nativeBridge: typeof self.__TAURI_INTERNALS__
            });
        }
    }

    Scratch.extensions.register(new SandboxProbe());
}(Scratch));
