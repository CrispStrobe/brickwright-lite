import React from 'react';
import {ContextMenu, MenuItem} from 'react-contextmenu';
import classNames from 'classnames';

import styles from './context-menu.css';

// react-contextmenu's keyboard-navigation collector guards `!child` (null,
// undefined, false) but then reads `child.props` — which throws
// "undefined is not an object (evaluating 'e.disabled')" for a truthy
// NON-element child (a stray string/number/text node between MenuItems).
// Passing only valid elements through makes that path unreachable for
// every menu that uses this wrapper (all of them).
const StyledContextMenu = ({children, ...props}) => (
    <ContextMenu
        {...props}
        className={styles.contextMenu}
    >
        {React.Children.toArray(children).filter(React.isValidElement)}
    </ContextMenu>
);

const StyledMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: styles.menuItem}}
    />
);

const BorderedMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: classNames(styles.menuItem, styles.menuItemBordered)}}
    />
);

const DangerousMenuItem = props => (
    <MenuItem
        {...props}
        attributes={{className: classNames(styles.menuItem, styles.menuItemBordered, styles.menuItemDanger)}}
    />
);


export {
    BorderedMenuItem,
    DangerousMenuItem,
    StyledContextMenu as ContextMenu,
    StyledMenuItem as MenuItem
};
