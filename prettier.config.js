/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false, // double quotes read more naturally with JSX and JSON
  quoteProps: "as-needed",
  trailingComma: "all", // cleaner diffs — no comma-only line changes
  bracketSpacing: true, // { x } over {x}
  bracketSameLine: false, // JSX closing > on its own line
  arrowParens: "always", // (x) => always — consistent even for single param
  endOfLine: "lf",
  jsxSingleQuote: false,
};
