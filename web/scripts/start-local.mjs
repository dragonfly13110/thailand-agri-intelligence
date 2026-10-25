// This entry point deliberately cannot bind a private-data server to an external interface.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--port' && /^\d{2,5}$/.test(args[1]))) throw new Error('Only --port is supported');
const child = spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',args[1] ?? '3123'],{
  stdio:'inherit',windowsHide:true,env:{...process.env,TADIH_LOCAL_DATA:'1'},
});
child.on('exit',code => {process.exitCode=code ?? 1;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
