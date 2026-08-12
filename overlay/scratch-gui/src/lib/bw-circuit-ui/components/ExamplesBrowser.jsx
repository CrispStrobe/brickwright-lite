/**
 * ExamplesBrowser — gallery panel showing example circuits + programs.
 *
 * Reads examples/index.json from bw-cfront and renders categorized cards.
 * Click loads the example's circuit into the designer.
 * Presentation-only: no canvas interaction.
 */

import React, { useState, useEffect, useMemo } from 'react';

const CATEGORY_LABELS = {
  basics: 'Basics',
  analog: 'Analog',
  digital: 'Digital',
  motors: 'Motors & Actuators',
  'pure-circuit': 'Pure circuits',
};

const CATEGORY_COLORS = {
  basics: '#2ecc71',
  analog: '#f39c12',
  digital: '#9b59b6',
  motors: '#e74c3c',
  'pure-circuit': '#16a085',
};

const DIFFICULTY_LABELS = ['', 'Beginner', 'Intermediate', 'Advanced'];
const DIFFICULTY_COLORS = ['#64748b', '#22c55e', '#f59e0b', '#f97316'];
const PART_LABELS = {mcu: 'MCU', 'no-mcu': 'No MCU'};
const TARGET_LABELS = {
  'no-mcu': 'No MCU',
  generic: 'Any MCU',
  stc12: 'STC12',
  stc89: 'STC89',
  avr: 'AVR / Arduino',
  'arduino-nano': 'Arduino Nano',
  rp2040: 'RP2040 / Pico',
};

function examplePartTags(example) {
  const explicit = example.parts || example.partTags || example.components;
  const tags = Array.isArray(explicit) ? explicit.map(String) : [];
  const hasMcu = example.mcu === true || example.device || example.kind === 'program' ||
    tags.some(tag => /mcu|arduino|stc|pico|rp2040|avr|micro:bit/i.test(tag));
  tags.unshift(hasMcu ? 'mcu' : 'no-mcu');
  return [...new Set(tags)];
}

function partLabel(part) {
  if (PART_LABELS[part]) return PART_LABELS[part];
  return part.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function targetKey(target) {
  const value = String(target).toLowerCase();
  if (/arduino-nano/.test(value)) return 'arduino-nano';
  if (/arduino|atmega|avr/.test(value)) return 'avr';
  if (/pico|rp2040/.test(value)) return 'rp2040';
  if (/stc89/.test(value)) return 'stc89';
  if (/stc|8051/.test(value)) return 'stc12';
  if (/generic|any/.test(value)) return 'generic';
  return value;
}

function exampleTargetTags(example) {
  const explicit = example.targets || example.target;
  const targets = Array.isArray(explicit) ? explicit : explicit ? [explicit] : [];
  if (targets.length) return [...new Set(targets.map(targetKey))];
  if (example.device) return [targetKey(example.device)];
  if (example.kind === 'program') return ['stc12'];
  return ['no-mcu'];
}

function targetLabel(target) {
  return TARGET_LABELS[target] || target.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * @param {{ examples: Array, lang?: string, onLoadExample?: function }} props
 */
export function ExamplesBrowser({ examples, lang = 'en', onLoadExample, theme: themeProp }) {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [storedTheme, setStoredTheme] = useState(() => {
    try { return localStorage.getItem('bw-circuit-theme') || 'light'; } catch { return 'light'; }
  });
  const theme = themeProp || storedTheme;
  const dark = theme === 'dark';
  const palette = dark ? {
    panel: '#1a1a2e', border: '#2c3e50', heading: '#f8fafc', text: '#ecf0f1',
    muted: '#cbd5e1', input: '#0a0a1a', button: '#24324b', buttonBorder: '#52627a',
    card: '#16213e', cardHover: '#1e2d4a', cardBorder: '#2c3e50', accent: '#3b82f6',
  } : {
    panel: '#f8fafc', border: '#cbd5e1', heading: '#0f172a', text: '#334155',
    muted: '#475569', input: '#ffffff', button: '#e2e8f0', buttonBorder: '#94a3b8',
    card: '#ffffff', cardHover: '#eff6ff', cardBorder: '#cbd5e1', accent: '#2563eb',
  };

  useEffect(() => {
    const onTheme = event => {
      const next = event.detail && event.detail.value;
      if (next === 'light' || next === 'dark') setStoredTheme(next);
    };
    window.addEventListener('bw-circuit-theme', onTheme);
    return () => window.removeEventListener('bw-circuit-theme', onTheme);
  }, []);
  // The dedicated Examples mode is already an explicitly selected panel;
  // starting it collapsed made the mode look empty and hid its scroll area.
  const [open, setOpen] = useState(() => true);

  const categories = useMemo(() => {
    if (!examples) return [];
    return [...new Set(examples.map(e => e.category))];
  }, [examples]);

  const partTags = useMemo(() => {
    if (!examples) return [];
    return [...new Set(examples.flatMap(examplePartTags))].sort((a, b) => {
      if (a === 'mcu') return -1;
      if (b === 'mcu') return 1;
      if (a === 'no-mcu') return -1;
      if (b === 'no-mcu') return 1;
      return a.localeCompare(b);
    });
  }, [examples]);

  const targetTags = useMemo(() => {
    if (!examples) return [];
    return [...new Set(examples.flatMap(exampleTargetTags))].sort((a, b) => {
      if (a === 'no-mcu') return -1;
      if (b === 'no-mcu') return 1;
      return targetLabel(a).localeCompare(targetLabel(b));
    });
  }, [examples]);

  const filtered = useMemo(() => {
    if (!examples) return [];
    let list = examples;
    if (selectedCategory) {
      list = list.filter(e => e.category === selectedCategory);
    }
    if (selectedDifficulty) {
      list = list.filter(e => e.difficulty === selectedDifficulty);
    }
    if (selectedPart) {
      list = list.filter(e => examplePartTags(e).includes(selectedPart));
    }
    if (selectedTarget) {
      list = list.filter(e => exampleTargetTags(e).includes(selectedTarget));
    }
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(e => {
        const title = e.title?.[lang] || e.title?.en || e.id;
        return title.toLowerCase().includes(q) || e.id.includes(q) || e.category.includes(q);
      });
    }
    return list;
  }, [examples, filter, selectedCategory, selectedDifficulty, selectedPart, selectedTarget, lang]);

  if (!examples || examples.length === 0) {
    return (
      <div style={{
        background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: '8px',
        padding: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: '13px', color: palette.muted,
      }}>
        No examples available
      </div>
    );
  }

  return (
    <div data-examples-selector style={{
      background: palette.panel,
      border: `1px solid ${palette.border}`,
      borderRadius: '8px',
      padding: '8px',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      height: '100%',
      flex: '1 1 auto',
      overflow: 'hidden',
      minHeight: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        aria-label={open ? 'Collapse examples selector' : 'Expand examples selector'}
        title={open ? 'Collapse examples selector' : 'Expand examples selector'}
        style={{position: 'absolute', left: -13, top: 5, width: 24, height: 24, padding: 0, zIndex: 2,
          border: `1px solid ${palette.buttonBorder}`, borderRadius: '999px', background: palette.button, color: palette.text, cursor: 'pointer'}}>
        {open ? '‹' : '›'}
      </button>
      <div style={{ color: palette.heading, fontSize: '16px', marginBottom: '8px', fontWeight: 700, paddingLeft: 34, letterSpacing: '.01em' }}>
        Examples <span style={{color: palette.muted, fontSize: '12px', fontWeight: 400}}>({filtered.length}/{examples.length})</span>
      </div>

      {!open ? null : <div data-examples-selector-content style={{flex: '1 1 auto', minHeight: 0, maxHeight: 'none', overflowY: 'auto', overscrollBehavior: 'contain'}}>

      {/* Search */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="search examples..."
        style={{
          width: '100%', padding: '4px 6px', marginBottom: '6px',
          background: palette.input, border: `1px solid ${palette.border}`,
          borderRadius: '4px', color: palette.text,
          fontFamily: 'inherit', fontSize: '13px',
          boxSizing: 'border-box',
        }}
      />

      {/* Filter toolbar: each group stays compact and the groups share rows. */}
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '4px', marginBottom: '4px'}}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            padding: '5px 9px', borderRadius: '5px', fontSize: '12px',
            fontFamily: 'inherit', cursor: 'pointer',
            background: !selectedCategory ? palette.accent : palette.button,
            color: !selectedCategory ? '#fff' : palette.text,
            border: `1px solid ${!selectedCategory ? palette.accent : palette.buttonBorder}`,
          }}
        >All</button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={{
              padding: '5px 9px', borderRadius: '5px', fontSize: '12px',
              fontFamily: 'inherit', cursor: 'pointer',
              background: selectedCategory === cat ? (CATEGORY_COLORS[cat] || palette.accent) : palette.button,
              color: selectedCategory === cat ? '#fff' : (dark ? (CATEGORY_COLORS[cat] || palette.text) : palette.text),
              border: `1px solid ${selectedCategory === cat ? (CATEGORY_COLORS[cat] || palette.accent) : palette.buttonBorder}`,
            }}
          >{CATEGORY_LABELS[cat] || cat}</button>
        ))}
      </div>

      <FilterRow label="Level" palette={palette}>
        <FilterButton palette={palette} active={!selectedDifficulty} onClick={() => setSelectedDifficulty(null)}>All</FilterButton>
        {[1, 2, 3].map(level => (
          <FilterButton palette={palette} key={level} active={selectedDifficulty === level} color={DIFFICULTY_COLORS[level]}
            onClick={() => setSelectedDifficulty(selectedDifficulty === level ? null : level)}>
            {DIFFICULTY_LABELS[level]}
          </FilterButton>
        ))}
      </FilterRow>

      <FilterRow label="Parts" palette={palette}>
        <FilterButton palette={palette} active={!selectedPart} onClick={() => setSelectedPart(null)}>All</FilterButton>
        {partTags.map(part => (
          <FilterButton palette={palette} key={part} active={selectedPart === part}
            color={part === 'mcu' ? '#38bdf8' : '#14b8a6'}
            onClick={() => setSelectedPart(selectedPart === part ? null : part)}>
            {partLabel(part)}
          </FilterButton>
        ))}
      </FilterRow>

      <FilterRow label="Target" palette={palette}>
        <FilterButton palette={palette} active={!selectedTarget} onClick={() => setSelectedTarget(null)}>All</FilterButton>
        {targetTags.map(target => (
          <FilterButton palette={palette} key={target} active={selectedTarget === target}
            color={target === 'no-mcu' ? '#14b8a6' : '#6366f1'}
            onClick={() => setSelectedTarget(selectedTarget === target ? null : target)}>
            {targetLabel(target)}
          </FilterButton>
        ))}
      </FilterRow>
      </div>

      {/* Example cards */}
      {filtered.length === 0 ? (
        <div style={{ color: palette.muted, fontSize: '13px', padding: '8px 4px' }}>No examples match these filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(ex => (
            <ExampleCard
              key={ex.id}
              example={ex}
              lang={lang}
              palette={palette}
              onClick={() => onLoadExample && onLoadExample(ex)}
            />
          ))}
        </div>
      )}
      </div>}
    </div>
  );
}

function FilterRow({label, children, palette}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'nowrap', flexShrink: 0}}>
      <span style={{color: palette.muted, fontSize: '12px', minWidth: 'auto', fontWeight: 600}}>{label}</span>
      {children}
    </div>
  );
}

function FilterButton({active, color = '#3b82f6', onClick, children, palette}) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '5px 9px', borderRadius: '5px', fontSize: '12px',
      fontFamily: 'inherit', cursor: 'pointer',
      background: active ? color : palette.button,
      color: active ? '#fff' : palette.text,
      border: `1px solid ${active ? color : palette.buttonBorder}`,
      boxShadow: active ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
    }}>{children}</button>
  );
}

function ExampleCard({ example, lang, onClick, palette }) {
  const [hovered, setHovered] = useState(false);
  const title = example.title?.[lang] || example.title?.en || example.id;
  const catColor = CATEGORY_COLORS[example.category] || '#555';
  const diff = DIFFICULTY_LABELS[example.difficulty] || '';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px',
        background: hovered ? palette.cardHover : palette.card,
        border: `1px solid ${hovered ? catColor : palette.cardBorder}`,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'border-color 80ms, background 80ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: palette.heading, fontSize: '13px', fontWeight: 650 }}>{title}</div>
        <span style={{
          fontSize: '10px', color: palette.text,
          background: `${catColor}22`, padding: '1px 4px',
          borderRadius: '2px',
        }}>{example.category}</span>
      </div>
      {diff && (
        <div style={{ color: palette.muted, fontSize: '11px', marginTop: '4px' }}>
          {'★'.repeat(example.difficulty)}{'☆'.repeat(3 - example.difficulty)} {diff}
        </div>
      )}
    </div>
  );
}
