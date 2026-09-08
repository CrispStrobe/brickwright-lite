import {toEditorDraft, fromEditorDraft} from './editor-draft.js';

/** Logical topology editor. Applying reconstructs a board; never edits live nets. */
export function openDraftPanel(recipe, apply, savedDraft = null) {
    let draft = savedDraft ? JSON.parse(JSON.stringify(savedDraft)) : toEditorDraft(recipe, {enabled: true});
    fromEditorDraft(draft, {enabled: true});
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Experimental board draft editor');
    dialog.dataset.testid = 'harris-draft';
    Object.assign(dialog.style, {width: 'min(1000px, 92vw)', maxHeight: '90vh', overflow: 'auto', padding: '20px'});
    const add = (tag, text, parent = dialog) => {
        const element = document.createElement(tag); element.textContent = text; parent.appendChild(element); return element;
    };
    const run = action => { try { action(); } catch (error) { status.textContent = `Refused: ${error.message}`; } };
    const button = (text, action) => { const node = add('button', text); node.onclick = () => run(action); return node; };
    const input = (text, type = 'text') => { const label = add('label', text); const node = add('input', '', label); node.type = type; return node; };
    const select = text => {
        const label = add('label', text), node = add('select', '', label);
        node.setAttribute('aria-label', text.trim()); return node;
    };
    const options = (select, values) => {
        const previous = select.value;
        select.replaceChildren();
        for (const value of values) { const option = add('option', value, select); option.value = value; }
        if (values.includes(previous)) select.value = previous;
    };
    const close = () => { dialog.close(); dialog.remove(); };
    add('h2', 'Experimental board draft');
    add('p', 'Logical block overview, not physical package pins or breadboard placement. Changes are staged. Apply starts a fresh board; Close discards edits. Only this fixed part inventory is supported.');
    button('Close draft', close);
    dialog.oncancel = event => { event.preventDefault(); close(); };
    const status = add('p', 'Draft only; running board unchanged.'); status.setAttribute('role', 'status'); status.dataset.testid = 'draft-status';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '-50 -50 1000 750');
    svg.setAttribute('aria-label', 'Logical board topology'); svg.style.width = '100%'; svg.style.height = '350px'; dialog.appendChild(svg);
    const part = select('Part to position '), x = input('Part X ', 'number'), y = input('Part Y ', 'number');
    const selectedWire = select('Wire to inspect or remove ');
    const from = select('From part '), fromPin = select('From terminal '), to = select('To part '), toPin = select('To terminal ');
    function populatePins() {
        options(fromPin, draft.circuit.parts.find(p => p.id === from.value).terminals);
        options(toPin, draft.circuit.parts.find(p => p.id === to.value).terminals);
    }
    function position() { const p = draft.circuit.parts.find(p => p.id === part.value); x.value = p.x; y.value = p.y; }
    function draw() {
        svg.replaceChildren();
        const element = (tag, attributes, text) => {
            const node = document.createElementNS(ns, tag);
            for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
            if (text) node.textContent = text; svg.appendChild(node); return node;
        };
        const lookup = new Map(draft.circuit.parts.map(p => [p.id, p]));
        for (const w of draft.circuit.wires) {
            const a = lookup.get(w.from.part), b = lookup.get(w.to.part), selected = w.id === selectedWire.value;
            const line = element('line', {x1: a.x + 60, y1: a.y + 25, x2: b.x + 60, y2: b.y + 25,
                stroke: selected ? '#d33' : '#789', 'stroke-width': selected ? 4 : 1, opacity: selected ? 1 : 0.15});
            line.dataset.wire = w.id;
        }
        for (const p of draft.circuit.parts) {
            const box = element('rect', {x: p.x, y: p.y, width: 130, height: 50, fill: p.id === part.value ? '#cde' : '#eef', stroke: '#345', rx: 5});
            box.dataset.part = p.id;
            box.onclick = () => { part.value = p.id; position(); draw(); };
            const label = element('text', {x: p.x + 8, y: p.y + 29, 'font-size': 14, 'pointer-events': 'none'}, p.id);
            label.setAttribute('aria-hidden', 'true');
        }
    }
    function refresh() {
        const ids = draft.circuit.parts.map(p => p.id);
        options(part, ids); options(from, ids); options(to, ids); populatePins(); position();
        options(selectedWire, draft.circuit.wires.map(w => w.id));
        for (const option of selectedWire.options) {
            const w = draft.circuit.wires.find(w => w.id === option.value);
            option.textContent = `${w.id}: ${w.from.part}.${w.from.terminal} → ${w.to.part}.${w.to.terminal}`;
        }
        draw();
    }
    part.onchange = () => { position(); draw(); };
    selectedWire.onchange = draw; from.onchange = populatePins; to.onchange = populatePins;
    button('Move part', () => {
        const next = JSON.parse(JSON.stringify(draft)), p = next.circuit.parts.find(p => p.id === part.value);
        if (!x.value.trim() || !y.value.trim()) throw new Error('Coordinates required.');
        p.x = Number(x.value); p.y = Number(y.value); fromEditorDraft(next, {enabled: true});
        draft = next; draw(); status.textContent = 'Layout staged; no electrical change.';
    });
    button('Remove wire', () => {
        if (!selectedWire.value) throw new Error('Select a wire.');
        draft.circuit.wires = draft.circuit.wires.filter(w => w.id !== selectedWire.value); refresh();
        status.textContent = 'Wire removal staged; Apply validates the new board.';
    });
    button('Connect terminals', () => {
        const next = JSON.parse(JSON.stringify(draft)); let index = 0;
        while (next.circuit.wires.some(w => w.id === `edit_${index}`)) index++;
        next.circuit.wires.push({id: `edit_${index}`, from: {part: from.value, terminal: fromPin.value}, to: {part: to.value, terminal: toPin.value}});
        fromEditorDraft(next, {enabled: true}); draft = next; refresh(); status.textContent = 'Connection staged.';
    });
    const json = add('textarea', ''); json.setAttribute('aria-label', 'Editor draft JSON'); json.rows = 4; json.style.width = '100%';
    button('Export draft JSON', () => { json.value = JSON.stringify(draft); status.textContent = 'Draft exported with layout; not a live snapshot.'; });
    button('Import draft JSON', () => {
        if (json.value.length > 2000000) throw new Error('Draft limit is 2 MB.');
        const next = JSON.parse(json.value); fromEditorDraft(next, {enabled: true}); draft = next; refresh(); status.textContent = 'Imported draft; board unchanged until Apply.';
    });
    button('Apply draft to fresh board', () => {
        const recipe = fromEditorDraft(draft, {enabled: true}); apply(recipe, JSON.parse(JSON.stringify(draft))); close();
    });
    refresh(); document.body.appendChild(dialog); dialog.showModal(); return close;
}
