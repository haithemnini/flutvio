/**
 * dartGrammar.ts — Dart syntax colouring (Monarch) and editing rules for Monaco.
 * Monaco ships no Dart grammar; this covers keywords, types, annotations, numbers,
 * comments (incl. ///), and strings with $name / ${expr} interpolation and raw/triple forms.
 */

import type * as Monaco from 'monaco-editor'

export const dartLanguageConfig: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
    { open: '/**', close: ' */', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '<', close: '>' },
  ],
  folding: { markers: { start: /^\s*\/\/\s*#?region\b/, end: /^\s*\/\/\s*#?endregion\b/ } },
  indentationRules: {
    increaseIndentPattern: /^.*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/,
    decreaseIndentPattern: /^\s*[}\])].*$/,
  },
  onEnterRules: [
    // Continue /// doc comments.
    { beforeText: /^\s*\/\/\/.*$/, action: { indentAction: 0 as Monaco.languages.IndentAction, appendText: '/// ' } },
  ],
}

export const dartMonarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.dart',
  keywords: [
    'abstract', 'as', 'assert', 'async', 'await', 'base', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export', 'extends', 'extension', 'external',
    'factory', 'final', 'finally', 'for', 'Function', 'get', 'hide', 'if', 'implements', 'import', 'in', 'interface',
    'is', 'late', 'library', 'mixin', 'new', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'sealed', 'set',
    'show', 'static', 'super', 'switch', 'sync', 'this', 'throw', 'try', 'typedef', 'var', 'void', 'when', 'while',
    'with', 'yield', 'of',
  ],
  constants: ['true', 'false', 'null'],
  builtinTypes: ['int', 'double', 'num', 'bool', 'String', 'List', 'Map', 'Set', 'Iterable', 'Future', 'Stream', 'Object', 'Never', 'Record'],
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^',
    '%', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=', '??', '??=', '?.', '..', '?..',
    '...', '...?', '=>', '~/',
  ],
  symbols: /[=><!~?:&|+\-*/^%.]+/,
  escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]+\})/,

  tokenizer: {
    root: [
      // annotations
      [/@[a-zA-Z_$][\w$]*/, 'annotation'],
      // function calls: name(
      [/[a-z_$][\w$]*(?=\s*(<[^>]*>)?\s*\()/, { cases: { '@keywords': 'keyword', '@default': 'function' } }],
      // identifiers & keywords
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            '@builtinTypes': 'type',
            '@keywords': 'keyword',
            '@constants': 'constant',
            '[A-Z][\\w$]*': 'type.identifier',
            '@default': 'identifier',
          },
        },
      ],
      { include: '@whitespace' },
      [/[{}()[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      // numbers
      [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
      [/\d[\d_]*(\.\d[\d_]*)?([eE][-+]?\d+)?/, 'number'],
      [/[;,.]/, 'delimiter'],
      // strings
      [/r'''/, 'string', '@rawTripleSingle'],
      [/r"""/, 'string', '@rawTripleDouble'],
      [/r'/, 'string', '@rawSingle'],
      [/r"/, 'string', '@rawDouble'],
      [/'''/, 'string', '@tripleSingle'],
      [/"""/, 'string', '@tripleDouble'],
      [/'/, 'string', '@single'],
      [/"/, 'string', '@double'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*\*(?!\/)/, 'comment.doc', '@docBlock'],
      [/\/\*/, 'comment', '@block'],
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/.*$/, 'comment'],
    ],
    block: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
    docBlock: [
      [/[^/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[/*]/, 'comment.doc'],
    ],

    interpolation: [
      [/\$\{/, { token: 'delimiter.interpolation', next: '@interpolated' }],
      [/\$[a-zA-Z_][\w]*/, 'variable.interpolation'],
    ],
    interpolated: [
      [/\}/, { token: 'delimiter.interpolation', next: '@pop' }],
      { include: '@root' },
    ],

    single: [
      { include: '@interpolation' },
      [/[^\\'$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, 'string', '@pop'],
      [/\$/, 'string'],
    ],
    double: [
      { include: '@interpolation' },
      [/[^\\"$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
      [/\$/, 'string'],
    ],
    tripleSingle: [
      { include: '@interpolation' },
      [/'''/, 'string', '@pop'],
      [/[^\\'$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/./, 'string'],
    ],
    tripleDouble: [
      { include: '@interpolation' },
      [/"""/, 'string', '@pop'],
      [/[^\\"$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/./, 'string'],
    ],
    rawSingle: [
      [/[^']+/, 'string'],
      [/'/, 'string', '@pop'],
    ],
    rawDouble: [
      [/[^"]+/, 'string'],
      [/"/, 'string', '@pop'],
    ],
    rawTripleSingle: [
      [/'''/, 'string', '@pop'],
      [/./, 'string'],
    ],
    rawTripleDouble: [
      [/"""/, 'string', '@pop'],
      [/./, 'string'],
    ],
  },
}
