/**
 * Voting System - Build & Packaging Script
 *
 * Usage:
 *   node build.js               # Build all platform packages
 *   node build.js win           # Build Windows package only
 *   node build.js mac           # Build macOS package only
 *   node build.js zip           # Build portable ZIP only
 *   node build.js nsis          # Build NSIS installer script only
 *
 * Output:
 *   installer/output/
 *     VotingSystem-v1.0.0-win.zip       - Windows portable package
 *     VotingSystem-v1.0.0-mac.tar.gz    - macOS portable package
 *     VotingSystem-v1.0.0.zip           - Cross-platform portable ZIP
 *     VotingSystem-Setup-1.0.0.exe      - NSIS installer (requires NSIS)
 *     VotingSystem-1.0.0.dmg            - macOS DMG (requires hdiutil)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createGzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pkg = {
    name: 'VotingSystem',
    version: '1.0.0',
    description: 'Online Voting System',
};

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(__dirname, 'output');
const DIST = path.join(__dirname, 'dist');

// Files and directories to include in the distribution
const INCLUDE_PATHS = [
    'admin',
    'api',
    'assets',
    'config',
    'database',
    'uploads',
    'installer',
    'index.php',
    'results.php',
    '.htaccess',
];

const EXCLUDE_PATTERNS = [
    /node_modules/,
    /\.git/,
    /_diag/,
    /_fix_/,
    /Votesys\.zip$/,
    /\.sqlite/,
    /\.log$/,
    /[\\\/]installer[\\\/]output[\\\/]/,
    /[\\\/]installer[\\\/]dist[\\\/]/,
    /[\\\/]dist[\\\/]/,
];

function log(section, msg) {
    const colors = { ok: 32, err: 31, info: 36, warn: 33 };
    const c = Object.keys(colors).includes(section) ? colors[section] : 0;
    const prefix = c ? `\x1b[${c}m[${section.toUpperCase()}]\x1b[0m` : `[${section}]`;
    console.log(`${prefix} ${msg}`);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function shouldExclude(name) {
    return EXCLUDE_PATTERNS.some(p => p.test(name));
}

/**
 * Collect all files recursively, respecting excludes.
 */
function collectFiles(srcDir, prefix = '') {
    let entries = [];
    const items = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const item of items) {
        const relPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (shouldExclude(relPath)) continue;
        const fullPath = path.join(srcDir, item.name);
        if (item.isDirectory()) {
            entries = entries.concat(collectFiles(fullPath, relPath));
        } else {
            entries.push({ relPath, fullPath });
        }
    }
    return entries;
}

/**
 * Build a portable ZIP package (cross-platform).
 */
async function buildPortableZip() {
    log('info', 'Building portable ZIP package...');

    const zipName = `${pkg.name}-${pkg.version}.zip`;
    const zipPath = path.join(OUTPUT, zipName);

    // Use tar.exe on Windows, tar on macOS
    const files = collectFiles(ROOT, '.');
    const fileList = files.map(f => f.relPath).join('\n');
    const listFile = path.join(OUTPUT, '_filelist.txt');
    fs.writeFileSync(listFile, fileList);

    try {
        execSync(
            `tar.exe -a -cf "${zipPath}" -T "${listFile}"`,
            { cwd: ROOT, stdio: 'pipe' }
        );
        log('ok', `Created ${zipName} (${formatSize(zipPath)})`);
    } catch (e) {
        // Fallback: use Node.js archiver or PowerShell Compress-Archive
        execSync(
            `powershell -Command "Compress-Archive -Path (Get-Content '${listFile}') -DestinationPath '${zipPath}' -Force"`,
            { cwd: ROOT, stdio: 'pipe', shell: 'powershell' }
        );
        log('ok', `Created ${zipName} via PowerShell (${formatSize(zipPath)})`);
    } finally {
        if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
    }

    return zipPath;
}

/**
 * Build Windows portable package (ZIP with launcher).
 */
async function buildWindowsPackage() {
    log('info', 'Building Windows portable package...');

    const winDir = path.join(DIST, 'win');
    ensureDir(winDir);

    // Copy app files
    const files = collectFiles(ROOT, '.');
    for (const f of files) {
        const dest = path.join(winDir, f.relPath);
        ensureDir(path.dirname(dest));
        fs.copyFileSync(f.fullPath, dest);
    }

    // Copy launcher to root
    const launcherSrc = path.join(__dirname, 'windows', 'start-voting-system.bat');
    const launcherDest = path.join(winDir, 'start-voting-system.bat');
    fs.copyFileSync(launcherSrc, launcherDest);

    // Create ZIP
    const zipName = `${pkg.name}-${pkg.version}-win.zip`;
    const zipPath = path.join(OUTPUT, zipName);
    execSync(
        `powershell -Command "Compress-Archive -Path '${winDir}\\*' -DestinationPath '${zipPath}' -Force"`,
        { stdio: 'pipe', shell: 'powershell' }
    );

    log('ok', `Created ${zipName} (${formatSize(zipPath)})`);

    // Cleanup
    fs.rmSync(winDir, { recursive: true, force: true });

    return zipPath;
}

/**
 * Build macOS portable package (tar.gz with launcher).
 */
async function buildMacPackage() {
    log('info', 'Building macOS portable package...');

    const macDir = path.join(DIST, 'mac');
    ensureDir(macDir);

    // Copy app files
    const files = collectFiles(ROOT, '.');
    for (const f of files) {
        const dest = path.join(macDir, f.relPath);
        ensureDir(path.dirname(dest));
        fs.copyFileSync(f.fullPath, dest);
    }

    // Copy macOS launcher and .app bundle
    const launcherSrc = path.join(__dirname, 'macos', 'start-voting-system.command');
    const appBundleSrc = path.join(__dirname, 'macos', 'VotingSystem.app');

    fs.copyFileSync(launcherSrc, path.join(macDir, 'start-voting-system.command'));
    copyDirSync(appBundleSrc, path.join(macDir, 'VotingSystem.app'));

    // Make scripts executable
    execSync(`icacls "${macDir}\\start-voting-system.command" /grant Everyone:RX`, { stdio: 'pipe' });

    // Create tar.gz
    const pkgName = `${pkg.name}-${pkg.version}-mac.tar.gz`;
    const pkgPath = path.join(OUTPUT, pkgName);
    execSync(
        `tar.exe -a -cf "${pkgPath}" -C "${DIST}" mac`,
        { stdio: 'pipe' }
    );

    log('ok', `Created ${pkgName} (${formatSize(pkgPath)})`);

    // Cleanup
    fs.rmSync(macDir, { recursive: true, force: true });

    return pkgPath;
}

/**
 * Generate the NSIS installer script with correct paths.
 */
function buildNsisScript() {
    log('info', 'Generating NSIS installer script...');

    const src = path.join(__dirname, 'windows', 'installer.nsi');
    const dest = path.join(OUTPUT, 'VotingSystem-installer.nsi');

    let content = fs.readFileSync(src, 'utf8');
    // The .nsi already references relative paths, just copy it
    fs.copyFileSync(src, dest);

    log('ok', `Generated installer script: ${dest}`);
    log('info', 'Compile with: makensis VotingSystem-installer.nsi');
    log('info', 'Download NSIS: https://nsis.sourceforge.io/Download');

    return dest;
}

function formatSize(filePath) {
    const bytes = fs.statSync(filePath).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copyDirSync(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

/**
 * Generate a simple SVG icon for the application.
 */
function generateIcons() {
    const assetsDir = path.join(ROOT, 'assets');
    ensureDir(assetsDir);

    // Simple SVG icon
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="#2563eb"/>
  <text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="#fff" text-anchor="middle">V</text>
</svg>`;
    fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svg);
    log('ok', 'Generated icon.svg');
}

/**
 * Main build orchestrator.
 */
async function main() {
    const args = process.argv.slice(2);
    const targets = args.length ? args : ['all'];

    ensureDir(OUTPUT);
    ensureDir(DIST);

    generateIcons();

    const builds = [];

    if (targets.includes('all') || targets.includes('zip')) {
        builds.push(buildPortableZip());
    }
    if (targets.includes('all') || targets.includes('win')) {
        builds.push(buildWindowsPackage());
    }
    if (targets.includes('all') || targets.includes('mac')) {
        builds.push(buildMacPackage());
    }
    if (targets.includes('all') || targets.includes('nsis')) {
        builds.push(Promise.resolve(buildNsisScript()));
    }

    await Promise.all(builds);

    // Cleanup dist
    if (fs.existsSync(DIST)) {
        fs.rmSync(DIST, { recursive: true, force: true });
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    log('ok', `Build complete! Output in: ${OUTPUT}`);
    console.log('');
    const outputs = fs.readdirSync(OUTPUT).filter(f => f !== '_filelist.txt');
    for (const f of outputs) {
        const fp = path.join(OUTPUT, f);
        const stat = fs.statSync(fp);
        const size = stat.isFile() ? formatSize(fp) : '(dir)';
        console.log(`  ${f.padEnd(40)} ${size}`);
    }
    console.log('='.repeat(50));
}

main().catch(err => {
    log('err', err.message);
    process.exit(1);
});
