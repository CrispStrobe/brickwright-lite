import React from 'react';

// Each AppStateHOC instance supplies its own installer. A module-global store
// would make two embedded GUIs install into whichever instance mounted last.
const DynamicReducerContext = React.createContext(null);

export default DynamicReducerContext;
