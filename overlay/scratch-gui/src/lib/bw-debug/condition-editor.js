/**
 * Condition editor — the replacement for `window.prompt`.
 *
 * A small popup with dropdowns for variable names and operators, plus a number
 * input. The grammar is deliberately tiny (condition.js) and the editor makes
 * it impossible to violate: every selectable combination is valid.
 *
 * Multiple clauses are joined with and/or via an "add clause" button.
 *
 * @module
 */

const OPS = ['>', '<', '>=', '<=', '=', '!='];

const STYLES = `
.bw-cond-editor {
    position: fixed;
    z-index: 10000;
    background: #1a1a2e;
    border: 2px solid #3d7ea6;
    border-radius: 8px;
    padding: 12px 14px;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #ecf0f1;
    box-shadow: 0 6px 20px rgba(0,0,0,.5);
    min-width: 260px;
    max-width: 360px;
}
.bw-cond-editor .bw-cond-title {
    font-weight: 600;
    margin-bottom: 8px;
    color: #bdc3c7;
    font-size: 12px;
}
.bw-cond-editor .bw-cond-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}
.bw-cond-editor .bw-cond-joiner {
    font-size: 11px;
    color: #7f8c8d;
    margin: 2px 0 4px 4px;
}
.bw-cond-editor select,
.bw-cond-editor input[type="number"] {
    background: #16213e;
    border: 1px solid #2c3e50;
    border-radius: 4px;
    color: #ecf0f1;
    padding: 4px 6px;
    font: inherit;
    font-size: 12px;
}
.bw-cond-editor select { flex: 1; min-width: 0; }
.bw-cond-editor input[type="number"] { width: 64px; }
.bw-cond-editor .bw-cond-buttons {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    justify-content: flex-end;
}
.bw-cond-editor button {
    background: #2c3e50;
    border: 1px solid #3d5a80;
    border-radius: 4px;
    color: #ecf0f1;
    padding: 5px 12px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}
.bw-cond-editor button:hover { background: #34495e; }
.bw-cond-editor button.bw-cond-ok { background: #2980b9; border-color: #3498db; }
.bw-cond-editor button.bw-cond-ok:hover { background: #3498db; }
.bw-cond-editor .bw-cond-add {
    font-size: 11px;
    color: #3498db;
    cursor: pointer;
    margin-top: 2px;
}
.bw-cond-editor .bw-cond-add:hover { text-decoration: underline; }
.bw-cond-editor .bw-cond-remove {
    cursor: pointer;
    color: #e74c3c;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
}
.bw-cond-editor .bw-cond-error {
    color: #e74c3c;
    font-size: 11px;
    margin-top: 4px;
}
`;

let styleInjected = false;

const TEXT = {
    en: {
        title: 'Pause here when:',
        addClause: '+ add condition',
        ok: 'Set', cancel: 'Cancel', clear: 'Remove',
        noVars: '(no variables)',
    },
    de: {
        title: 'Hier anhalten, wenn:',
        addClause: '+ Bedingung hinzufügen',
        ok: 'Setzen', cancel: 'Abbrechen', clear: 'Entfernen',
        noVars: '(keine Variablen)',
    }
};

/**
 * @typedef {object} Clause
 * @property {string} variable
 * @property {string} op
 * @property {number} value
 * @property {string} joiner  'and' | 'or' (ignored for first clause)
 */

/**
 * Parse an existing condition source back into clauses for editing.
 * @param {string} source
 * @param {string[]} variables
 * @returns {Clause[]}
 */
function parseClauses(source, variables) {
    if (!source) return [{ variable: variables[0] || '', op: '>', value: 0, joiner: 'and' }];
    const parts = source.split(/\s+(and|or)\s+/i);
    const clauses = [];
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
            if (clauses.length) clauses[clauses.length - 1].joiner = parts[i].toLowerCase();
            continue;
        }
        const m = parts[i].match(/^(.+?)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/);
        if (m) {
            clauses.push({
                variable: m[1].trim(),
                op: m[2] === '==' ? '=' : m[2] === '<>' ? '!=' : m[2],
                value: Number(m[3]) || 0,
                joiner: 'and'
            });
        }
    }
    return clauses.length ? clauses : [{ variable: variables[0] || '', op: '>', value: 0, joiner: 'and' }];
}

/**
 * Serialize clauses back to condition source.
 * @param {Clause[]} clauses
 * @returns {string}
 */
function serializeClauses(clauses) {
    return clauses.map((c, i) => {
        const cmp = `${c.variable} ${c.op} ${c.value}`;
        return i === 0 ? cmp : `${c.joiner} ${cmp}`;
    }).join(' ');
}

/**
 * Show the condition editor popup near a screen position.
 *
 * @param {object} opts
 * @param {number} opts.x  screen X to anchor near
 * @param {number} opts.y  screen Y to anchor near
 * @param {string[]} opts.variables  available variable names
 * @param {string} opts.existing  current condition source, or ''
 * @param {string} opts.locale  'en' | 'de'
 * @param {(source: string | null) => void} opts.onDone  null = cancelled, '' = cleared
 */
export function showConditionEditor({ x, y, variables, existing, locale, onDone }) {
    if (!styleInjected) {
        const s = document.createElement('style');
        s.textContent = STYLES;
        document.head.appendChild(s);
        styleInjected = true;
    }

    const words = TEXT[locale] || TEXT.en;
    const vars = variables.length ? variables : [];

    // Remove any existing editor.
    const old = document.querySelector('.bw-cond-editor');
    if (old) old.remove();

    const el = document.createElement('div');
    el.className = 'bw-cond-editor';
    document.body.appendChild(el);

    let clauses = parseClauses(existing, vars);

    function render() {
        el.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'bw-cond-title';
        title.textContent = words.title;
        el.appendChild(title);

        clauses.forEach((clause, idx) => {
            // Joiner between clauses
            if (idx > 0) {
                const joinerRow = document.createElement('div');
                joinerRow.className = 'bw-cond-row';
                const joinerSel = document.createElement('select');
                joinerSel.style.width = '60px';
                joinerSel.style.flex = 'none';
                for (const j of ['and', 'or']) {
                    const opt = document.createElement('option');
                    opt.value = j; opt.textContent = j;
                    if (clause.joiner === j) opt.selected = true;
                    joinerSel.appendChild(opt);
                }
                joinerSel.addEventListener('change', () => { clause.joiner = joinerSel.value; });
                joinerRow.appendChild(joinerSel);

                const remove = document.createElement('span');
                remove.className = 'bw-cond-remove';
                remove.textContent = '×';
                remove.title = 'remove';
                remove.addEventListener('click', () => { clauses.splice(idx, 1); render(); });
                joinerRow.appendChild(remove);
                el.appendChild(joinerRow);
            }

            const row = document.createElement('div');
            row.className = 'bw-cond-row';

            // Variable dropdown
            const varSel = document.createElement('select');
            if (!vars.length) {
                const opt = document.createElement('option');
                opt.textContent = words.noVars; opt.disabled = true;
                varSel.appendChild(opt);
            }
            for (const v of vars) {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                if (clause.variable === v) opt.selected = true;
                varSel.appendChild(opt);
            }
            varSel.addEventListener('change', () => { clause.variable = varSel.value; });
            row.appendChild(varSel);

            // Operator dropdown
            const opSel = document.createElement('select');
            opSel.style.width = '50px'; opSel.style.flex = 'none';
            for (const op of OPS) {
                const opt = document.createElement('option');
                opt.value = op; opt.textContent = op;
                if (clause.op === op) opt.selected = true;
                opSel.appendChild(opt);
            }
            opSel.addEventListener('change', () => { clause.op = opSel.value; });
            row.appendChild(opSel);

            // Number input
            const numInput = document.createElement('input');
            numInput.type = 'number';
            numInput.value = clause.value;
            numInput.addEventListener('input', () => { clause.value = Number(numInput.value) || 0; });
            row.appendChild(numInput);

            el.appendChild(row);
        });

        // Add clause link
        const add = document.createElement('div');
        add.className = 'bw-cond-add';
        add.textContent = words.addClause;
        add.addEventListener('click', () => {
            clauses.push({ variable: vars[0] || '', op: '>', value: 0, joiner: 'and' });
            render();
        });
        el.appendChild(add);

        // Buttons
        const buttons = document.createElement('div');
        buttons.className = 'bw-cond-buttons';

        if (existing) {
            const clearBtn = document.createElement('button');
            clearBtn.textContent = words.clear;
            clearBtn.addEventListener('click', () => { cleanup(); onDone(''); });
            buttons.appendChild(clearBtn);
        }

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = words.cancel;
        cancelBtn.addEventListener('click', () => { cleanup(); onDone(null); });
        buttons.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.className = 'bw-cond-ok';
        okBtn.textContent = words.ok;
        okBtn.addEventListener('click', () => {
            const source = serializeClauses(clauses);
            cleanup();
            onDone(source);
        });
        buttons.appendChild(okBtn);

        el.appendChild(buttons);
    }

    function cleanup() {
        el.remove();
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (e.key === 'Escape') { cleanup(); onDone(null); }
        if (e.key === 'Enter') {
            const source = serializeClauses(clauses);
            cleanup();
            onDone(source);
        }
    }
    document.addEventListener('keydown', onKey);

    render();

    // Position near the click, keeping it on screen.
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - rect.width - 12)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - rect.height - 12)}px`;
}
