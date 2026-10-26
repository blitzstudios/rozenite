#!/usr/bin/env node
// Builds one package and publishes it as a gitpkg tag, `<name without scope>-v<version>-gitpkg`. gitpkg copies
// package.json as it is, so while it runs each `workspace:` dependency is swapped for this fork's tag of that package
// when one is published, and otherwise for the upstream npm release of the same version.
//
//   node scripts/publish_gitpkg.mjs packages/runtime
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'blitzstudios/rozenite.git';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.resolve(root, process.argv[2] ?? '');
const manifestPath = path.join(dir, 'package.json');
if (!process.argv[2] || !fs.existsSync(manifestPath)) {
  console.error('Usage: node scripts/publish_gitpkg.mjs <package directory>');
  process.exit(1);
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options });
const tagOf = (name, version) => `${name.replace(/^@/, '').replace(/\//g, '-')}-v${version}-gitpkg`;
const published = (tag) => run('git', ['ls-remote', '--tags', 'origin', tag]).trim() !== '';
const onNpm = (name, version) => {
  try {
    return run('npm', ['view', `${name}@${version}`, 'version']).trim() === version;
  } catch {
    return false;
  }
};

const versions = Object.fromEntries(
  fs.readdirSync(path.join(root, 'packages')).flatMap((name) => {
    const file = path.join(root, 'packages', name, 'package.json');
    if (!fs.existsSync(file)) return [];
    const { name: packageName, version } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [[packageName, version]];
  }),
);

const original = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(original);
const ownTag = tagOf(manifest.name, manifest.version);
if (published(ownTag)) {
  console.error(`${ownTag} is already on origin: bump the version first.`);
  process.exit(1);
}

for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const [name, range] of Object.entries(manifest[field] ?? {})) {
    if (!String(range).startsWith('workspace:')) continue;
    const version = versions[name];
    if (published(tagOf(name, version))) {
      manifest[field][name] = `${REPO}#${tagOf(name, version)}`;
    } else if (onNpm(name, version)) {
      manifest[field][name] = version;
    } else {
      console.error(
        `${manifest.name} depends on ${name}@${version}, which is neither tagged on origin nor on npm.`,
      );
      process.exit(1);
    }
  }
}
delete manifest.devDependencies;

run('pnpm', ['turbo', 'run', 'build', `--filter=${manifest.name}`], { stdio: 'inherit' });

const license = path.join(dir, 'LICENSE');
const copiesLicense = !fs.existsSync(license);
try {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (copiesLicense) fs.copyFileSync(path.join(root, 'LICENSE'), license);
  execFileSync('gitpkg', ['publish'], { cwd: dir, stdio: 'inherit' });
} finally {
  fs.writeFileSync(manifestPath, original);
  if (copiesLicense) fs.rmSync(license, { force: true });
}
