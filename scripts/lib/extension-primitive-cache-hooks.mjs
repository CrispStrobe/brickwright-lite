// Extension metadata refresh creates new primitive wrappers. Execute caches
// must be rebuilt before either refreshed metadata or new registrations run.
export function patchExtensionPrimitiveCaches(source) {
    const marker = '// Brickwright: primitive registration invalidates cached executable functions.';
    if (source.includes(marker)) return source;
    const anchor = '\n    }\n\n    /**\n     * Convert the given extension menu items into the scratch-blocks style of list of pairs.';
    if (source.split(anchor).length !== 2) throw new Error('runtime.js extension primitive cache anchor missing or ambiguous');
    return source.replace(anchor, `
        ${marker}
        const containers = new Set([
            ...this.targets.map(target => target.blocks),
            this.flyoutBlocks,
            this.monitorBlocks
        ]);
        for (const container of containers) container.resetCache();
` + anchor);
}
