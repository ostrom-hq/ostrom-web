// SPDX-License-Identifier: AGPL-3.0-only
import { safeHref } from './safeHref';

/**
 * A small, safe reading of Markdown for text an agent wrote (a wait's body): it yields a tree the UI turns into
 * elements, so no HTML is ever parsed or injected. Raw HTML stays text; a link is a link only when it is http(s).
 */
export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong' | 'em'; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] };

export type Block =
  | { readonly kind: 'heading'; readonly level: number; readonly children: readonly Inline[] }
  | { readonly kind: 'paragraph' | 'quote'; readonly children: readonly Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'rule' };

// Groups: 1 code, 2 and 3 strong, 4 emphasis, 5 link label, 6 link target.
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w_])__(.+?)__(?![\w_])|(?<![\w*_])[*_](?=\S)([^*_]+?)[*_](?![\w*_])|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;
  for (;;) {
    const found = INLINE.exec(rest);
    if (found === null) break;
    if (found.index > 0) out.push({ kind: 'text', text: rest.slice(0, found.index) });
    const [whole = '', code, star, score, em, label = '', url] = found;
    const strong = star ?? score;
    if (code !== undefined) out.push({ kind: 'code', text: code });
    else if (strong !== undefined) out.push({ kind: 'strong', children: parseInline(strong) });
    else if (em !== undefined) out.push({ kind: 'em', children: parseInline(em) });
    else {
      const href = safeHref(url);
      // A link that is not http(s) keeps its words and loses its target.
      if (href === undefined) out.push(...parseInline(label));
      else out.push({ kind: 'link', href, children: parseInline(label) });
    }
    rest = rest.slice(found.index + whole.length);
  }
  if (rest !== '') out.push({ kind: 'text', text: rest });
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const isFence = (line: string): boolean => line.startsWith('```');

/** Blocks of a Markdown text: headings, paragraphs, lists, quotes, fenced code and rules. */
export function parseMarkdown(source: string): Block[] {
  // Read from the end of a reversed copy, so a fence can take lines without an index to bound.
  const pending = source.replace(/\r\n?/g, '\n').split('\n').reverse();
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  // The line before was a quote: the next `>` line continues it.
  let quoting = false;
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (let line = pending.pop(); line !== undefined; line = pending.pop()) {
    const continuing = quoting;
    quoting = false;
    if (isFence(line)) {
      flush();
      const code: string[] = [];
      for (let next = pending.pop(); next !== undefined && !isFence(next); next = pending.pop()) {
        code.push(next);
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    const item = ITEM.exec(line);
    const quote = QUOTE.exec(line);
    if (line.trim() === '') flush();
    else if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
    } else if (heading !== null) {
      flush();
      const [, , title = ''] = heading;
      blocks.push({ kind: 'heading', level: line.search(/[^#]/), children: parseInline(title) });
    } else if (item !== null) {
      flush();
      const ordered = item[1] !== undefined;
      const last = blocks.at(-1);
      const [, , text = ''] = item;
      const children = parseInline(text);
      if (last?.kind === 'list' && last.ordered === ordered) {
        blocks[blocks.length - 1] = { ...last, items: [...last.items, children] };
      } else blocks.push({ kind: 'list', ordered, items: [children] });
    } else if (quote !== null) {
      flush();
      const [, text = ''] = quote;
      const last = blocks.at(-1);
      quoting = true;
      if (continuing && last?.kind === 'quote') {
        blocks[blocks.length - 1] = { ...last, children: [...last.children, ...parseInline(` ${text}`)] };
      } else blocks.push({ kind: 'quote', children: parseInline(text) });
    } else paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
