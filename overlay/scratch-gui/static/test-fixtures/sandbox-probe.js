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
                nativeBridge: typeof self.__TAURI_INTERNALS__,
                webSocket: (() => {
                    try {
                        new WebSocket('ws://127.0.0.1:20111/scratch/ble');
                        return 'opened';
                    } catch (e) {
                        return 'blocked';
                    }
                })()
            });
        }
    }

    Scratch.extensions.register(new SandboxProbe());
}(Scratch));
