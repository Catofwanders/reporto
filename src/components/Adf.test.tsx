// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AdfNode } from '../ticketDetail';
import { Adf } from './Adf';

const doc = (...content: AdfNode[]): AdfNode => ({ type: 'doc', content });
const para = (...content: AdfNode[]): AdfNode => ({ type: 'paragraph', content });
const text = (value: string, marks?: AdfNode['marks']): AdfNode => ({ type: 'text', text: value, marks });

afterEach(cleanup);

describe('Adf', () => {
  it('renders nothing at all for a missing document, so the caller decides what to say', () => {
    const { container } = render(<Adf doc={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders paragraphs and the marks a ticket actually uses', () => {
    const { container } = render(
      <Adf
        doc={doc(
          para(
            text('a cold '),
            text('listing page', [{ type: 'strong' }]),
            text(' hits '),
            text('search', [{ type: 'code' }]),
            text(' every time'),
          ),
        )}
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('listing page');
    expect(container.querySelector('code')?.textContent).toBe('search');
    expect(container.textContent).toContain('a cold listing page hits search every time');
  });

  it('opens links in a new tab, without leaking the referrer', () => {
    render(
      <Adf
        doc={doc(para(text('the doc', [{ type: 'link', attrs: { href: 'https://example.com/x' } }])))}
      />,
    );
    const link = screen.getByRole('link', { name: 'the doc' });
    expect(link.getAttribute('href')).toBe('https://example.com/x');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  /*
   * An ADF href is content: whoever wrote the ticket chose it. A `javascript:` URL there would
   * be a script somebody else decided to run in this page, so the text survives and the link
   * does not.
   */
  it('refuses to make a link out of a non-http href', () => {
    const { container } = render(
      <Adf
        doc={doc(
          para(text('not a link', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
        )}
      />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('not a link');
  });

  it('renders both list kinds, quotes and code blocks', () => {
    const { container } = render(
      <Adf
        doc={doc(
          { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('cache it'))] }] },
          { type: 'orderedList', content: [{ type: 'listItem', content: [para(text('measure it'))] }] },
          { type: 'blockquote', content: [para(text('QC saw 4s'))] },
          { type: 'codeBlock', content: [text('GET /listings')] },
          { type: 'rule' },
        )}
      />,
    );
    expect(container.querySelector('ul li')?.textContent).toBe('cache it');
    expect(container.querySelector('ol li')?.textContent).toBe('measure it');
    expect(container.querySelector('blockquote')?.textContent).toBe('QC saw 4s');
    expect(container.querySelector('pre code')?.textContent).toBe('GET /listings');
    expect(container.querySelector('hr')).not.toBeNull();
  });

  /*
   * `date` has no children and carries its value in `attrs`, so the fall-through rendered a
   * due date as nothing at all until it got its own case.
   */
  it('renders a date node, which has no children to fall through to', () => {
    const { container } = render(
      <Adf doc={doc(para(text('due '), { type: 'date', attrs: { timestamp: '1780531200000' } }))} />,
    );
    expect(container.querySelector('.adf-date')?.textContent).toMatch(/\d{2} \w{3} \d{4}/);
  });

  it('ignores a date whose timestamp is not a number, rather than printing Invalid Date', () => {
    const { container } = render(<Adf doc={doc(para({ type: 'date', attrs: { timestamp: 'soon' } }))} />);
    expect(container.textContent).not.toContain('Invalid');
  });

  it('says an attachment is there rather than trying to fetch it without auth', () => {
    const { container } = render(
      <Adf doc={doc({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x' } }] })} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('attachment');
  });

  /*
   * Atlassian adds node types. A renderer that throws or blanks on one makes a whole ticket
   * unreadable over a node nobody cares about; keeping the words loses only the formatting.
   */
  it('keeps the text inside a node type it has never heard of', () => {
    const { container } = render(
      <Adf doc={doc({ type: 'someFutureNode', content: [para(text('still readable'))] })} />,
    );
    expect(container.textContent).toContain('still readable');
  });

  it('renders a mention and a table without dropping their contents', () => {
    const { container } = render(
      <Adf
        doc={doc(
          para({ type: 'mention', attrs: { text: '@dana' } }),
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableHeader', content: [para(text('page'))] },
                  { type: 'tableCell', content: [para(text('4.1s'))] },
                ],
              },
            ],
          },
        )}
      />,
    );
    expect(container.querySelector('.adf-mention')?.textContent).toBe('@dana');
    expect(container.querySelector('th')?.textContent).toBe('page');
    expect(container.querySelector('td')?.textContent).toBe('4.1s');
  });
});
