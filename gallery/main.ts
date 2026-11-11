/**
 * main.ts — the gallery's script. It runs `legacy/`, the gallery's own
 * versions of the elements whose cards do not run on `src/` yet; as an
 * element moves into the library, its card imports the library's module here
 * as an app does, and its legacy version goes.
 */

import "./legacy/gallery.js";
