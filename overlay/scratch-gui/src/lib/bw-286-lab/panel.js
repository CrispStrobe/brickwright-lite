/** Imperative, lazy-loaded lab. No project, editor, storage or debug-target mutation. */
export function openHarrisLab () {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Experimental 286 board lab');
    dialog.dataset.testid = 'harris-lab';
    Object.assign(dialog.style, {width: 'min(850px, 90vw)', maxHeight: '85vh', overflow: 'auto',
        padding: '20px', borderRadius: '8px', color: '#222', background: '#fff'});
    const add = (tag, text, parent = dialog) => {
        const node = document.createElement(tag); node.textContent = text; parent.appendChild(node); return node;
    };
    const button = (label, action) => {
        const node = add('button', label); node.type = 'button'; node.onclick = action;
        node.style.margin = '4px'; return node;
    };
    add('h2', 'Experimental 286 board lab');
    add('p', 'Isolated fixed-profile board, not your project. Limited real-mode instruction subset; no general 286, protected mode, interrupts, hardware timing or live snapshots. Saved JSON is a construction recipe, not running state.');
    let runtime, session, savedDraft = null, closeDraft = null, busy = false, closed = false, running = false, generation = 0;
    const close = () => {
        closed = true; generation++; running = false; closeDraft?.(); session?.cancel(); dialog.close(); dialog.remove();
    };
    button('Close board lab', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    const enable = button('Enable experimental board lab', async () => {
        enable.disabled = true;
        status.textContent = 'Loading isolated experimental engine…';
        try {
            runtime = await import(/* webpackChunkName: "bw-286-engine" */ './runtime.js');
            if (closed) return;
            controls.disabled = false; status.textContent = 'Enabled for this dialog only. Load a demo or saved recipe.';
        } catch (error) { if (!closed) { status.textContent = error.message; enable.disabled = false; } }
    });
    const status = add('p', 'Disabled. Enabling does not change project CPU settings.');
    status.setAttribute('role', 'status'); status.dataset.testid = 'harris-status';
    const controls = add('fieldset', ''); controls.disabled = true;
    const move = node => { controls.appendChild(node); return node; };
    const operationButtons = [];
    const operation = (label, action) => {
        const node = move(button(label, () => guard(action))); operationButtons.push(node); return node;
    };
    const update = () => {
        if (closed) return;
        for (const node of operationButtons) node.disabled = busy;
        pause.disabled = !running;
        state.textContent = session ? JSON.stringify(session.inspect(), null, 2) : 'No board loaded.';
    };
    const guard = async action => {
        if (busy || closed) return;
        try { await action(); } catch (error) { status.textContent = `Refused: ${error.message}`; }
        update();
    };
    const requireSession = () => { if (!session) throw new Error('Load a board first.'); return session; };
    const replace = recipe => {
        // Validate and initialize replacement before discarding the prior board.
        const next = runtime.load(recipe); next.initialize();
        session?.cancel(); session = next; savedDraft = null; status.textContent = 'Fresh board initialized; paused before reset instruction.';
    };
    operation('Load owned loop demo', () => replace(runtime.demo()));
    operation('Edit board draft', async () => {
        const recipe = requireSession().exportConfiguration(); busy = true; update();
        try {
            const {openDraftPanel} = await import(/* webpackChunkName: "bw-286-draft" */ './draft-panel.js');
            if (closed) return;
            closeDraft = openDraftPanel(recipe, (next, draft) => { replace(next); savedDraft = draft; update(); }, savedDraft);
        } finally { busy = false; update(); }
    });
    operation('Load recipe JSON', () => {
        if (json.value.length > 2000000) throw new Error('Recipe limit is 2 MB.');
        replace(json.value);
    });
    operation('Export recipe JSON', () => {
        json.value = JSON.stringify(requireSession().exportConfiguration());
        status.textContent = 'Original construction recipe exported below; no live RAM or registers.';
    });
    operation('Download recipe', () => {
        const blob = new Blob([JSON.stringify(requireSession().exportConfiguration())], {type: 'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'experimental-286.circuit.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const fileLabel = add('label', 'Import recipe file ', controls);
    const file = add('input', '', fileLabel); file.type = 'file'; file.accept = '.json,application/json';
    file.onchange = async () => {
        const selected = file.files[0]; if (!selected || busy) return;
        const ticket = generation;
        if (selected.size > 2000000) { status.textContent = 'Refused: recipe limit is 2 MB.'; return; }
        busy = true; update();
        try {
            const text = await selected.text();
            if (closed || ticket !== generation) return;
            json.value = text; replace(text);
        } catch (error) { if (!closed) status.textContent = `Refused: ${error.message}`; }
        finally { busy = false; update(); }
    };
    const json = add('textarea', '', controls); json.setAttribute('aria-label', 'Board recipe JSON');
    json.rows = 4; json.style.width = '100%'; json.spellcheck = false;
    operation('Step clock', () => { requireSession().stepClock(); status.textContent = 'One modeled clock.'; });
    operation('Step instruction', () => { status.textContent = requireSession().stepInstruction(256).reason; });
    operation('Run up to 4096 clocks', () => {
        requireSession(); busy = true; running = true; update();
        const ticket = ++generation;
        let clocks = 0;
        const chunk = () => {
            if (closed || ticket !== generation) return;
            try {
                if (!running) { status.textContent = 'Paused; partial instruction retained.'; return; }
                const result = session.run(Math.min(16, 4096 - clocks)); clocks += result.clocks;
                status.textContent = `${result.reason}; ${clocks} modeled clocks`;
                if (result.reason === 'budget-exhausted' && clocks < 4096) { setTimeout(chunk, 0); return; }
                running = false;
            } catch (error) { status.textContent = `Fault: ${error.message}`; running = false; }
            finally {
                if (!running) { busy = false; update(); }
            }
        };
        setTimeout(chunk, 0);
    });
    const pause = move(button('Pause', () => { running = false; })); pause.disabled = true;
    const bpLabel = add('label', ' Physical breakpoint (hex) ', controls);
    const breakpoint = add('input', '', bpLabel); breakpoint.value = 'FFFFF0';
    const address = () => {
        if (!/^(?:0x)?[0-9a-f]{1,6}$/i.test(breakpoint.value.trim())) throw new Error('Use a 24-bit hexadecimal address.');
        return Number.parseInt(breakpoint.value.trim().replace(/^0x/i, ''), 16);
    };
    operation('Set breakpoint', () => { requireSession().setBreakpoint(address()); status.textContent = 'Breakpoint set.'; });
    operation('Clear breakpoint', () => { requireSession().clearBreakpoint(address()); status.textContent = 'Breakpoint cleared.'; });
    const bankLabel = add('label', ' Memory bank ', controls);
    const bank = add('select', '', bankLabel);
    for (const id of ['ram0', 'ram1', 'rom0', 'rom1']) { const option = add('option', id, bank); option.value = id; }
    operation('Inspect bank', () => {
        const memory = requireSession().inspectBank(bank.value);
        inspection.textContent = `${bank.value}: ${memory.bytes.length} bytes, writes=${memory.writes}\n` +
            '0280h–028Fh: ' + [...memory.bytes.slice(0x280, 0x290)].map(b => b.toString(16).padStart(2, '0')).join(' ');
    });
    const netLabel = add('label', ' Net endpoint ', controls);
    const net = add('input', '', netLabel); net.value = 'cpu.ready_n';
    operation('Inspect net', () => {
        const match = /^([\w-]+)\.([\w-]+)$/.exec(net.value.trim());
        if (!match) throw new Error('Use part.pin.');
        inspection.textContent = JSON.stringify(requireSession().inspectNet(match[1], match[2]), null, 2);
    });
    const inspection = add('pre', '', controls); inspection.dataset.testid = 'harris-inspection';
    const state = add('pre', 'No board loaded.', controls); state.dataset.testid = 'harris-state';
    document.body.appendChild(dialog); dialog.showModal();
    return close;
}
