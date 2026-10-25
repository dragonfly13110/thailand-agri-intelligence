import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const web = join(process.cwd(), 'web');
const cf = (args, options = {}) => spawnSync('npx', ['cf', ...args], {
  cwd: web,
  shell: true,
  encoding: 'utf8',
  ...options,
});

const auth = cf(['auth', 'whoami']);
let authenticated = false;
try {
  authenticated = auth.status === 0 && JSON.parse(auth.stdout || '{}').authenticated === true;
} catch {}

if (!authenticated) {
  console.error('Cloudflare CLI is not authenticated. Run `cf auth login` and retry.');
  process.exit(1);
}

console.log('Cloudflare CLI authenticated.');
if (process.argv.includes('--deploy')) {
  const deploy = cf(['previews', 'deploy', 'preview-1'], { stdio: 'inherit' });
  process.exit(deploy.status ?? 1);
}
