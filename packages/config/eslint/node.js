import base from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ["**/*.{ts,js}"],
    languageOptions: {
      globals: { ...require("globals").node }
    },
    rules: {
      "no-process-exit": "off"
    }
  }
];
