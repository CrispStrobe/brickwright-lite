import React from 'react';
import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';

/**
 * Collapse the editor's two top rows into one strip.
 *
 * Slice 1 of `sb3-creator/reference/gui-layout.md`, and deliberately the whole of
 * it: one boolean and some CSS, no layout model, no reducer, nothing for a later
 * slice to unpick. The menu bar and the tab row together eat about 80px of a
 * laptop screen, which is a quarter of the block workspace on a 13".
 *
 * Two rules the design note sets, and this obeys both:
 *
 * 1. **Collapsing removes permanence, never capability.** Collapsed, the menu bar
 *    is one click away rather than gone, and the tabs keep their icons — you can
 *    still reach every tab and every menu without expanding. If something were
 *    only reachable expanded, it would not belong in the chrome at all.
 * 2. **No "reset layout" anywhere.** The same control put it away and brings it
 *    back, and it is the only control involved.
 *
 * The state is a class on `<body>` rather than redux: it is presentation with no
 * bearing on the project or the VM, every consumer of it is a stylesheet, and a
 * reducer would mean threading a prop through five components that have no other
 * reason to know. It persists in localStorage because a person who wants the
 * space back wants it back tomorrow too — and it is read once, synchronously,
 * before first paint, so the chrome never flashes open and then shut.
 */

const KEY = 'bw:compact-chrome';
const CLASS = 'bw-compact-chrome';

/** Read and apply before React mounts, so there is no flash of the tall chrome. */
export const applyStoredChrome = () => {
    try {
        if (localStorage.getItem(KEY) === '1') document.body.classList.add(CLASS);
    } catch { /* private mode: the default (expanded) is the safe one */ }
};

class ChromeToggle extends React.Component {
    constructor (props) {
        super(props);
        this.state = {compact: typeof document !== 'undefined' &&
            document.body.classList.contains(CLASS)};
        this.toggle = this.toggle.bind(this);
        this.button = React.createRef();
        this.fitFrame = null;
        this.scheduleFit = () => {
            if (this.fitFrame !== null) return;
            this.fitFrame = requestAnimationFrame(() => {
                this.fitFrame = null;
                this.fitLabels();
            });
        };
    }

    componentDidMount () {
        this.tabList = this.button.current.closest('[role="tablist"]');
        if (!this.tabList) return;
        this.canvas = document.createElement('canvas');
        this.menu = document.querySelector('[class*="menu-bar_main-menu"]');
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.scheduleFit);
            this.resizeObserver.observe(this.tabList.parentElement);
            this.resizeObserver.observe(document.documentElement);
            if (this.menu) {
                this.resizeObserver.observe(this.menu);
                for (const child of this.menu.children) this.resizeObserver.observe(child);
            }
        }
        this.labelsObserver = new MutationObserver(this.scheduleFit);
        this.labelsObserver.observe(this.tabList, {childList: true, subtree: true, characterData: true});
        window.addEventListener('resize', this.scheduleFit);
        this.scheduleFit();
        if (document.fonts) {
            document.fonts.ready.then(() => {
                if (this.tabList) this.scheduleFit();
            });
        }
    }

    componentDidUpdate () {
        this.scheduleFit();
    }

    componentWillUnmount () {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.labelsObserver) this.labelsObserver.disconnect();
        window.removeEventListener('resize', this.scheduleFit);
        if (this.fitFrame !== null) cancelAnimationFrame(this.fitFrame);
        this.tabList = null;
    }

    fitLabels () {
        const list = this.tabList;
        if (!list) return;
        const context = this.canvas.getContext('2d');
        if (!context) return;
        const touch = document.documentElement.hasAttribute('data-bw-touch');
        const compact = this.state.compact;
        let available = list.parentElement.clientWidth - 36;
        if (touch) {
            const occupied = !compact && this.menu ? Math.max(0, ...Array.from(this.menu.children, child => {
                const rect = child.getBoundingClientRect();
                return rect.width > 0 ? rect.right : 0;
            })) : 0;
            available = compact ? Math.min(window.innerWidth, list.parentElement.clientWidth) - 16 :
                window.innerWidth - occupied - 60;
        }
        const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
        const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
        let required = compact ? this.button.current.getBoundingClientRect().width + 4 + gap : 0;
        for (const tab of tabs) {
            const label = tab.querySelector('[data-bw-tab-label]');
            if (!label) continue;
            const font = getComputedStyle(label);
            context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
            const style = getComputedStyle(tab);
            const edges = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
                .reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
            required += Math.ceil(context.measureText(label.textContent).width) + 16 +
                (parseFloat(style.columnGap) || 0) + edges + gap;
        }
        list.style.setProperty('--bw-tab-available', `${Math.max(32, available)}px`);
        list.toggleAttribute('data-bw-tab-icons-only', required > available);
    }

    toggle () {
        const compact = !this.state.compact;
        document.body.classList.toggle(CLASS, compact);
        try { localStorage.setItem(KEY, compact ? '1' : '0'); } catch { /* fine */ }
        this.setState({compact});
        // Blockly measures its own canvas on resize and not otherwise, so a chrome
        // change that alters the height has to be announced or the workspace keeps
        // the old one and the blocks sit under the strip.
        window.dispatchEvent(new Event('resize'));
    }

    render () {
        const {compact} = this.state;
        return (
            <button
                aria-pressed={compact}
                className={this.props.className}
                type="button"
                ref={this.button}
                data-testid="bw-chrome-toggle"
                aria-label={this.props.intl.formatMessage(compact ? {
                    id: 'gui.chrome.expand', defaultMessage: 'Show the menu bar and tab labels'
                } : {
                    id: 'gui.chrome.collapse', defaultMessage: 'Collapse the menu bar and tabs into one strip'
                })}
                title={this.props.intl.formatMessage(compact ? {
                    id: 'gui.chrome.expand', defaultMessage: 'Show the menu bar and tab labels'
                } : {
                    id: 'gui.chrome.collapse', defaultMessage: 'Collapse the menu bar and tabs into one strip'
                })}
                onClick={this.toggle}
            >
                {/* Three dots when there is something folded away, a chevron when
                    there is something to fold: the glyph says what the click does. */}
                <span aria-hidden="true">{compact ? '⋯' : '⌃'}</span>
            </button>
        );
    }
}

ChromeToggle.propTypes = {
    className: PropTypes.string,
    intl: intlShape.isRequired
};

export default injectIntl(ChromeToggle);
