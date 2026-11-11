/**
 * flutterCommands.ts — the Flutter tab's shell id and input checks.
 */

/** PTY id of the Flutter tab's shell. */
export const FLUTTER_TERM = 'flutter'

/** A pub.dev package name (optionally with a version: `dio:^5.4.0`), or several separated by spaces. */
export const isPackageSpec = (v: string): boolean => /^[a-z_][a-z0-9_]*(:[\w.^<>=+-]+)?( [a-z_][a-z0-9_]*(:[\w.^<>=+-]+)?)*$/.test(v)
