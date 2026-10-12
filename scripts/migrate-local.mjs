import './sites-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const built = JSON.parse(fs.readFileSync('dist/server/wrangler.json', 'utf8'));
const config = { name: built.name, compatibility_date: built.compatibility_date, d1_databases: built.d1_databases.map(db => ({ ...db, migrations_dir: path.resolve('drizzle') })) };
fs.mkdirSync('.sites-runtime', { recursive: true });
fs.writeFileSync('.sites-runtime/migrations.json', JSON.stringify(config));
execFileSync(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', '.sites-runtime/migrations.json', '--persist-to', '.wrangler/state'], { stdio: 'inherit' });
