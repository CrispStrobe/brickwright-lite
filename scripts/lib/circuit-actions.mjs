// Follow the intended designer's real trigger, including its portaled popup.
// Older installed suppliers keep their menu under that same designer.
const moreName = /^(?:More circuit controls|Weitere Schaltungsaktionen)$/;
const one = async (locator, label) => {
    if (await locator.count() !== 1) throw new Error(`Expected one ${label}`);
    return locator;
};

export async function openCircuitActions (page, designer, {timeout = 30000, force = false} = {}) {
    await one(designer, 'originating circuit designer');
    if (!await designer.isVisible()) throw new Error('Originating circuit designer is hidden');
    const trigger = await one(designer.getByRole('button', {name: moreName}), 'circuit actions trigger');
    const expanded = await trigger.getAttribute('aria-expanded');
    const inline = designer.locator('[data-toolbar-more-menu]');
    if (expanded !== 'true' && (expanded || !await inline.isVisible())) await trigger.click({timeout, force});
    const id = await trigger.getAttribute('aria-controls');
    const menu = id ? page.locator(`[id=${JSON.stringify(id)}]`) : inline;
    await menu.waitFor({state: 'visible', timeout});
    await one(menu, 'originating circuit actions popup');
    if (!await designer.isVisible()) throw new Error('Circuit designer changed while opening its popup');
    if (id && (await trigger.getAttribute('aria-controls') !== id ||
        await trigger.getAttribute('aria-expanded') !== 'true' || await menu.getAttribute('role') !== 'dialog')) {
        throw new Error('Circuit popup no longer belongs to its originating trigger');
    }
    return menu;
}

export async function circuitFileControl (menu, action) {
    let current;
    let legacy;
    if (action === 'open') {
        current = menu.locator('[data-editor-action="open"]');
        legacy = () => menu.getByRole('button', {name: /^📂\s*(?:Open|Öffnen)/});
    } else if (action === 'import') {
        current = menu.getByRole('button', {name: /^(?:Import|Importieren)$/});
        legacy = () => menu.getByRole('button', {name: /^📥\s*(?:Import|Importieren)/});
    } else {
        throw new Error(`Unsupported circuit file control: ${action}`);
    }
    if (await current.count()) return one(current, `${action} control in the originating popup`);
    return one(legacy(), `legacy ${action} control in the originating popup`);
}
