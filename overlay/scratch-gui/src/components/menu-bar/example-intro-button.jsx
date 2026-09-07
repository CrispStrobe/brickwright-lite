import React from 'react';
import PropTypes from 'prop-types';
import {INTRO_L10N, parseIntro, renderMarkdown} from '../../lib/bw-circuit-ui/intro-doc.jsx';

/**
 * The (i) beside the project name, when that name came from an example.
 *
 * WHY IT SITS HERE. Loading an example OVERWRITES THE PROJECT NAME — the
 * editable field in the top row centre — with the example's title
 * (circuit-tab.jsx publishExampleTitle). So the name on screen is already the
 * example's, and there was no way to ask what that example is. The learner is
 * left holding a title with no document behind it (owner report, 2026-09-07).
 *
 * It renders NOTHING until an example is loaded, because a permanently-present
 * (i) that is usually inert teaches people to ignore it. Absence is the honest
 * state for a project that is not an example.
 *
 * THE INTRO IS RENDERED BY THE SHARED MODULE, not by a copy. `intro-doc.jsx` is
 * the same parser, renderer and label set the Examples catalogue uses; a second
 * renderer here would be a second thing to keep in agreement, which is the
 * defect shape this repo has spent the week cataloguing.
 */
class ExampleIntroButton extends React.Component {
    constructor (props) {
        super(props);
        this.state = {example: null, open: false, intro: null};
        this.onLoaded = this.onLoaded.bind(this);
        this.toggle = this.toggle.bind(this);
    }
    componentDidMount () {
        window.addEventListener('bw-example-loaded', this.onLoaded);
        // A journey can load its example before this mounts; the publisher
        // stashes the last one so the button is not blind to it.
        if (window.__bwActiveExample) this.setState({example: window.__bwActiveExample});
    }
    componentWillUnmount () {
        window.removeEventListener('bw-example-loaded', this.onLoaded);
    }
    onLoaded (event) {
        const example = event && event.detail;
        if (example && example.id) this.setState({example, open: false, intro: null});
    }
    async toggle () {
        const {example, open, intro} = this.state;
        if (!example) return;
        if (open) return this.setState({open: false});
        this.setState({open: true});
        if (intro) return;
        // Localised first, then the plain file. `id` is the directory, which is
        // the same convention the catalogue's per-card intro uses.
        const de = String(this.props.locale || 'en').slice(0, 2) === 'de';
        const at = async suffix => {
            try {
                const res = await fetch(`examples/${example.id}/intro${suffix}`);
                return res.ok ? await res.text() : null;
            } catch { return null; }
        };
        const text = (de ? await at('.de.md') : null) || await at('.md');
        this.setState({intro: text ? parseIntro(text) : 'none'});
    }
    render () {
        const {example, open, intro} = this.state;
        if (!example) return null;
        const lang = String(this.props.locale || 'en').slice(0, 2) === 'de' ? 'de' : 'en';
        const t = INTRO_L10N[lang] || INTRO_L10N.en;
        const palette = {heading: '#0f172a', text: '#1e293b', muted: '#64748b', border: '#cbd5e1'};
        return (
            <span style={{position: 'relative', display: 'inline-flex', alignItems: 'center'}}>
                <button
                    type="button"
                    onClick={this.toggle}
                    data-testid="bw-example-intro"
                    data-example-id={example.id}
                    aria-label={`${t.intro}: ${example.title || example.id}`}
                    title={`${t.intro}: ${example.title || example.id}`}
                    style={{width: 20, height: 20, marginLeft: 6, padding: 0, borderRadius: '50%',
                        border: '1px solid rgba(255,255,255,.6)', background: 'rgba(255,255,255,.25)',
                        color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 11, lineHeight: 1}}
                >{'i'}</button>
                {open ? (
                    <div
                        data-testid="bw-example-intro-panel"
                        style={{position: 'absolute', top: 26, left: 0, zIndex: 1000, width: 420,
                            maxHeight: 420, overflowY: 'auto', padding: 12, borderRadius: 6,
                            background: '#fff', color: palette.text, fontSize: 12, lineHeight: 1.45,
                            border: `1px solid ${palette.border}`, boxShadow: '0 6px 24px rgba(0,0,0,.18)'}}
                    >
                        <div style={{fontWeight: 700, marginBottom: 6, color: palette.heading}}>
                            {example.title || example.id}
                        </div>
                        {intro === null ? <div style={{color: palette.muted}}>{t.loading}</div>
                            : intro === 'none' ? <div style={{color: palette.muted}}>{t.noIntro}</div>
                                : renderMarkdown(intro.body, palette)}
                    </div>
                ) : null}
            </span>
        );
    }
}

ExampleIntroButton.propTypes = {locale: PropTypes.string};

export default ExampleIntroButton;
