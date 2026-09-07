/**
 * Type a program into the Code tab's editor the way the green drive does —
 * wait for the editor, type by keyboard, then assert the text is IN it.
 *
 * 2026-09-07: four browser gates typed with the same shape — ask
 * `.cm-content`.count() ONCE and, finding none because the lazy CodeMirror
 * chunk had not mounted, fill a `textarea` the mounting editor had just
 * replaced, with a literal 8 s budget written on a quiet runner. The export
 * gate went red twice on main that way with the fleet eight deep (runs
 * 34098309971, 34113154528: "waiting for locator('textarea').first()"), while
 * every other gate in the job stayed green. The owner's standing rule made the
 * green drive (verify-i8086-browser.mjs, which waits on `.cm-content`'s
 * textContent) the template; this is that template, once.
 *
 * Time comes from the STEP (scripts/lib/gate-budget.mjs): the editor wait is a
 * third of the step's budget, the typed-text check a sixth, with named local
 * fallbacks and never the old literal. There is no textarea fallback: the app
 * ships CodeMirror, and an editor that never mounts is a finding with that
 * sentence.
 */
import {shareOfBudget} from './gate-budget.mjs';

/**
 * @param {import('playwright').Page} page
 * @param {string} text - the program; its first non-blank line is asserted present afterwards
 * @param {{editorWaitMs?: number, typedWaitMs?: number}} [opts]
 */
export async function typeIntoEditor (page, text, opts = {}) {
    const editorWait = opts.editorWaitMs ?? shareOfBudget(1 / 3, 60_000);
    const typedWait = opts.typedWaitMs ?? shareOfBudget(1 / 6, 20_000);
    const cm = page.locator('.cm-content').first();
    // synchronisation before the click and the typed-text check below, not an appearance
    // assertion; a miss is renamed to the finding it is  // gate-shapes-allow
    await cm.waitFor({state: 'visible', timeout: editorWait}).catch(() => {
        throw new Error(`the Code editor (.cm-content) did not mount within ${editorWait} ms — `
            + 'the lazy CodeMirror chunk never arrived, or the selector moved; nothing was typed');
    });
    await cm.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(text);
    const firstLine = (text.split('\n').find(l => l.trim()) || '').trim();
    // the state that follows: the typed text is in the editor before anything downstream is asked of it
    await page.waitForFunction(needle => (document.querySelector('.cm-content')?.textContent || '').includes(needle),
        firstLine, {timeout: typedWait});
}
