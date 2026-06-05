import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    stylistic: false
  }
}).append({
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-import-type-side-effects': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],
    '@typescript-eslint/unified-signatures': 'warn',
    'import/no-duplicates': 'warn',
    'no-empty': 'warn',
    'no-control-regex': 'warn',
    'no-useless-escape': 'warn',
    'vue/html-self-closing': 'warn',
    'vue/no-mutating-props': 'warn',
    'vue/no-v-html': 'warn',
    'vue/require-default-prop': 'warn'
  }
})
