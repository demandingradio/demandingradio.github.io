// Runs the syntax check over every game script, then every dev/tests/*.test.js.
//   cd worldbuild && deno run -A dev/tests/run.js            (all)
//   cd worldbuild && deno run -A dev/tests/run.js realm      (only files whose name contains "realm")
import { runAll } from './harness.js';

const ROOT = new URL('../../', import.meta.url);
const filter = Deno.args[0] || '';
let failures = 0;

// 1) syntax: every js/*.js must parse as a classic script (no execution)
let checked = 0;
for (const e of Deno.readDirSync(new URL('js/', ROOT))) {
  if (!e.name.endsWith('.js')) continue;
  const src = Deno.readTextFileSync(new URL('js/' + e.name, ROOT));
  try { new Function(src); checked++; }
  catch (err) { failures++; console.log(`SYNTAX js/${e.name}: ${err.message}`); }
}
console.log(`syntax: ${checked} files parse`);

// 2) tests
const files = [];
for (const e of Deno.readDirSync(new URL('./', import.meta.url))) if (e.name.endsWith('.test.js') && e.name.includes(filter)) files.push(e.name);
files.sort();
for (const f of files) {
  console.log(`\n# ${f}`);
  try { await import('./' + f); failures += await runAll(f); }
  catch (err) { failures++; console.log(`  LOAD FAIL ${f}: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n  ') : err}`); }
}
console.log(failures ? `\n${failures} failure(s)` : '\nall green');
Deno.exit(failures ? 1 : 0);
