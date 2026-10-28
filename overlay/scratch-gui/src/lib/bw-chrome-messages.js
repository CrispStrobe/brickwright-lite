// English lives in each react-intl defaultMessage; avoid shipping a duplicate catalog.
const german = {
    "gui": {
        "blocksTab": "Blöcke",
        "circuitTab": "Schaltung",
        "fpgaTab": "FPGA",
        "robotLabTab": "Roboter"
    },
    "chrome": {
        "expand": "Menüleiste und Tab-Beschriftungen anzeigen",
        "collapse": "Menüleiste und Tabs zu einem Streifen zusammenfalten"
    },
    "workspace": {
        "heading": "Arbeitsbereich",
        "debugger": "Debugger",
        "top": "Oben",
        "right": "Rechts",
        "fullPane": "Ganzes Fenster",
        "off": "Aus",
        "on": "Ein",
        "whileCoding": "Beim Programmieren",
        "circuit": "Schaltung",
        "scratchStage": "Scratch-Bühne",
        "presentation": "Schaltungsansicht",
        "stageLight": "Bühne · hell",
        "stageDark": "Bühne · dunkel",
        "fullLight": "Volle Breite · hell",
        "fullDark": "Volle Breite · dunkel",
        "fpga": "FPGA-Labor (⬢-Tab)",
        "legacySpike": "Ältere SPIKE-Erweiterungen",
        "showDebugging": "Zur Fehlersuche anzeigen",
        "debuggerHint": "Position des Schaltungs-Debuggers wählen. „Ganzes Fenster“ nutzt beim Programmieren das gesamte rechte Fenster.",
        "codingHint": "Ansicht für das rechte Fenster beim Programmieren wählen",
        "presentationHint": "Anordnung und Darstellung der Schaltung wählen",
        "fpgaHint": "⬢-FPGA-Tab anzeigen: Verilog für den Tang Nano 20K synthetisieren und die virtuelle Platine steuern",
        "legacyHint": "Vier archivierte SPIKE-Prime-Treiber zur Hardware-Fehlersuche in der Erweiterungsgalerie anzeigen"
    },
    "menuBar": {
        "gettingStarted": "Erste Schritte…",
        "lessons": "Lektionen…",
        "reloadBrickwright": "Brickwright neu laden",
        "preferences": "Voreinstellungen",
        "scratchLinkTransport": "Verbindung über Scratch Link…",
        "peerSessions": "Gemeinsame Sitzungen…",
        "virtualSpikePrime": "Virtueller SPIKE Prime…",
        "connectionDiagnostics": "Verbindungsdiagnose…",
        "capabilityDiagnostics": "Funktionsdiagnose…",
        "toolchainManager": "C-Compiler für 8051-Platinen…",
        "aboutBrickwright": "Über Brickwright…",
        "i8086Diagnostics": "8086-Ausführungsdiagnose…",
        "language": "Sprache",
        "colorMode": "Farbmodus",
        "openRecent": "Zuletzt verwendet: {name}",
        "saveProject": "Projekt speichern",
        "saveProjectAs": "Projekt speichern unter…",
        "openProjectError": "Das Projekt konnte nicht geöffnet werden: {error}",
        "openCodeFile": "Code-Datei öffnen…",
        "saveCodeFile": "Code speichern unter…",
        "openCircuit": "Schaltung öffnen…",
        "saveCircuit": "Schaltung speichern",
        "importCircuit": "Schaltung importieren…",
        "exportCircuit": "Schaltung exportieren…",
        "brickwrightLessons": "Brickwright-Lektionen…",
        "tutorialsFile": "Scratch-Anleitungen",
        "offlineLibrary": "Offline-Bibliothek…",
        "downloadMindstormsLms": "Als LEGO MINDSTORMS (.lms) speichern",
        "undo": "Rückgängig",
        "redo": "Wiederholen",
        "findReplace": "Suchen und ersetzen…",
        "goToLine": "Zu Zeile springen…",
        "selectAll": "Alles auswählen",
        "history": "Verlauf",
        "autosaveHistory": "Automatisch speichern & Verlauf…"
    },
    "bw": {
        "editorError": "{name} hatte ein Problem und wurde angehalten. Dein Projekt ist sicher.",
        "editorErrorRetry": "Erneut versuchen"
    }
};
export const chromeMessages = {de: Object.fromEntries(Object.entries(german).flatMap(([section, messages]) =>
    Object.entries(messages).map(([name, message]) => [`gui.${section}.${name}`, message])))};

export const withChromeMessages = catalogs => Object.fromEntries(
    Object.entries(catalogs).map(([locale, messages]) => [locale, {
        ...messages,
        ...(chromeMessages[locale.split(/[-_]/)[0].toLowerCase()] || {})
    }])
);
