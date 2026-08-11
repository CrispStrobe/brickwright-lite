import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import LanguageMenu from './language-menu.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import ThemeMenu from './theme-menu.jsx';
import BwAbout from './bw-about.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import menuBarStyles from './menu-bar.css';
import styles from './settings-menu.css';
import dropdownCaret from './dropdown-caret.svg';
import settingsIcon from './icon--settings.svg';

    const emit = (name, value) => {
    window.dispatchEvent(new CustomEvent(name, {detail: value}));
};

const SettingsMenu = ({canChangeLanguage, canChangeTheme, isRtl, onRequestClose, onRequestOpen, settingsMenuOpen}) => {
    const current = key => {
        try { return localStorage.getItem(key); } catch { return null; }
    };
    const choice = (label, settingKey, value, title) => (
        <MenuItem onClick={() => {
            emit(settingKey === 'bw-circuit-theme' ? 'bw-circuit-theme' : 'bw-settings-change', {
                key: settingKey,
                value
            });
            onRequestClose();
        }}>
            <span className={classNames(styles.check, {[styles.selected]: current(settingKey) === value})}>✓</span>
            <span title={title}>{label}</span>
        </MenuItem>
    );
    return (
        <div
            className={classNames(menuBarStyles.menuBarItem, menuBarStyles.hoverable, menuBarStyles.themeMenu, {
                [menuBarStyles.active]: settingsMenuOpen
            })}
            onMouseUp={onRequestOpen}
        >
            <img src={settingsIcon} />
            <span className={styles.dropdownLabel}><FormattedMessage defaultMessage="Settings" id="gui.menuBar.settings" /></span>
            <img src={dropdownCaret} />
            <MenuBarMenu
                className={menuBarStyles.menuBarMenu}
                open={settingsMenuOpen}
                place={isRtl ? 'left' : 'right'}
                onRequestClose={onRequestClose}
            >
                <MenuSection>
                    <div className={styles.sectionLabel}>Circuit workspace</div>
                    {choice('Debugger: Top', 'bw-debug-dock', 'top', 'Show the debugger above the circuit')}
                    {choice('Debugger: Right', 'bw-debug-dock', 'right', 'Show the debugger beside the circuit')}
                    {choice('Debugger: Off', 'bw-debug-dock', 'off', 'Hide the debugger')}
                    {choice('While coding: Circuit', 'bw-stage-circuit', '1', 'Show the circuit in the right pane while coding')}
                    {choice('While coding: Scratch stage', 'bw-stage-circuit', '0', 'Show the normal Scratch stage while coding')}
                    {choice('Circuit layout: Stage', 'bw-hide-stage', '0', 'Keep the stage and sprites beside the circuit')}
                    {choice('Circuit layout: Full width', 'bw-hide-stage', '1', 'Give the circuit the full editor width')}
                    {choice('Circuit style: Scratch light', 'bw-circuit-theme', 'light', 'Use the light Scratch-like circuit interface')}
                    {choice('Circuit style: Dark', 'bw-circuit-theme', 'dark', 'Use the dark circuit interface')}
                </MenuSection>
                {(canChangeLanguage || canChangeTheme) && <MenuSection>
                    {canChangeLanguage && <LanguageMenu onRequestCloseSettings={onRequestClose} />}
                    {canChangeTheme && <ThemeMenu onRequestCloseSettings={onRequestClose} />}
                </MenuSection>}
                <MenuSection>
                    <MenuItem onClick={() => { emit('bw-open-about'); onRequestClose(); }}>
                        About Brickwright…
                    </MenuItem>
                </MenuSection>
            </MenuBarMenu>
            <BwAbout hideTrigger />
        </div>
    );
};

SettingsMenu.propTypes = {
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func,
    settingsMenuOpen: PropTypes.bool
};

export default SettingsMenu;
