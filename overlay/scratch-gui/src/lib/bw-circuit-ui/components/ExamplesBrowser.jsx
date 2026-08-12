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

/**
 * @param {{ examples: Array, lang?: string, onLoadExample?: function }} props
 */
export function ExamplesBrowser({ examples, lang = 'en', onLoadExample }) {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
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
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(e => {
        const title = e.title?.[lang] || e.title?.en || e.id;
        return title.toLowerCase().includes(q) || e.id.includes(q) || e.category.includes(q);
      });
    }
    return list;
  }, [examples, filter, selectedCategory, selectedDifficulty, selectedPart, lang]);

  if (!examples || examples.length === 0) {
    return (
      <div style={{
        background: '#1a1a2e', border: '1px solid #2c3e50', borderRadius: '8px',
        padding: '12px', fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1',
      }}>
        No examples available
      </div>
    );
  }

  return (
    <div data-examples-selector style={{
      background: '#1a1a2e',
      border: '1px solid #2c3e50',
      borderRadius: '8px',
      padding: '8px',
      fontFamily: 'monospace',
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
          border: '1px solid #64748b', borderRadius: '999px', background: '#16213e', color: '#e2e8f0', cursor: 'pointer'}}>
        {open ? '‹' : '›'}
      </button>
      <div style={{ color: '#f8fafc', fontSize: '13px', marginBottom: '8px', fontWeight: 'bold', paddingLeft: 34, letterSpacing: '.02em' }}>
        Examples <span style={{color: '#cbd5e1', fontSize: '10px', fontWeight: 'normal'}}>({filtered.length}/{examples.length})</span>
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
          background: '#0a0a1a', border: '1px solid #2c3e50',
          borderRadius: '4px', color: '#ecf0f1',
          fontFamily: 'monospace', fontSize: '10px',
          boxSizing: 'border-box',
        }}
      />

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            padding: '2px 6px', borderRadius: '3px', fontSize: '8px',
            fontFamily: 'monospace', cursor: 'pointer',
            background: !selectedCategory ? '#3498db' : '#16213e',
            color: !selectedCategory ? '#fff' : '#e2e8f0',
            border: '1px solid #2c3e50',
          }}
        >All</button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={{
              padding: '2px 6px', borderRadius: '3px', fontSize: '8px',
              fontFamily: 'monospace', cursor: 'pointer',
              background: selectedCategory === cat ? (CATEGORY_COLORS[cat] || '#555') : '#16213e',
              color: selectedCategory === cat ? '#fff' : (CATEGORY_COLORS[cat] || '#e2e8f0'),
              border: `1px solid ${CATEGORY_COLORS[cat] || '#2c3e50'}`,
            }}
          >{CATEGORY_LABELS[cat] || cat}</button>
        ))}
      </div>

      <FilterRow label="Level">
        <FilterButton active={!selectedDifficulty} onClick={() => setSelectedDifficulty(null)}>All</FilterButton>
        {[1, 2, 3].map(level => (
          <FilterButton key={level} active={selectedDifficulty === level} color={DIFFICULTY_COLORS[level]}
            onClick={() => setSelectedDifficulty(selectedDifficulty === level ? null : level)}>
            {DIFFICULTY_LABELS[level]}
          </FilterButton>
        ))}
      </FilterRow>

      <FilterRow label="Parts">
        <FilterButton active={!selectedPart} onClick={() => setSelectedPart(null)}>All</FilterButton>
        {partTags.map(part => (
          <FilterButton key={part} active={selectedPart === part}
            color={part === 'mcu' ? '#38bdf8' : '#14b8a6'}
            onClick={() => setSelectedPart(selectedPart === part ? null : part)}>
            {partLabel(part)}
          </FilterButton>
        ))}
      </FilterRow>

      {/* Example cards */}
      {filtered.length === 0 ? (
        <div style={{ color: '#cbd5e1', fontSize: '10px', padding: '8px 4px' }}>No examples match these filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(ex => (
            <ExampleCard
              key={ex.id}
              example={ex}
              lang={lang}
              onClick={() => onLoadExample && onLoadExample(ex)}
            />
          ))}
        </div>
      )}
      </div>}
    </div>
  );
}

function FilterRow({label, children}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '6px'}}>
      <span style={{color: '#cbd5e1', fontSize: '9px', minWidth: 38}}>{label}</span>
      {children}
    </div>
  );
}

function FilterButton({active, color = '#3b82f6', onClick, children}) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '3px 7px', borderRadius: '4px', fontSize: '9px',
      fontFamily: 'monospace', cursor: 'pointer',
      background: active ? color : '#24324b',
      color: active ? '#fff' : '#e2e8f0',
      border: `1px solid ${active ? color : '#52627a'}`,
      boxShadow: active ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
    }}>{children}</button>
  );
}

function ExampleCard({ example, lang, onClick }) {
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
        background: hovered ? '#1e2d4a' : '#16213e',
        border: `1px solid ${hovered ? catColor : '#2c3e50'}`,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'border-color 80ms, background 80ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#ecf0f1', fontSize: '10px', fontWeight: 'bold' }}>{title}</div>
        <span style={{
          fontSize: '7px', color: '#dbeafe',
          background: `${catColor}22`, padding: '1px 4px',
          borderRadius: '2px',
        }}>{example.category}</span>
      </div>
      {diff && (
        <div style={{ color: '#cbd5e1', fontSize: '8px', marginTop: '3px' }}>
          {'★'.repeat(example.difficulty)}{'☆'.repeat(3 - example.difficulty)} {diff}
        </div>
      )}
    </div>
  );
}
