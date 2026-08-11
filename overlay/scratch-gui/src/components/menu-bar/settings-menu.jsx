import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useState} from 'react';
import {FormattedMessage} from 'react-intl';
import {connect} from 'react-redux';
import locales from 'scratch-l10n';

import MenuBarMenu from './menu-bar-menu.jsx';
import BwAbout from './bw-about.jsx';
import {MenuItem, MenuSection, Submenu} from '../menu/menu.jsx';
import menuBarStyles from './menu-bar.css';
import styles from './settings-menu.css';
import dropdownCaret from './dropdown-caret.svg';
import settingsIcon from './icon--settings.svg';
import {selectLocale} from '../../reducers/locales.js';
import {DEFAULT_THEME, HIGH_CONTRAST_THEME, themeMap} from '../../lib/themes';
import {persistTheme} from '../../lib/themes/themePersistance';
import {setTheme} from '../../reducers/theme.js';

const emit = (name, value) => {
    window.dispatchEvent(new CustomEvent(name, {detail: value}));
};

const SettingsMenu = ({canChangeLanguage, canChangeTheme, isRtl, onRequestClose, onRequestOpen, settingsMenuOpen}) => {
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);
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
                    <MenuItem expanded={workspaceOpen}>
                        <div className={styles.groupRow} onClick={() => setWorkspaceOpen(value => !value)}>
                            <span>Workspace</span>
                            <img className={styles.groupCaret} src={dropdownCaret} />
                        </div>
                        <Submenu place={isRtl ? 'left' : 'right'}>
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
                        </Submenu>
                    </MenuItem>
                </MenuSection>
                <MenuSection>
                    {(canChangeLanguage || canChangeTheme) && <MenuItem expanded={preferencesOpen}>
                        <div className={styles.groupRow} onClick={() => setPreferencesOpen(value => !value)}>
                            <span>Preferences</span>
                            <img className={styles.groupCaret} src={dropdownCaret} />
                        </div>
                        <PreferencesSubmenu
                            canChangeLanguage={canChangeLanguage}
                            canChangeTheme={canChangeTheme}
                            isRtl={isRtl}
                            onRequestClose={onRequestClose}
                        />
                    </MenuItem>}
                    <MenuItem onClick={() => { emit('bw-open-about'); onRequestClose(); }}>
                        About Brickwright…
                    </MenuItem>
                </MenuSection>
            </MenuBarMenu>
            <BwAbout hideTrigger />
        </div>
    );
};

const PreferencesSubmenuComponent = ({canChangeLanguage, canChangeTheme, currentLocale, currentTheme, isRtl, onChangeLocale, onChangeTheme, onRequestClose}) => {
    const enabledThemes = [DEFAULT_THEME, HIGH_CONTRAST_THEME];

    return (
        <Submenu className={styles.preferencesSubmenu} place={isRtl ? 'left' : 'right'}>
            {canChangeLanguage && <label className={styles.preferenceRow}>
                <span>Language</span>
                <select value={currentLocale} onChange={event => {
                    onChangeLocale(event.target.value);
                    onRequestClose();
                }}>
                    {Object.keys(locales).map(key => <option key={key} value={key}>{locales[key].name}</option>)}
                </select>
            </label>}
            {canChangeTheme && <label className={styles.preferenceRow}>
                <span>Color mode</span>
                <select value={currentTheme} onChange={event => {
                    onChangeTheme(event.target.value);
                    onRequestClose();
                }}>
                    {enabledThemes.map(key => <option key={key} value={key}>{themeMap[key].label.defaultMessage}</option>)}
                </select>
            </label>}
        </Submenu>
    );
};

PreferencesSubmenuComponent.propTypes = {
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    currentLocale: PropTypes.string,
    currentTheme: PropTypes.string,
    isRtl: PropTypes.bool,
    onChangeLocale: PropTypes.func,
    onChangeTheme: PropTypes.func,
    onRequestClose: PropTypes.func
};

const PreferencesSubmenu = connect(
    state => ({
        currentLocale: state.locales.locale,
        currentTheme: state.scratchGui.theme.theme
    }),
    dispatch => ({
        onChangeLocale: locale => dispatch(selectLocale(locale)),
        onChangeTheme: theme => {
            dispatch(setTheme(theme));
            persistTheme(theme);
        }
    })
)(PreferencesSubmenuComponent);

SettingsMenu.propTypes = {
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    isRtl: PropTypes.bool,
    onRequestClose: PropTypes.func,
    onRequestOpen: PropTypes.func,
    settingsMenuOpen: PropTypes.bool
};

export default SettingsMenu;
