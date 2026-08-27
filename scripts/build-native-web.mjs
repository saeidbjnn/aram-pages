import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'www');
const files = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js'];
const dirs = ['js', 'icons', 'assets'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) await cp(path.join(root, file), path.join(output, file));
for (const dir of dirs) await cp(path.join(root, dir), path.join(output, dir), { recursive: true });

// The native WebView loads local files. Keep the service worker source in the bundle for
// PWA parity, but the app itself does not depend on service-worker registration in Capacitor.
const indexPath = path.join(output, 'index.html');
const index = await readFile(indexPath, 'utf8');
await writeFile(indexPath, index, 'utf8');

const countFiles = async dir => {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
};
console.log(`Prepared ${await countFiles(output)} native web assets in www/`);
