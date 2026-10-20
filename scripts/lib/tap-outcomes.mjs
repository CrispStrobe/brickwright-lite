// Read TAP outcome directives, keeping pending tests distinct from failures.
// A hash escaped in a test's name is not a directive.
export function tapOutcomes(tap) {
    return tap.split('\n').flatMap(line => {
        const match = /^\s*(not )?ok\s+(\d+)\b(?:\s+-)?\s*(.*)$/.exec(line);
        if (!match) return [];
        const text = match[3] || '';
        let directive = null, name = text, reason = '';
        for (let index = 0; index < text.length; index++) {
            if (text[index] !== '#') continue;
            let slashes = 0;
            for (let before = index - 1; before >= 0 && text[before] === '\\'; before--) slashes++;
            if (slashes % 2) continue;
            const suffix = /^(TODO|SKIP)(?:\s+(.*))?$/i.exec(text.slice(index + 1).trim());
            if (suffix) {
                directive = suffix[1].toUpperCase();
                name = text.slice(0, index).trimEnd();
                reason = suffix[2] || '(no reason)';
            }
            break;
        }
        return [{ok: !match[1], name, directive, reason, line}];
    });
}
