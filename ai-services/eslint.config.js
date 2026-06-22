export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        Date: "readonly",
        Object: "readonly",
        parseInt: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];
