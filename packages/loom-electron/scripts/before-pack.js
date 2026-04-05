/**
 * electron-builder beforePack hook
 *
 * electron-builder's "installing production dependencies" step prunes
 * devDependencies from node_modules before packaging.  7zip-bin is a
 * devDependency, so its linux/x64/7za binary gets removed.  This hook
 * runs immediately after that prune step and immediately before the
 * packaging step that needs the binary for compression.
 *
 * @param {import('electron-builder').BeforePackContext} context
 */
module.exports = async function beforePack(context) {
  // Only needed on Linux — macOS uses a different 7z path, Windows ships it
  if (process.platform !== 'linux') return

  const fs   = require('fs')
  const path = require('path')
  const { execSync } = require('child_process')

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
