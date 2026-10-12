import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dev-only test scripts
    "test-*.js",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // The server renders in its own locale and time zone and the visitor's
      // browser in theirs, so a format call that leaves either one to the
      // runtime produces different HTML on each side and React throws the
      // server render away (error #418). A date formatted in local time can
      // also land on the wrong calendar day.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]:matches([arguments.length=0], [arguments.0.type='Identifier'][arguments.0.name='undefined'], [arguments.0.type='ArrayExpression'][arguments.0.elements.length=0])",
          message: "Pass an explicit 'en-US' locale. Locale-less formatting differs between server and client.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name=/^(NumberFormat|DateTimeFormat|RelativeTimeFormat|PluralRules|ListFormat)$/]:matches([arguments.length=0], [arguments.0.type='Identifier'][arguments.0.name='undefined'], [arguments.0.type='ArrayExpression'][arguments.0.elements.length=0])",
          message: "Pass an explicit 'en-US' locale to Intl formatters. The runtime default differs between server and client.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]:matches([arguments.length<2], [arguments.1.type='ObjectExpression']:not(:has(Property[key.name='timeZone'])))",
          message: "Pass timeZone: 'UTC' when formatting a date or time. The runtime's zone differs between server and client.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']:matches([arguments.length<2], [arguments.1.type='ObjectExpression']:not(:has(Property[key.name='timeZone'])))",
          message: "Pass timeZone: 'UTC' to Intl.DateTimeFormat. The runtime's zone differs between server and client.",
        },
      ],
    },
  },
]);

export default eslintConfig;
