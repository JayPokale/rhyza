import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.yaml',
  output: 'src/types/generated',
  plugins: ['@hey-api/typescript']
});
