// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// An (i) button for the Robot Lab: how-to text that used to stand on screen as long
// sentences opens on demand in a small popover (Esc, a click elsewhere or the button
// again closes it). The full key list stays in the (?) shortcut sheet.

import PropTypes from 'prop-types';
import React from 'react';

class SimLabInfo extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false};
        this.box = React.createRef();
        this.onDocument = this.onDocument.bind(this);
        this.onKey = this.onKey.bind(this);
    }

    componentWillUnmount () {
        this.listen(false);
    }

    listen (on) {
        const method = on ? 'addEventListener' : 'removeEventListener';
        document[method]('pointerdown', this.onDocument, true);
        document[method]('keydown', this.onKey, true);
    }

    onDocument (e) {
        if (this.box.current && !this.box.current.contains(e.target)) this.toggle(false);
    }

    onKey (e) {
        if (e.key === 'Escape') this.toggle(false);
    }

    toggle (open = !this.state.open) {
        if (open === this.state.open) return;
        this.listen(open);
        this.setState({open});
    }

    render () {
        const {label, text, testid, align} = this.props;
        const {open} = this.state;
        return (
            <span ref={this.box} style={{position: 'relative', display: 'inline-flex', flex: '0 0 auto'}}>
                <button type="button" data-testid={testid} aria-label={label} title={label} aria-expanded={open}
                    onClick={() => this.toggle()}
                    style={{width: 20, height: 20, padding: 0, borderRadius: 999, border: '1px solid #94a3b8', background: open ? '#dbeafe' : '#fff',
                        color: '#334155', fontSize: 12, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: '18px', cursor: 'pointer'}}>i</button>
                {open && (
                    <span role="note" data-testid={`${testid}-text`}
                        style={{position: 'absolute', top: 24, [align]: 0, zIndex: 20, width: 260, maxWidth: '70vw', background: '#fff', color: '#1e293b',
                            border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.45, whiteSpace: 'normal',
                            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.18)'}}>
                        {text}
                    </span>
                )}
            </span>
        );
    }
}

SimLabInfo.propTypes = {
    label: PropTypes.string.isRequired,
    text: PropTypes.node.isRequired,
    testid: PropTypes.string.isRequired,
    align: PropTypes.oneOf(['left', 'right'])
};
SimLabInfo.defaultProps = {align: 'left'};

export default SimLabInfo;
