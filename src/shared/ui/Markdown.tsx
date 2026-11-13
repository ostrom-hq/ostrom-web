// SPDX-License-Identifier: Apache-2.0
import { createElement, type ReactElement, type ReactNode } from 'react';
import { type Block, type Inline, parseMarkdown } from '@/shared/lib/markdown';

function inlines(items: readonly Inline[]): ReactNode {
  return items.map((item, at) => {
    const key = `${String(at)}-${item.kind}`;
    switch (item.kind) {
      case 'text':
        return item.text;
      case 'code':
        return (
          <code key={key} className="o-mono">
            {item.text}
          </code>
        );
      case 'strong':
        return <strong key={key}>{inlines(item.children)}</strong>;
      case 'em':
        return <em key={key}>{inlines(item.children)}</em>;
      case 'link':
        return (
          <a key={key} href={item.href} target="_blank" rel="noopener noreferrer nofollow">
            {inlines(item.children)}
          </a>
        );
    }
  });
}

function block(item: Block, at: number): ReactElement {
  switch (item.kind) {
    case 'heading':
      // The screen's own title is the h1 and its sections are h2: a body heading starts at h3.
      return createElement(`h${String(Math.min(item.level + 2, 6))}`, { key: at }, inlines(item.children));
    case 'paragraph':
      return <p key={at}>{inlines(item.children)}</p>;
    case 'quote':
      return <blockquote key={at}>{inlines(item.children)}</blockquote>;
    case 'code':
      return (
        <pre key={at} className="o-md__code">
          <code>{item.text}</code>
        </pre>
      );
    case 'rule':
      return <hr key={at} />;
    case 'list': {
      const entries = item.items.map((entry, index) => <li key={index}>{inlines(entry)}</li>);
      return item.ordered ? <ol key={at}>{entries}</ol> : <ul key={at}>{entries}</ul>;
    }
  }
}

/**
 * Markdown from an agent or a person, as elements: never as HTML. Raw tags show as text, and only http(s) links are
 * links (they open in a new tab, without the opener).
 */
export function Markdown({ source }: { readonly source: string }): ReactElement {
  return <div className="o-md">{parseMarkdown(source).map(block)}</div>;
}
