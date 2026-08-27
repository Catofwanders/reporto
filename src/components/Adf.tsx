import type { ReactNode } from 'react';
import type { AdfNode } from '../ticketDetail';

interface AdfProps {
  doc: AdfNode | null;
}

/**
 * Atlassian Document Format, rendered.
 *
 * Jira's REST API returns descriptions and comments as ADF, not markdown, and this renderer
 * is the bulk of what the drawer costs. It covers the node types that actually turn up on a
 * board — paragraphs, marked text, both list kinds, headings, code, quotes, rules, tables,
 * mentions, dates, status lozenges, emoji, panels — and everything else falls through to its
 * own children. The list is not guesswork: it is every node type and mark the real board
 * actually returned across its tickets, plus the cheap ones next to them. `date` earned its
 * case the hard way — it carries a timestamp in `attrs` and has no children, so falling
 * through rendered a due date as nothing at all.
 *
 * That fall-through is the important decision. Atlassian adds node types, and a renderer that
 * throws or blanks on an unknown one makes the whole ticket unreadable over a node nobody
 * cares about; rendering the text inside it loses the formatting and keeps the words, which is
 * the right way round. `mediaSingle` is the deliberate exception — an attachment needs auth
 * this page does not have, so it becomes a line saying so rather than a broken image.
 */

/** Text marks, innermost first, so nesting composes rather than overwriting. */
const withMarks = (node: AdfNode, text: ReactNode): ReactNode => {
  let out = text;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'strong') out = <strong>{out}</strong>;
    else if (mark.type === 'em') out = <em>{out}</em>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'link') {
      const href = String(mark.attrs?.href ?? '');
      // Only http(s): an ADF href is content, and `javascript:` in one would be a script the
      // ticket's author chose to run here.
      out = /^https?:\/\//i.test(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      ) : (
        out
      );
    }
  }
  return out;
};

const kids = (node: AdfNode): ReactNode =>
  (node.content ?? []).map((child, i) => <AdfPart key={i} node={child} />);

const AdfPart = ({ node }: { node: AdfNode }): ReactNode => {
  switch (node.type) {
    case 'text':
      return withMarks(node, node.text ?? '');
    case 'hardBreak':
      return <br />;
    case 'paragraph':
      return <p>{kids(node)}</p>;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 3)));
      // Headings inside a drawer are not page headings; keep them small and consistent.
      return <p className={`adf-h adf-h${level}`}>{kids(node)}</p>;
    }
    case 'bulletList':
      return <ul>{kids(node)}</ul>;
    case 'orderedList':
      return <ol start={Number(node.attrs?.order ?? 1)}>{kids(node)}</ol>;
    case 'listItem':
      return <li>{kids(node)}</li>;
    case 'codeBlock':
      return (
        <pre className="adf-code">
          <code>{(node.content ?? []).map((child) => child.text ?? '').join('')}</code>
        </pre>
      );
    case 'blockquote':
      return <blockquote className="adf-quote">{kids(node)}</blockquote>;
    case 'rule':
      return <hr className="adf-rule" />;
    case 'panel':
      return <div className={`adf-panel is-${String(node.attrs?.panelType ?? 'info')}`}>{kids(node)}</div>;
    case 'mention':
      return <span className="adf-mention">@{String(node.attrs?.text ?? '').replace(/^@/, '')}</span>;
    case 'date': {
      // A real node type on this board: `{ attrs: { timestamp } }` with no children, so the
      // fall-through would have rendered nothing at all where a due date was written.
      const ms = Number(node.attrs?.timestamp ?? NaN);
      if (Number.isNaN(ms)) return null;
      return (
        <span className="adf-date">
          {new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      );
    }
    case 'status':
      return <span className="chip chip-na">{String(node.attrs?.text ?? '')}</span>;
    case 'emoji':
      return <span>{String(node.attrs?.text ?? node.attrs?.shortName ?? '')}</span>;
    case 'inlineCard':
    case 'blockCard': {
      const url = String(node.attrs?.url ?? '');
      return /^https?:\/\//i.test(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ) : null;
    }
    case 'table':
      return (
        <div className="adf-table-wrap">
          <table className="adf-table">
            <tbody>{kids(node)}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{kids(node)}</tr>;
    case 'tableHeader':
      return <th>{kids(node)}</th>;
    case 'tableCell':
      return <td>{kids(node)}</td>;
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      // The drawer has no Jira session, so fetching the attachment would 401. Say what is
      // there and let the ticket link handle it.
      return <p className="adf-media">attachment — open the ticket in Jira to see it</p>;
    default:
      return <>{kids(node)}</>;
  }
};

export const Adf = ({ doc }: AdfProps) => {
  if (!doc) return null;
  return <div className="adf">{kids(doc)}</div>;
};
