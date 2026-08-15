// Single source of truth for the displayed version: package.json.
// Import this from SERVER components only and pass the value down as a prop —
// importing it into a client component would bundle package.json (and every
// dependency name in it) into the browser payload.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
