import React from 'react';
import {FormattedMessage} from 'react-intl';
import keyMirror from 'keymirror';

import successImage from '../assets/icon--success.svg';

const AlertTypes = keyMirror({
    STANDARD: null,
    EXTENSION: null,
    INLINE: null
});

const AlertLevels = {
    SUCCESS: 'success',
    INFO: 'info',
    WARN: 'warn'
};

const alerts = [
    {
        alertId: 'createSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="New project created."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createCopySuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a copy."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createcopysuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createRemixSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a remix."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createremixsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'creating',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Creating new…"
                description="Message indicating that project is in process of creating"
                id="gui.alerts.creating"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingCopy',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Copying project…"
                description="Message indicating that project is in process of copying"
                id="gui.alerts.creatingCopy"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingRemix',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Remixing project…"
                description="Message indicating that project is in process of remixing"
                id="gui.alerts.creatingRemix"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Could not create the project. Please try again!"
                description="Message indicating that project could not be created"
                id="gui.alerts.creatingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'savingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        showDownload: true,
        showSaveNow: true,
        closeButton: false,
        content: (
            <FormattedMessage
                defaultMessage="Project could not save."
                description="Message indicating that project could not be saved"
                id="gui.alerts.savingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        // Brickwright: "Save to Computer" failing. DISTINCT from `savingError`,
        // which belongs to the cloud-save flow and offers Download / Save-now
        // buttons that make no sense for a local export. This one is dismissible
        // and carries the real error text via `data.message`, because the whole
        // problem with the iOS report was that a failed export was silent: the
        // downloader called .then() with no .catch(), so a rejection became an
        // unhandled promise rejection and the user saw nothing happen.
        alertId: 'exportError',
        alertType: AlertTypes.STANDARD,
        clearList: ['exportError'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Could not save the project to your computer."
                description="Message shown when exporting a project file failed"
                id="gui.alerts.exportError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'saveSuccess',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved."
                description="Message indicating that project was successfully saved"
                id="gui.alerts.savesuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'saving',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError'],
        content: (
            <FormattedMessage
                defaultMessage="Saving project…"
                description="Message indicating that project is in process of saving"
                id="gui.alerts.saving"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.INFO
    },
    {
        alertId: 'cloudInfo',
        alertType: AlertTypes.STANDARD,
        clearList: ['cloudInfo'],
        content: (
            <FormattedMessage
                defaultMessage="Please note, cloud variables only support numbers, not letters or symbols. {learnMoreLink}" // eslint-disable-line max-len
                description="Info about cloud variable limitations"
                id="gui.alerts.cloudInfo"
                values={{
                    learnMoreLink: (
                        <a
                            href="https://scratch.mit.edu/info/faq/#clouddata"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <FormattedMessage
                                defaultMessage="Learn more."
                                description="Link text to cloud var faq"
                                id="gui.alerts.cloudInfoLearnMore"
                            />
                        </a>
                    )
                }}
            />
        ),
        closeButton: true,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 15
    },
    {
        alertId: 'importingAsset',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                defaultMessage="Importing…"
                description="Message indicating that project is in process of importing"
                id="gui.alerts.importing"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    // Brickwright: a REFUSED sidecar. The reason line already exists — the Code
    // tab's status strip — but that is one tab's surface, and opening a project
    // changes the active tab, so the notice was written where the learner had
    // just stopped looking (measured 2026-09-02: the assertion found the right
    // text in a HIDDEN span, 32 polls running). A refusal is an app-level fact
    // about the file that was just opened, so it belongs on the app-level alert
    // surface, which gui.jsx already mounts outside the tab strip.
    //
    // One alert per REASON rather than one alert carrying an interpolated
    // string, because `data.message` is dead: reducers/alerts.js sets it,
    // containers/alerts.jsx forwards it, containers/alert.jsx forwards it, and
    // components/alerts/alert.jsx neither destructures nor renders it, so
    // showStandardAlertWithMessage's detail is dropped on the floor. Named
    // messages are also the only translatable form; an interpolated reason
    // would ship English into every locale.
    {
        alertId: 'bwBundleRefusedFuture',
        alertType: AlertTypes.STANDARD,
        clearList: ['bwBundleRefusedFuture', 'bwBundleRefusedInvalid', 'bwBundleRefusedStorage'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="This project was saved by a newer version of Brickwright. Its blocks opened, but its circuit, code and widgets were not applied — what you had is still here."
                description="Shown when a project's Brickwright sidecar is too new to apply"
                id="gui.alerts.bwBundleRefusedFuture"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'bwBundleRefusedInvalid',
        alertType: AlertTypes.STANDARD,
        clearList: ['bwBundleRefusedFuture', 'bwBundleRefusedInvalid', 'bwBundleRefusedStorage'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="This project's Brickwright data could not be read. Its blocks opened, but its circuit, code and widgets were not applied — what you had is still here."
                description="Shown when a project's Brickwright sidecar is malformed"
                id="gui.alerts.bwBundleRefusedInvalid"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'bwBundleRefusedStorage',
        alertType: AlertTypes.STANDARD,
        clearList: ['bwBundleRefusedFuture', 'bwBundleRefusedInvalid', 'bwBundleRefusedStorage'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Browser storage refused this project's Brickwright data, so its circuit, code and widgets were not applied — what you had is still here."
                description="Shown when browser storage rejects a project's Brickwright sidecar"
                id="gui.alerts.bwBundleRefusedStorage"
            />
        ),
        level: AlertLevels.WARN
    }
];

export {
    alerts as default,
    AlertLevels,
    AlertTypes
};
