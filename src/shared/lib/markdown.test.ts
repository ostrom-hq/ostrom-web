// SPDX-License-Identifier: Apache-2.0
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('reads code, strong, emphasis and links, around plain text', () => {
    expect(parseInline('a `b` **c** __d__ *e* _f_ [g](https://x.dev/y) h')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'e' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'f' }] },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://x.dev/y', children: [{ kind: 'text', text: 'g' }] },
      { kind: 'text', text: ' h' },
    ]);
  });

  it('nests emphasis in a link and keeps raw HTML as text', () => {
    expect(parseInline('[**go**](http://x.dev) <b>x</b>')).toEqual([
      {
        kind: 'link',
        href: 'http://x.dev',
        children: [{ kind: 'strong', children: [{ kind: 'text', text: 'go' }] }],
      },
      { kind: 'text', text: ' <b>x</b>' },
    ]);
  });

  it('drops the target of a link that is not http(s), keeping its words', () => {
    expect(parseInline('[open](javascript:alert) [mail](mailto:a@b.c)')).toEqual([
      { kind: 'text', text: 'open' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'mail' },
    ]);
  });

  it('keeps a link whose target has parentheses, and leaves __init__ in a word or a URL alone', () => {
    expect(parseInline('[doc](https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      {
        kind: 'link',
        href: 'https://en.wikipedia.org/wiki/Foo_(bar)',
        children: [{ kind: 'text', text: 'doc' }],
      },
    ]);
    expect(parseInline('see https://x.dev/a__b__c and my__init__file')).toEqual([
      { kind: 'text', text: 'see https://x.dev/a__b__c and my__init__file' },
    ]);
  });

  it('leaves a snake_case word and a lone star alone', () => {
    expect(parseInline('snake_case_name and 2 * 3')).toEqual([
      { kind: 'text', text: 'snake_case_name and 2 * 3' },
    ]);
  });

  it('is empty for nothing', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseMarkdown', () => {
  it('reads headings, paragraphs joined over lines, and rules', () => {
    expect(parseMarkdown('# Title ##\r\nfirst\nsecond\n\n---\n###### Small')).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Title' }] },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'first second' }] },
      { kind: 'rule' },
      { kind: 'heading', level: 6, children: [{ kind: 'text', text: 'Small' }] },
    ]);
  });

  it('groups consecutive items of the same kind, and splits an ordered list from a bullet one', () => {
    const blocks = parseMarkdown('- a\n* b\n1. c\n2) d\n\ntext\n- e');
    expect(blocks.map((block) => block.kind)).toEqual(['list', 'list', 'paragraph', 'list']);
    expect(blocks[0]).toMatchObject({ ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] });
    expect(blocks[1]).toMatchObject({ ordered: true, items: [[{ text: 'c' }], [{ text: 'd' }]] });
  });

  it('reads quotes and fenced code, closed or not', () => {
    expect(parseMarkdown('> one\n>two\n\n> apart\n```sh\nmake\n\nmore\n```\nafter\n```\nopen')).toEqual([
      {
        kind: 'quote',
        children: [
          { kind: 'text', text: 'one' },
          { kind: 'text', text: ' two' },
        ],
      },
      { kind: 'quote', children: [{ kind: 'text', text: 'apart' }] },
      { kind: 'code', text: 'make\n\nmore' },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'after' }] },
      { kind: 'code', text: 'open' },
    ]);
  });

  it('ends a paragraph at a fence and at a heading', () => {
    expect(parseMarkdown('text\n```\ncode\n```').map((block) => block.kind)).toEqual(['paragraph', 'code']);
    expect(parseMarkdown('text\n# head').map((block) => block.kind)).toEqual(['paragraph', 'heading']);
  });

  it('is empty for nothing', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
