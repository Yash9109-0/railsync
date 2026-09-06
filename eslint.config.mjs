import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { FlatCompat } from "@eslint/eslintrc/FlatCompat"

const __dirname = dirname(fileURLToPath(import.meta.url))

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
})

export default [
  {
    ignores: ["node_modules/", ".next/", "dist/", "build/"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
]
