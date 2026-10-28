// Modified by Heard: an offline plan writer; it never contacts either application.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { planHeardChatImport } from './plan';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || process.argv.length !== 4) {
  throw new Error(
    'Usage: npm run plan:heard-chat -w @colanode/scripts -- <input.json> <new-output.json>'
  );
}
if (resolve(inputPath) === resolve(outputPath)) {
  throw new Error('Input and output paths must differ');
}

const input: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
const plan = planHeardChatImport(input);
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
  flag: 'wx',
  mode: 0o600,
});
process.stdout.write(
  `Prepared ${plan.messages.length} messages with ${plan.issues.length} parity issues. No data was imported.\n`
);
