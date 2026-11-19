#!/usr/bin/env node
/**
 * Build the Windows installer, retrying around the OneDrive file lock.
 *
 * `electron-builder` writes `release/win-unpacked/MECHSTUDY OS.exe` and then
 * re-opens it to stamp the version resources. When the project lives inside a
 * OneDrive folder, the sync client grabs the freshly written executable first
 * and the second open fails with `EBUSY: resource busy or locked`. The same race
 * can be caused by an antivirus scanner.
 *
 * Nothing is wrong with the build itself: deleting `release/` and running the
 * same command again succeeds. This script automates that, so `npm run package`
 * is a single command instead of "try until it works".
 *
 * Usage: npm run package
 * Output: release/MECHSTUDY OS Setup <version>.exe
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const tempReleaseDir = join(tmpdir(), 'mechstudy-os-release');
const MAX_ATTEMPTS = 3;

function run(command, args, label) {
  process.stdout.write(`\n> ${label}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  return result.status === 0;
}

function installerFiles(dir = releaseDir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (name) => name.toLowerCase().endsWith('.exe') && !name.includes('uninstaller')
  );
}

if (!run('npx', ['electron-vite', 'build'], 'electron-vite build')) {
  console.error('\nBuild failed. Fix the errors above and re-run.');
  process.exit(1);
}

let built = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  // Always start clean in both release/ and temp directory to avoid locks.
  rmSync(releaseDir, { recursive: true, force: true });
  rmSync(tempReleaseDir, { recursive: true, force: true });
  mkdirSync(tempReleaseDir, { recursive: true });

  const ok = run(
    'npx',
    ['electron-builder', '--win', '--x64', `-c.directories.output=${tempReleaseDir}`],
    `electron-builder (attempt ${attempt}/${MAX_ATTEMPTS})`
  );

  const installers = installerFiles(tempReleaseDir);
  if (ok && installers.length > 0) {
    built = true;
    mkdirSync(releaseDir, { recursive: true });
    // Copy all produced files to release/
    for (const name of readdirSync(tempReleaseDir)) {
      const srcPath = join(tempReleaseDir, name);
      const destPath = join(releaseDir, name);
      try {
        if (!name.includes('win-unpacked')) {
          copyFileSync(srcPath, destPath);
        }
      } catch (err) {
        console.warn(`Could not copy ${name} to release:`, err);
      }
    }

    console.log('\nInstaller ready:');
    for (const name of installers) console.log(`  release/${name}`);
    break;
  }

  if (attempt < MAX_ATTEMPTS) {
    console.warn(
      `\nAttempt ${attempt} did not produce an installer. Retrying with a clean release/ ...`
    );
  }
}

if (!built) {
  console.error(
    '\nNo installer was produced after ' + MAX_ATTEMPTS + ' attempts.\n' +
      'Try: close the app, pause OneDrive sync, delete release/, run npm run package again.\n' +
      'See docs/IMPLEMENTATION_STATUS.md section 8 for other causes.'
  );
  process.exit(1);
}
