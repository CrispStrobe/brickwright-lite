/** Preserve Scratch procedure recursion checks around Arcade managed callers. */
export function patchArcadeManagedThread(source) {
    const marker = '// Brickwright: managed Arcade callers own a non-executable root frame.';
    if (source.includes(marker)) return source;
    const entry = '    isRecursiveCall (procedureCode) {\n';
    const lookup = '            const block = this.target.blocks.getBlock(this.stack[i]);\n';
    if (!source.includes(entry) || !source.includes(lookup)) throw new Error('thread.js managed procedure anchors missing');
    source = source.replace(entry, entry + `        ${marker}\n        const managed = this.bwFunctionNames instanceof Set;\n        if (managed && this.bwFunctionNames.has(procedureCode)) return true;\n`);
    return source.replace(lookup, `            // Only the managed invocation root is a legitimate absent block.\n            // Do not conceal deleted/malformed executable blocks.\n            if (managed && i === 0 && this.stack[i] === null) continue;\n` + lookup);
}
