export default [
  {
    ignores: ["node_modules/", "dist/", "build/", ".next/"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];