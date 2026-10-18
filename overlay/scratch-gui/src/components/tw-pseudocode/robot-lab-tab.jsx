// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab as a first-class editor tab beside Blocks, Code and Circuit
// (docs/SIM-LAB.md "Where it lives"). It used to be a sub-tab of the SPIKE arena in
// the right pane, squeezed into a third of the window; a 3D editor needs the whole
// editor pane.
//
// Like the Circuit tab, this is mounted from the start (the GUI's <Tabs> force-render
// every panel) but costs nothing until it is first SHOWN: the pane, its toolbar and
// everything under lib/bw-sim arrive with that first showing (React.lazy, chunk
// "bw-robot-lab"; the physics and the 3D view are lazier still, sim-lab-pane.jsx).
// Once open it stays mounted, so the model, the camera and a running program survive a
// trip to the Code tab.
//
// One session, one physics world (lib/robot-lab-events.js): the Lab and the SPIKE
// arena share one virtual hub, so they never both drive it. While the Lab holds a
// session the arena shows a note instead of its mat; "Use the arena here" there
// releases the Lab (its model is saved with the project first, sim-lab-pane.jsx), and
// this tab then offers to take the hub back.
//
// The program the Lab runs is the project's (green flag), through whatever hub the
// project's program talks to: today the virtual SPIKE Prime, behind the VirtualHub
// boundary (docs/ROBOT-LAB-ARCHITECTURE.md R1), so other hubs plug in there, not here.

import React from 'react';
import PropTypes from 'prop-types';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
import {ROBOT_LAB_EVENTS} from '../../lib/robot-lab-events.js';

const SimLabPane = React.lazy(() => import(/* webpackChunkName: "bw-robot-lab" */ './sim-lab-pane.jsx'));

const TEXT = {
    en: {
        loading: 'Loading the Robot Lab…',
        released: 'The SPIKE arena is using the virtual hub now, so the Robot Lab has stopped (your model is kept).',
        reopen: 'Open the Robot Lab here'
    },
    de: {
        loading: 'Roboter-Labor wird geladen…',
        released: 'Die SPIKE-Arena benutzt jetzt den virtuellen Hub, darum ist das Roboter-Labor angehalten (dein Modell bleibt erhalten).',
        reopen: 'Roboter-Labor hier öffnen'
    }
};

class RobotLabTab extends React.Component {
    constructor (props) {
        super(props);
        // opened: shown at least once (the pane then stays mounted); released: the arena has the hub.
        this.state = {opened: Boolean(props.isVisible), released: false};
        this.onOpen = this.onOpen.bind(this);
        this.onRelease = this.onRelease.bind(this);
    }

    componentDidMount () {
        window.addEventListener(ROBOT_LAB_EVENTS.open, this.onOpen);
        window.addEventListener(ROBOT_LAB_EVENTS.release, this.onRelease);
    }

    componentDidUpdate (prev) {
        // Shown again after the arena took the hub: the learner came here for the Lab.
        if (this.props.isVisible && !prev.isVisible) this.take();
    }

    componentWillUnmount () {
        window.removeEventListener(ROBOT_LAB_EVENTS.open, this.onOpen);
        window.removeEventListener(ROBOT_LAB_EVENTS.release, this.onRelease);
    }

    take () {
        if (!this.state.opened || this.state.released) this.setState({opened: true, released: false});
    }

    /** "Open in Robot Lab" (the arena) or any other surface: show this tab, which takes the hub. */
    onOpen () {
        this.take();
        window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: this.props.tabIndex}}));
    }

    onRelease () {
        if (this.state.opened && !this.state.released) this.setState({released: true});
    }

    render () {
        const T = TEXT[pickLocale(this.props.locale || browserLocale(), TEXT)];
        const box = {display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, minHeight: 0, background: '#fff'};
        if (!this.state.opened) return <div data-testid="bw-robot-lab-tab" data-state="idle" style={box} />;
        if (this.state.released) {
            return (
                <div data-testid="bw-robot-lab-tab" data-state="released" style={{...box, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24}}>
                    <p role="status" style={{maxWidth: 460, textAlign: 'center', color: '#334155', fontSize: 14, margin: 0}}>{T.released}</p>
                    <button type="button" data-testid="bw-robot-lab-reopen" onClick={() => this.take()}
                        style={{padding: '8px 16px', borderRadius: 8, border: '1px solid #4338ca', background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer'}}>
                        {T.reopen}
                    </button>
                </div>
            );
        }
        return (
            <div data-testid="bw-robot-lab-tab" data-state="open" style={box}>
                <React.Suspense fallback={<div role="status" style={{padding: 24, color: '#64748b'}}>{T.loading}</div>}>
                    <SimLabPane vm={this.props.vm} locale={this.props.locale} isVisible={this.props.isVisible} />
                </React.Suspense>
            </div>
        );
    }
}

RobotLabTab.propTypes = {
    /** This tab's index in the GUI's tab list (the arena's "Open in Robot Lab" activates it). */
    tabIndex: PropTypes.number.isRequired,
    isVisible: PropTypes.bool,
    locale: PropTypes.string,
    vm: PropTypes.object
};

export default RobotLabTab;
