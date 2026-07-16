const fs = require('fs');
const yaml = require('yaml');
const { execSync } = require('child_process');

const specPath = '../admin-api-service/openapi.yaml';
const spec = yaml.parse(fs.readFileSync(specPath, 'utf8'));

const version = spec.info.version;

execSync(
  `npx @openapitools/openapi-generator-cli generate \
   -i ${specPath} \
   -g typescript-fetch \
   -o ./src/generated \
   --additional-properties=useSingleRequestParameter=false,npmVersion=${version}`,
  { stdio: 'inherit' }
);
