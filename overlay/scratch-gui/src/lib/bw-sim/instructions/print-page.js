// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The printable building instructions: one HTML document with a page per step
// (its picture and its "parts needed" callout) and the parts list at the end,
// which the pane opens in a new window and hands to window.print() — the
// browser's own "Save as PDF" makes the PDF, so nothing new is bundled. Pure:
// strings in, a string out (the pictures are data URLs drawn by
// view/instructions-view.js and view/part-thumbnails.js).

const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

/** One row of a callout or of the parts list: picture, count, length badge, name. */
const partCell = (row, {withName}) => `<div class="part">` +
    `<div class="pic">${row.thumb ? `<img src="${escapeHtml(row.thumb)}" alt="">` : ''}` +
    `${row.length ? `<span class="len">${row.length}</span>` : ''}</div>` +
    `<div class="count">${row.count}×</div>` +
    `${withName ? `<div class="name">${escapeHtml(row.name)}</div>` : ''}</div>`;

/**
 * @param {object} options
 * @param {string} options.lang 'en' | 'de'
 * @param {string} options.title the document's title (the model's name)
 * @param {{step: string, partsNeeded: string, partsList: string, total: string, attach: string, subassembly: string}} options.text
 *        the learner's language; {n} {total} {name} are filled in
 * @param {Array<{image: string, parts: Array<{thumb: string|null, count: number, length: number|null, name: string}>,
 *                attach: string[], subassembly: string|null}>} options.steps one per step, in order
 * @param {Array<{thumb: string|null, count: number, length: number|null, name: string, part: string}>} options.bom
 * @returns {string} an HTML document
 */
export const instructionsPrintHtml = ({lang, title, text, steps, bom}) => {
    const total = steps.length;
    const pages = steps.map((step, i) => {
        const notes = [
            ...(step.subassembly ? [fill(text.subassembly, {name: step.subassembly})] : []),
            ...step.attach.map(name => fill(text.attach, {name}))
        ];
        return `<section class="page step" data-step="${i + 1}">` +
            `<header><span class="num">${escapeHtml(fill(text.step, {n: i + 1, total}))}</span>` +
            `${notes.map(n => `<span class="note">${escapeHtml(n)}</span>`).join('')}</header>` +
            (step.parts.length ? `<div class="callout"><div class="label">${escapeHtml(text.partsNeeded)}</div>` +
                `${step.parts.map(row => partCell(row, {withName: false})).join('')}</div>` : '') +
            `<img class="shot" data-step="${i + 1}" src="${escapeHtml(step.image)}" alt="${escapeHtml(fill(text.step, {n: i + 1, total}))}">` +
            `</section>`;
    });
    const count = bom.reduce((n, row) => n + row.count, 0);
    const list = `<section class="page bom" data-bom="1"><header><span class="num">${escapeHtml(text.partsList)}</span>` +
        `<span class="note">${escapeHtml(fill(text.total, {n: count}))}</span></header>` +
        `<div class="grid">${bom.map(row => partCell(row, {withName: true})).join('')}</div></section>`;
    return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body { margin: 0; font: 14px/1.3 system-ui, sans-serif; color: #0f172a; background: #fff; }
.page { position: relative; box-sizing: border-box; padding: 12px; min-height: 180mm; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; gap: 16px; align-items: baseline; margin-bottom: 8px; }
.num { font-size: 28px; font-weight: 700; }
.note { font-size: 16px; color: #1e3a8a; }
.callout { position: absolute; top: 56px; left: 12px; display: flex; flex-wrap: wrap; gap: 8px; max-width: 45%;
  background: #e0f2fe; border: 2px solid #7dd3fc; border-radius: 8px; padding: 8px; }
.callout .label { width: 100%; font-weight: 600; font-size: 12px; color: #075985; }
.shot { display: block; width: 100%; max-height: 165mm; object-fit: contain; }
.part { display: flex; flex-direction: column; align-items: center; min-width: 64px; }
.pic { position: relative; width: 64px; height: 64px; }
.pic img { width: 64px; height: 64px; }
.len { position: absolute; right: -4px; bottom: -2px; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #0f172a;
  background: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.count { font-weight: 700; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.bom .part { flex-direction: row; gap: 8px; align-items: center; justify-content: flex-start; }
.bom .name { font-size: 12px; }
</style></head><body>${pages.join('')}${list}</body></html>`;
};
