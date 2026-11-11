/**
 * scripts/after-pack.cjs — electron-builder hook: ad-hoc sign the packaged app.
 * Releases are not notarized yet; Apple Silicon still refuses to run code with no (or a
 * broken) signature, so the bundle is signed "to run locally" after packaging.
 */
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed  ${app}`)
}
