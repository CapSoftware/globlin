import { globSync } from '../js/index.js';
import { globSync as globOriginal } from 'glob';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures/large');

// Verify results match
const patterns = ['*.js', '**/*.js', 'level0/*.js'];
for (const pattern of patterns) {
  const g1 = globOriginal(pattern, { cwd: FIXTURES_DIR }).sort();
  const g2 = globSync(pattern, { cwd: FIXTURES_DIR }).sort();
  console.log(`Pattern: ${pattern}`);
  console.log(`  glob: ${g1.length} results`);
  console.log(`  globlin: ${g2.length} results`);
  if (g1.length !== g2.length) {
    console.log('  MISMATCH!');
    // Show first few different
    const diff1 = g1.filter(x => !g2.includes(x)).slice(0, 5);
    const diff2 = g2.filter(x => !g1.includes(x)).slice(0, 5);
    console.log('  Only in glob:', diff1);
    console.log('  Only in globlin:', diff2);
  }
}
