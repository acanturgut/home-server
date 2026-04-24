import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** GitHub-Dark inspired CodeMirror theme used across the Apps editor. */
export const ghDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#000000',
      color: '#e6edf3',
    },
    '.cm-content': {
      caretColor: '#58a6ff',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#58a6ff',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#264f78',
      },
    '.cm-panels': {
      backgroundColor: '#0a0a0a',
      color: '#e6edf3',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #30363d',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid #30363d',
    },
    '.cm-searchMatch': {
      backgroundColor: '#e2c08d80',
      outline: '1px solid #e2c08d40',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#264f78',
    },
    '.cm-activeLine': {
      backgroundColor: '#161b2280',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#3fb95040',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: '#3fb95040',
    },
    '.cm-gutters': {
      backgroundColor: '#000000',
      color: '#484f58',
      borderRight: '1px solid #1a1a1a',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#0a0a0a',
      color: '#e6edf3',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#21262d',
      border: 'none',
      color: '#8b949e',
    },
    '.cm-tooltip': {
      border: '1px solid #30363d',
      backgroundColor: '#161b22',
      color: '#e6edf3',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: '#30363d',
      borderBottomColor: '#30363d',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#161b22',
      borderBottomColor: '#161b22',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#264f78',
      },
    },
  },
  { dark: true },
);

export const ghDarkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: '#e6edf3',
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#d2a8ff' },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: '#79c0ff',
  },
  { tag: [tags.definition(tags.name), tags.separator], color: '#e6edf3' },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: '#ffa657',
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: '#79c0ff',
  },
  { tag: [tags.meta, tags.comment], color: '#8b949e' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#58a6ff', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#79c0ff' },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: '#79c0ff',
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: '#a5d6ff',
  },
  { tag: tags.invalid, color: '#f97583' },
]);
