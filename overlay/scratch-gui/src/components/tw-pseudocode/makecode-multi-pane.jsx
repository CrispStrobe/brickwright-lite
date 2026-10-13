/**
 * Several boards of one project, each in MakeCode's own simulator, side by side.
 *
 * Every board gets its own host page (static/makecode/<target>/sim/host.html)
 * and its own program. The boards share nothing but the air: a radio packet one
 * simulator posts is handed to every other board's simulator, exactly as it was
 * posted — group filtering stays where it is on a real board, in the receiver.
 *
 * The pane is given the whole set at once ({boards: [{name, target, js}]},
 * built by the Code tab) and runs, stops and restarts it as one thing: a pair
 * with one half stopped is a broken radio, not a paused project.
 */
import PropTypes from 'prop-types';
import React from 'react';

/** The frames a packet from frame `from` goes to: every other one. */
export function radioPeers (count, from) {
    const out = [];
    for (let i = 0; i < count; i++) if (i !== from) out.push(i);
    return out;
}

class MakeCodeMultiPane extends React.Component {
    constructor (props) {
        super(props);
        this.frames = [];
        this.state = this.fresh(props.program);
        this.onMessage = this.onMessage.bind(this);
        this.restart = this.restart.bind(this);
        this.stop = this.stop.bind(this);
    }

    fresh (program) {
        return {
            ready: program.boards.map(() => false),
            running: program.boards.map(() => false),
            errors: program.boards.map(() => null),
            motors: program.boards.map(() => null),
            packets: 0
        };
    }

    componentDidMount () {
        window.addEventListener('message', this.onMessage);
    }

    componentDidUpdate (prev) {
        if (prev.program === this.props.program) return;
        // A new set: same targets in the same order keep their loaded host
        // pages (the iframe keys are stable) and just run the new programs.
        const same = prev.program.boards.length === this.props.program.boards.length &&
            prev.program.boards.every((b, i) => b.target === this.props.program.boards[i].target);
        this.setState(state => ({...this.fresh(this.props.program), ready: same ? state.ready : this.fresh(this.props.program).ready}),
            () => this.state.ready.forEach((r, i) => { if (r) this.run(i); }));
    }

    componentWillUnmount () {
        window.removeEventListener('message', this.onMessage);
    }

    post (index, msg) {
        const frame = this.frames[index];
        if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
    }

    run (index) {
        this.post(index, {type: 'bw-makecode-run', js: this.props.program.boards[index].js, peerRadio: true});
    }

    onMessage (event) {
        const index = this.frames.findIndex(f => f && f.contentWindow === event.source);
        if (index < 0) return;
        const m = event.data || {};
        const set = (key, value) => this.setState(state => {
            const next = state[key].slice();
            next[index] = value;
            return {[key]: next};
        });
        if (m.type === 'bw-makecode-host-ready') {
            set('ready', true);
            this.run(index);
        } else if (m.type === 'bw-makecode-state') {
            set('running', m.state === '4');
        } else if (m.type === 'bw-makecode-error') {
            set('errors', m.message);
        } else if (m.type === 'bw-makecode-motor' && (m.motor === 'A' || m.motor === 'B')) {
            this.setState(state => {
                const next = state.motors.slice();
                next[index] = {...(next[index] || {A: 0, B: 0}), [m.motor]: Number(m.power) || 0};
                return {motors: next};
            });
        } else if (m.type === 'radiopacket') {
            for (const peer of radioPeers(this.props.program.boards.length, index)) {
                this.post(peer, {type: 'bw-makecode-radio-in', packet: m});
            }
            this.setState(state => ({packets: state.packets + 1}));
        }
    }

    restart () {
        this.setState({errors: this.props.program.boards.map(() => null),
            motors: this.props.program.boards.map(() => null), packets: 0});
        this.props.program.boards.forEach((b, i) => this.run(i));
    }

    stop () {
        this.props.program.boards.forEach((b, i) => this.post(i, {type: 'bw-makecode-stop'}));
    }

    render () {
        const {program, labels} = this.props;
        const {ready, running, errors, motors, packets} = this.state;
        const btn = {padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 13};
        return (
            <div data-testid="bw-makecode-multi-pane"
                style={{display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'}} title={program.name}>{program.name}</strong>
                    <span data-testid="bw-makecode-radio-count" style={{fontSize: 12, color: '#475569'}}>
                        {labels.radio(packets)}</span>
                    <button type="button" style={btn} onClick={this.stop} data-testid="bw-makecode-stop">
                        {labels.stop}</button>
                    <button type="button" style={btn} onClick={this.restart} data-testid="bw-makecode-restart">
                        {labels.restart}</button>
                </div>
                <div style={{display: 'flex', flex: 1, minHeight: 240}}>
                    {program.boards.map((board, i) => (
                        <div key={`${i}:${board.target}`} data-testid="bw-makecode-board" data-board={board.name}
                            data-target={board.target}
                            style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                                borderLeft: i ? '1px solid #e2e8f0' : 'none'}}>
                            <div style={{display: 'flex', gap: 6, padding: '4px 10px', fontSize: 12}}>
                                <strong>{board.name}</strong>
                                <span style={{color: '#64748b', flex: 1}}>{labels.target(board.target)}</span>
                                <span data-testid="bw-makecode-board-state"
                                    style={{color: running[i] ? '#15803d' : '#64748b'}}>
                                    {ready[i] ? (running[i] ? labels.running : labels.stopped) : labels.loading}
                                </span>
                            </div>
                            <iframe
                                ref={el => { this.frames[i] = el; }}
                                title={`${board.name} — ${labels.target(board.target)}`}
                                data-testid="bw-makecode-board-frame"
                                src={`static/makecode/${board.target}/sim/host.html`}
                                style={{flex: 1, minHeight: 200, border: 0, width: '100%'}}
                            />
                            {motors[i] ? (
                                <div data-testid="bw-makecode-motors" style={{padding: '4px 10px', fontSize: 12}}>
                                    {['A', 'B'].map(m => (
                                        <div key={m} data-testid={`bw-makecode-motor-${m}`} data-power={motors[i][m]}
                                            style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                            <span style={{width: 56}}>{labels.motor(m)}</span>
                                            <span style={{flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4}}>
                                                <span style={{display: 'block', height: 8, borderRadius: 4,
                                                    background: '#2563eb', width: `${motors[i][m]}%`}} />
                                            </span>
                                            <span style={{width: 40, textAlign: 'right'}}>{motors[i][m]} %</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {errors[i] ? (
                                <div style={{fontSize: 12, color: '#b91c1c', padding: '4px 10px'}}>
                                    {labels.error(errors[i])}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

MakeCodeMultiPane.propTypes = {
    labels: PropTypes.shape({
        error: PropTypes.func, motor: PropTypes.func, loading: PropTypes.string, radio: PropTypes.func, restart: PropTypes.string,
        running: PropTypes.string, stop: PropTypes.string, stopped: PropTypes.string, target: PropTypes.func
    }).isRequired,
    program: PropTypes.shape({
        boards: PropTypes.arrayOf(PropTypes.shape({
            js: PropTypes.string, name: PropTypes.string, target: PropTypes.string
        })).isRequired,
        name: PropTypes.string
    }).isRequired
};

export default MakeCodeMultiPane;
