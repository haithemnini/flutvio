/**
 * scripts/notarize.cjs — electron-builder afterSign hook: submit the app to Apple for
 * notarization, then wait for approval. Requires a keychain profile named "flutvio-notary"
 * created with: xcrun notarytool store-credentials flutvio-notary --apple-id <email> --team-id 9UZ56J7UQF
 */
const { notarize } = require('@electron/notarize')
const { join } = require('node:path')

exports.default = async function notarizeApp(context) {
  if (context.electronPlatformName !== 'darwin') return

  const { appOutDir, packager } = context
  const appName = packager.appInfo.productFilename
  const appPath = join(appOutDir, `${appName}.app`)

  console.log(`  • notarizing  ${appPath}`)

  await notarize({
    appPath,
    keychainProfile: 'flutvio-notary',
  })

  console.log(`  • notarization complete`)
}
