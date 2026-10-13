import PropTypes from 'prop-types';
import React from 'react';

/*
 * One chip per board of a multi-board project, shown above the sprite list.
 * Styles are inline: the strip exists only for such projects and brings no
 * stylesheet into the pane every other project renders.
 */
const strip = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    alignItems: 'center',
    fontSize: '0.75rem'
};
const chip = active => ({
    border: '1px solid var(--ui-black-transparent, hsla(0, 0%, 0%, 0.15))',
    borderRadius: '1rem',
    padding: '0.125rem 0.625rem',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: active ? 'bold' : 'normal',
    background: active ? 'var(--looks-secondary, hsl(260, 60%, 60%))' : 'var(--ui-white, #fff)',
    color: active ? '#fff' : 'var(--text-primary, #575e75)'
});

const BoardStrip = ({boards, active, label, onSelect}) => (
    <div
        style={strip}
        role="tablist"
        aria-label={label}
        data-bw-board-strip=""
    >
        {boards.map((board, index) => (
            <button
                key={board.name}
                type="button"
                role="tab"
                aria-selected={index === active}
                data-bw-board={board.name}
                style={chip(index === active)}
                title={String(board.stc.device || '')}
                onClick={() => onSelect(index)} // eslint-disable-line react/jsx-no-bind
            >
                {board.name}
                {board.stc.device ? ` · ${board.stc.device}` : ''}
            </button>
        ))}
    </div>
);

BoardStrip.propTypes = {
    active: PropTypes.number.isRequired,
    boards: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        stc: PropTypes.object.isRequired
    })).isRequired,
    label: PropTypes.string,
    onSelect: PropTypes.func.isRequired
};

export default BoardStrip;
