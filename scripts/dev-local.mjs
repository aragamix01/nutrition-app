// `npm run dev:local`: next dev on the local PGlite database with a canned AI answer,
// even when .env.local points DATABASE_URL at Neon. Next never overrides variables that
// are already set, so an empty DATABASE_URL here wins over .env.local.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: '',
    GEMINI_MOCK: 'true',
    DEV_BYPASS_AUTH: 'true',
    NEXT_DIST_DIR: '.next-local',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
