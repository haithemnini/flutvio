/**
 * scripts/after-pack.cjs — electron-builder hook: runs after packaging, before signing.
 * Signing is handled by electron-builder (Developer ID Application).
 * Notarization happens in afterSign (notarize.cjs).
 */
exports.default = async function afterPack(_context) {
  // nothing to do here — signing and notarization happen next
}
