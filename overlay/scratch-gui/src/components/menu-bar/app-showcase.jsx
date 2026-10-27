// "Our apps" in the About dialog: every app of this developer account, with its
// App Store and/or TestFlight link. A lazy chunk (bw-about.jsx loads it when the
// dialog opens), so none of it is in the first load.
//
// Source, 2026-10-27: App Store Connect (`GET /v1/apps`, app-info subtitles,
// public TestFlight group links) and the public iTunes lookup for which apps are
// live on the App Store. Icons (static/app-showcase/, 128 px) are the App Store
// artwork, the latest TestFlight build's icon, or the app's own Tauri icon.
// Refresh by re-reading those sources; links never point anywhere else.
import React from 'react';
import PropTypes from 'prop-types';

const STORE = id => `https://apps.apple.com/app/id${id}`;
const BETA = code => `https://testflight.apple.com/join/${code}`;

// store: App Store id when the app is live there (mac: only the Mac App Store);
// beta: public TestFlight code; neither: a private beta, listed as coming soon.
export const APPS = [
    {slug: 'brickwright', name: 'Brickwright', beta: 'UngCMwHZ', self: true,
        en: 'Code, circuits & machines', de: 'Code, Schaltungen, Maschinen'},
    {slug: 'cometbeat', name: 'CometBeat', store: '6791962816', beta: 'cKUMvyqU',
        en: 'Learn music theory by playing', de: 'Musik lernen mit Spielen'},
    {slug: 'crispaudio', name: 'CrispAudio', store: '6791876962', beta: 'YpRwC6wF',
        en: 'SFX, voice FX & audio editor', de: 'Effekte, Stimm-FX & Audio-Editor'},
    {slug: 'crispbingo', name: 'CrispBingo', beta: '3CG3SfZ9',
        en: 'Bingo & Tombola for groups', de: 'Bingo & Tombola für Gruppen'},
    {slug: 'crispchess', name: 'CrispChess', beta: 'UCk7DK56',
        en: 'Chess through human eyes', de: 'Schach mit menschlichem Blick'},
    {slug: 'crispcloud', name: 'CrispCloud', beta: 'eFXzu56b',
        en: 'Multi-cloud file manager', de: 'Dateimanager für viele Clouds'},
    {slug: 'crispdeck', name: 'CrispDeck', beta: 'hYwFh4Ut',
        en: 'Mastodon · Bluesky · Threads', de: 'Mastodon · Bluesky · Threads'},
    {slug: 'crispmath', name: 'CrispMath', beta: 'E6HdVhTx',
        en: 'CAS calculator & graphing', de: 'CAS-Rechner & Funktionsgraphen'},
    {slug: 'crispmesh', name: 'CrispMesh', beta: 'Pk6ds8vY',
        en: '3D models from turntable photos', de: '3D-Modelle aus Drehteller-Fotos'},
    {slug: 'crisperplayer', name: 'CrisperPlayer',
        en: 'Your audiobooks, your place', de: 'Deine Hörbücher, dein Ort'},
    {slug: 'crisperweaver', name: 'CrisperWeaver', store: '6789600762', beta: 'svwfvHvh',
        en: 'Offline transcription & speech', de: 'Offline-Transkription & Sprachausgabe'},
    {slug: 'crispsorter', name: 'CrispSorter', beta: 'eqpChBGM',
        en: 'Organise & search documents with local AI', de: 'Dokumente mit lokaler KI ordnen & durchsuchen'},
    {slug: 'crispsudoku', name: 'CrispSudoku', store: '6788990894', beta: 'gjFeKMcH',
        en: 'Classic, Killer, Thermo & more', de: 'Klassisch, Killer, Thermo'},
    {slug: 'crisptuner', name: 'CrispTuner', beta: 'nfCbAzy4',
        en: 'Chromatic tuner & temperaments', de: 'Stimmgerät mit Temperaturen'},
    {slug: 'hectopolis', name: 'Hectopolis', store: '6809142647', mac: true, beta: 'paBCcWnH',
        en: 'Build, observe, understand', de: 'Bauen, beobachten, verstehen'},
    {slug: 'kerotakis', name: 'Kerotakis', store: '6805214816', beta: 'P3WxEdqp',
        en: 'Chemistry that computes', de: 'Chemie, die wirklich rechnet'},
    {slug: 'naga', name: 'Naga – The Snake Game', beta: 'SuVAjkwH',
        en: '27 original twists on Snake', de: '27 neue Wendungen für Snake'},
    {slug: 'numbernebula', name: 'NumberNebula', store: '6789984849', mac: true, beta: 'GDzrzSF5',
        en: 'Cosmic math games for kids', de: 'Kosmische Mathe-Spiele'},
    {slug: 'word-universe', name: 'Word Universe', store: '6790143931', beta: '6CQMmAnt',
        en: 'German & English word games', de: 'Wortschatz spielerisch üben'}
];

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
