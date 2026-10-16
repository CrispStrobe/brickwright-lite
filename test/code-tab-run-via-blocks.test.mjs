import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx',
    import.meta.url), 'utf8');

test('fe, Tcl and Forth offer a board run through their blocks, not only DOS', () => {
    assert.match(source, /\['fe', 'tcl', 'forth'\]\.includes\(this\.state\.lang\) && this\.currentDevice\(\)/);
    assert.match(source, /data-testid="bw-run-via-blocks"/);
    // The run opens the debugger only after a conversion that preserved the program.
    assert.match(source, /async runViaBlocksOnDevice \(\) \{\s*await this\.compile\(\);\s*if \(this\.state\.conversionReport\?\.preserved\) showCircuitDebugger\(\);/);
    assert.doesNotMatch(source, /'(?:Lisp \(fe|Tcl \(partcl|Forth \(zForth) on DOS\)'/);
    assert.match(source, /'Tcl \(Jim: DOS, or any board via blocks\)'/);
});
