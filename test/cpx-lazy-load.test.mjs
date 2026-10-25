import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importGuiDependency, guiDependencyFile} from './helpers/bw-integrated.mjs';

// Exercise the same source manager as the browser, rather than a rewritten loader.
assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/extension-support/extension-manager.js'), 'utf8'),
    readFileSync(new URL('../overlay/scratch-vm/src/extension-support/extension-manager.js', import.meta.url), 'utf8'),
    'the prepared VM must carry this checkout\'s extension manager');
const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
const dispatch = (await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;

test('actual CPX lazy load shares its pending request and publishes a runtime-owned board and primitives', async () => {
    const vm = new VM();
    try {
        const manager = vm.extensionManager;
        assert.equal(manager.isExtensionLoaded('circuitplayground'), false);
        assert.equal(vm.runtime.bwCpx, undefined);
        const first = manager.loadExtensionURL('circuitplayground');
        const second = manager.loadExtensionURL('circuitplayground');
        assert.equal(first, second, 'concurrent requests must share one registration');
        assert.equal(manager.isExtensionLoaded('circuitplayground'), false, 'loading must await the real chunk');
        await first;
        assert.equal(manager.isExtensionLoaded('circuitplayground'), true);
        assert.equal(manager._pendingBuiltinLoads.has('circuitplayground'), false);
        const board = vm.runtime.bwCpx;
        assert.ok(board);
        assert.ok(vm.runtime.bwCpxState);
        const service = manager._loadedExtensions.get('circuitplayground');
        const extension = dispatch.services[service];
        assert.ok(extension);
        assert.equal(extension.runtime, vm.runtime);
        assert.equal(typeof vm.runtime._primitives.circuitplayground_setbrightness, 'function');
        vm.runtime._primitives.circuitplayground_setbrightness({BRIGHTNESS: 23}, {});
        assert.equal(vm.runtime.bwCpxState.brightness, 23);
        await manager.loadProjectExtension('circuitplayground', 'https://invalid.example/foreign.js');
        assert.equal(vm.runtime.bwCpx, board, 'project builtin precedence must keep the original board');
        assert.equal(manager._loadedExtensions.get('circuitplayground'), service);
        assert.equal(Object.keys(dispatch.services).filter(name => /_circuitplayground$/.test(name)).length, 1);
    } finally {
        vm.quit();
    }
});
