/**
 * PaneColumn — renders one column of the three-column layout.
 *
 * A column has a size (xs/s/m/l/xl) and one or two stacked slots.
 * Each slot shows a content surface by ID.
 *
 * At xs, the column collapses to a vertical title strip showing
 * only the content name. Click to restore.
 *
 * Generalises the existing stage-over-sprites split in the right column.
 */

import React from 'react';
import PropTypes from 'prop-types';

const stripStyle = {
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  background: '#1a1a2e',
  border: '1px solid #2c3e50',
  borderRadius: '4px',
  color: '#7f8c8d',
  cursor: 'pointer',
  padding: '8px 4px',
  fontFamily: 'monospace',
  fontSize: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '28px',
  flexShrink: 0,
};

function PaneColumn ({upper, lower, size, style, onRestore, renderContent}) {
  // xs = collapsed strip
  if (size === 'xs') {
    const label = upper || 'empty';
    return (
      <div style={{...stripStyle, ...style}} onClick={onRestore}>
        {label}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...style,
    }}>
      {/* Upper slot */}
      <div style={{
        flex: lower ? '1 1 60%' : '1 1 100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {upper && renderContent(upper)}
      </div>

      {/* Lower slot (optional) */}
      {lower && (
        <div style={{
          flex: '0 1 40%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid #2c3e50',
        }}>
          {renderContent(lower)}
        </div>
      )}
    </div>
  );
}

PaneColumn.propTypes = {
  upper: PropTypes.string,
  lower: PropTypes.string,
  size: PropTypes.string.isRequired,
  style: PropTypes.object,
  onRestore: PropTypes.func,
  renderContent: PropTypes.func.isRequired,
};

export default PaneColumn;
