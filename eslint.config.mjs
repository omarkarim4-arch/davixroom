import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Architectural boundary: the domain core must stay pure.
  //
  // Nothing in src/core may import React, Next.js, or any infrastructure SDK.
  // This is what keeps the domain testable in milliseconds and lets Supabase or
  // LiveKit be swapped without touching business rules. Adapters live outside
  // core and depend inward, never the reverse.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'The domain core must not depend on React.' },
            { name: 'react-dom', message: 'The domain core must not depend on React.' },
          ],
          patterns: [
            {
              group: [
                'next',
                'next/*',
                '@supabase/*',
                'livekit-client',
                'livekit-server-sdk',
                '@anthropic-ai/*',
              ],
              message:
                'The domain core must not depend on infrastructure. Define a port in src/core/ports and implement it in an adapter.',
            },
            {
              group: ['@/app/*', '../app/*'],
              message: 'The domain core must not depend on the UI layer.',
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
  ]),
]);

export default eslintConfig;
