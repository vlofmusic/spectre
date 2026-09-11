import { mkdir, readdir, cp, rm, rename, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// Authored frontend stays in dist/. Only generated client/server/metadata are replaced.
await rm('dist/client',{recursive:true,force:true});await rm('dist/server',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});
for(const entry of await readdir('dist',{withFileTypes:true})) {
 if(['client','server','.openai'].includes(entry.name))continue;
 await cp(`dist/${entry.name}`,`dist/client/${entry.name}`,{recursive:true});
}
const build=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--assets','dist/client','--outdir','dist/server'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(build.status!==0)process.exit(build.status||1);
await rename('dist/server/worker.js','dist/server/index.js');
await mkdir('dist/.openai',{recursive:true});await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await rm('dist/.openai/drizzle',{recursive:true,force:true});await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker, public client assets and schema migrations. Nothing deployed.');
