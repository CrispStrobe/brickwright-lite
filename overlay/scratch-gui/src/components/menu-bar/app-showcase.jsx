// "Our apps" in the About dialog: every app of this developer account, with its
// App Store and/or TestFlight link. A lazy chunk (bw-about.jsx loads it when the
// dialog opens), so none of it is in the first load.
//
// The list (app-showcase-data.js) and the icons (static/app-showcase/, 128 px)
// come from App Store Connect and the public App Store lookup:
//   node scripts/refresh-app-showcase.mjs [--dry-run]
// Links never point anywhere but apps.apple.com and testflight.apple.com.
import React from 'react';
import PropTypes from 'prop-types';
import {APPS} from './app-showcase-data.js';

const STORE = id => `https://apps.apple.com/app/id${id}`;
const BETA = code => `https://testflight.apple.com/join/${code}`;

export {APPS};

const TEXT = {
    en: {heading: 'Our apps', intro: 'More apps by the same developer. Apps in TestFlight are free betas: the link installs Apple\'s TestFlight first.',
        store: 'App Store', storeMac: 'Mac App Store', beta: 'TestFlight', soon: 'Coming soon', thisApp: 'this app'},
    de: {heading: 'Unsere Apps', intro: 'Weitere Apps desselben Entwicklers. Apps in TestFlight sind kostenlose Betas: Der Link installiert zuerst Apples TestFlight.',
        store: 'App Store', storeMac: 'Mac App Store', beta: 'TestFlight', soon: 'Bald verfügbar', thisApp: 'diese App'}
};

const link = {display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
    textDecoration: 'none', whiteSpace: 'nowrap'};

const AppShowcase = ({locale}) => {
    const lang = String(locale || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
    const T = TEXT[lang];
    // Live apps first, then betas, each alphabetically; this app last.
    const apps = APPS.slice().sort((a, b) => (Boolean(a.self) - Boolean(b.self)) ||
        (Boolean(b.store) - Boolean(a.store)) || a.name.localeCompare(b.name));
    return (
        <section data-testid="about-app-showcase">
            <p style={{margin: '0 0 8px', fontSize: 12}}>{T.intro}</p>
            <ul style={{listStyle: 'none', margin: 0, padding: 0, display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8}}>
                {apps.map(app => (
                    <li key={app.slug} data-testid={`about-app-${app.slug}`}
                        style={{display: 'flex', gap: 10, alignItems: 'center', padding: 6, borderRadius: 8,
                            border: '1px solid rgba(127, 127, 127, 0.25)'}}>
                        <img src={`static/app-showcase/${app.slug}.png`} alt="" width={44} height={44}
                            loading="lazy" style={{borderRadius: 10, flexShrink: 0}} />
                        <div style={{minWidth: 0}}>
                            <div style={{fontWeight: 600, fontSize: 13}}>
                                {app.name}{app.self ? <span style={{fontWeight: 400, opacity: 0.7}}>{` (${T.thisApp})`}</span> : null}
                            </div>
                            <div style={{fontSize: 12, opacity: 0.8, marginBottom: 4}}>{app[lang]}</div>
                            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                {app.store ? <a href={STORE(app.store)} target="_blank" rel="noopener noreferrer"
                                    style={{...link, background: '#0f172a', color: '#fff'}}>
                                    {app.mac ? T.storeMac : T.store}</a> : null}
                                {app.beta ? <a href={BETA(app.beta)} target="_blank" rel="noopener noreferrer"
                                    style={{...link, background: '#e0f2fe', color: '#075985'}}>{T.beta}</a> : null}
                                {!app.store && !app.beta ? <span style={{...link, background: 'rgba(127, 127, 127, 0.15)'}}>
                                    {T.soon}</span> : null}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
};

AppShowcase.propTypes = {locale: PropTypes.string};

export default AppShowcase;
