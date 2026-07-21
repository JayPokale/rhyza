// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { execSync } = require('child_process');

const specPath = '../../docs/openapi/admin/admin-api.yaml';

execSync(
  `npx @openapitools/openapi-generator-cli generate \
   -i ${specPath} \
   -g typescript-fetch \
   -o ./src/generated \
   --additional-properties=useSingleRequestParameter=false,enumPropertyNaming=UPPERCASE`,
  { stdio: 'inherit' }
);
