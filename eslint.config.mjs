// The synced base is cplieger/ci's; change it there, never here.
import baseConfig from "./eslint.config.base.mjs";

export default [
  ...baseConfig,
  // The gallery's own versions of the elements whose cards do not run on
  // src/ yet, each deleted as its card moves onto src/.
  { ignores: ["gallery/legacy/**"] },
];
