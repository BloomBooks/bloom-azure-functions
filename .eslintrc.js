// Nov 2023, this repo was half set up for tslint, half eslint. And neither was working.
// I tried to do an automatic migration of the tslint settings to eslint. Simply stated, it didn't work.
// So I just copied this from BloomDesktop and removed all the React stuff.
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // Rules to apply on top of the baseline ones (from "extends")
    // FYI, to see all the rule settings, run "eslint --print-config *.ts"
    "prettier/prettier": "off",
    "no-var": "warn",
    "prefer-const": "warn",
    "no-useless-escape": "off",
    "no-warning-comments": [1, { terms: ["nocommit"], location: "anywhere" }],
    // Downgraded from error to warnings
    "@typescript-eslint/no-empty-function": "warn",
    "@typescript-eslint/no-empty-interface": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-var-requires": "warn",
    "no-case-declarations": "warn",
    "prefer-rest-params": "warn",
    "prefer-spread": "warn",
    eqeqeq: ["warn", "always"],
    // Disabled
    "@typescript-eslint/ban-types": "off", // Record<string, never> is not intuitive for us compared to {}
    "@typescript-eslint/no-inferrable-types": "off", // not worth worrying about (not even convinced it's a problem at all)
    "@typescript-eslint/triple-slash-reference": "off", // a lot of our legacy code still uses this
  },
};
