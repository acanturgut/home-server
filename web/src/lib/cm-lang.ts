import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';

/** Picks an appropriate CodeMirror language extension for a file extension. */
export function getLang(ext: string) {
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({
        jsx: ext.includes('x'),
        typescript: ext.startsWith('t'),
      });
    case 'json':
      return json();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'md':
      return markdown();
    default:
      return javascript();
  }
}
