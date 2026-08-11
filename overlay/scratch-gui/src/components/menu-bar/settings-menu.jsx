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
    const workspaceValue = (key, fallback) => current(key) || fallback;
    const setWorkspace = (key, value) => {
        emit('bw-settings-change', {key, value});
        onRequestClose();
    };
    const presentation = (() => {
        const layout = workspaceValue('bw-hide-stage', '0') === '1' ? 'full' : 'stage';
        const theme = workspaceValue('bw-circuit-theme', 'light');
        return `${layout}-${theme}`;
    })();
    const setPresentation = value => {
        const [layout, theme] = value.split('-');
        emit('bw-settings-change', {key: 'bw-hide-stage', value: layout === 'full' ? '1' : '0'});
        emit('bw-settings-change', {key: 'bw-circuit-theme', value: theme});
        onRequestClose();
    };
    const workspaceSelect = (label, value, onChange, options, title) => (
        <label className={styles.preferenceRow} title={title}>
            <span>{label}</span>
            <select value={value} onChange={event => onChange(event.target.value)}>
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
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
                            {workspaceSelect('Debugger', workspaceValue('bw-debug-dock', 'top'),
                                value => setWorkspace('bw-debug-dock', value), [
                                    {value: 'top', label: 'Top'},
                                    {value: 'right', label: 'Right'},
                                    {value: 'off', label: 'Off'}
                                ], 'Choose where the circuit debugger appears')}
                            {workspaceSelect('While coding', workspaceValue('bw-stage-circuit', '1'),
                                value => setWorkspace('bw-stage-circuit', value), [
                                    {value: '1', label: 'Circuit'},
                                    {value: '0', label: 'Scratch stage'}
                                ], 'Choose what replaces the normal right pane while coding')}
                            {workspaceSelect('Circuit presentation', presentation, setPresentation, [
                                {value: 'stage-light', label: 'Stage · light'},
                                {value: 'stage-dark', label: 'Stage · dark'},
                                {value: 'full-light', label: 'Full width · light'},
                                {value: 'full-dark', label: 'Full width · dark'}
                            ], 'Choose circuit layout and appearance')}
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
