// The synced base is cplieger/ci's; change it there, never here.
import baseConfig from "./eslint.config.base.mjs";

export default [
  ...baseConfig,
  // The gallery's own versions of the elements not yet in src/, each deleted
  // as its element moves in.
  { ignores: ["gallery/legacy/**"] },
];
