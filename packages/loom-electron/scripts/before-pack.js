/**
 * electron-builder beforePack hook
 *
 * Runs immediately after electron-builder's "installing production
 * dependencies" step and immediately before packing.  Two jobs:
 *
 * 1. Rebuild native .node modules for the target Electron version.
 *    electron-builder's own npmRebuild silently fails in the npm workspaces
 *    monorepo layout, so we do it here instead.
 *
 * 2. On Linux: restore the 7za binary that the production-deps prune removes
 *    (7zip-bin is a devDependency so its binary gets stripped).
 *
 * @param {import('electron-builder').BeforePackContext} context
 */
module.exports = async function beforePack(context) {
  const fs         = require('fs')
  const path       = require('path')
  const { execSync } = require('child_process')

  // ── 1. Rebuild native modules for this Electron version ──────────────────
  const electronVersion = context.packager.config.electronVersion
    || require('electron/package.json').version
    || '28.0.0'
  const projectDir = context.packager.projectDir
  console.log(`[before-pack] Rebuilding native modules for Electron ${electronVersion}`)
  try {
    execSync(
      `npx electron-rebuild --version ${electronVersion} --force`,
      { stdio: 'inherit', cwd: projectDir }
    )
    console.log('[before-pack] Native module rebuild complete')
  } catch (err) {
    console.error('[before-pack] electron-rebuild failed:', err.message)
    // Non-fatal: log it and continue; a bad ABI will surface at startup
  }

  // ── 2. Restore 7za binary on Linux ───────────────────────────────────────
  // Only needed on Linux — macOS uses a different 7z path, Windows ships it
  if (process.platform !== 'linux') return

  let p7za
  try {
    p7za = require('7zip-bin').path7za
  } catch (_) {
    // 7zip-bin itself was removed — reconstruct the conventional path
    const root = path.resolve(__dirname, '..', '..', '..')
    p7za = path.join(root, 'node_modules', '7zip-bin', 'linux', 'x64', '7za')
  }

  console.log(`[before-pack] 7za path: ${p7za}`)
  fs.mkdirSync(path.dirname(p7za), { recursive: true })

  if (!fs.existsSync(p7za)) {
    // Find system 7za installed via p7zip-full
    const candidates = ['7za', '7zr', '7z']
    let sys7za = null
    for (const bin of candidates) {
      try {
        sys7za = execSync(`which ${bin}`).toString().trim()
        break
      } catch (_) { /* not found */ }
    }
    if (!sys7za) {
      throw new Error('[before-pack] Could not find system 7zip binary. Install p7zip-full.')
    }
    fs.copyFileSync(sys7za, p7za)
    fs.chmodSync(p7za, 0o755)
    console.log(`[before-pack] Installed 7za from ${sys7za} → ${p7za}`)
  } else {
    // Ensure +x in case the pruner left the file but stripped permissions
    fs.chmodSync(p7za, 0o755)
    console.log('[before-pack] 7za present, ensured +x')
  }
}
