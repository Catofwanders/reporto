import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JiraReport, KitEntry, PrsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { fetchKit } from '../kit';
import { copyText } from '../copyText';
import { buildItems, matchItems, parseQuery, type PaletteItem } from '../paletteItems';
import { useCapabilities } from '../capabilitiesContext';
import { readMarks, unreadItems } from '../jiraActivity';

interface CommandPaletteProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
}

/**
 * ⌘K, and the app's only search.
 *
 * Everything it offers is already in memory — the two reports plus the kit listing — so
 * there is no endpoint behind this and no debounce to think about. The kit is fetched the
 * first time the palette opens rather than on boot: most sessions never ask for it.
 */
export const CommandPalette = ({ jira, prs }: CommandPaletteProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [kit, setKit] = useState<KitEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { run } = useRefresh();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
        setQuery('');
        setCursor(0);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (kit.length > 0) return;
    fetchKit()
      .then((next) => setKit(next.entries))
      .catch(() => {
        // No dev server, or no ~/.claude: the palette is still useful for the rest.
      });
  }, [open, kit.length]);

  const { usable } = useCapabilities();
  /*
   * The read mark is read once per palette build rather than held in state: the palette is
   * rebuilt when it opens, which is the only moment its rows are looked at.
   */
  const items = useMemo(
    () => buildItems(jira, prs, kit, usable, jira?.activity ? unreadItems(jira.activity, readMarks()) : []),
    [jira, prs, kit, usable],
  );
  const shown = useMemo(() => matchItems(items, query), [items, query]);
  const { actionsOnly } = parseQuery(query);

  const choose = async (item: PaletteItem) => {
    const { action } = item;
    if (action.kind === 'goto') {
      setOpen(false);
      navigate(action.to);
      return;
    }
    if (action.kind === 'refresh') {
      setOpen(false);
      void run(action.report);
      return;
    }
    if (action.kind === 'external') {
      setOpen(false);
      window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Copy keeps the palette open: copying one invocation is often followed by another.
    if (await copyText(action.text)) {
      setCopied(action.text);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  if (!open) return null;

  const move = (delta: number) =>
    setCursor((at) => (shown.length === 0 ? 0 : (at + delta + shown.length) % shown.length));

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        {/*
          * Combobox semantics, so moving the cursor says something. The arrow keys used to move
          * a CSS class and nothing else: sighted users saw the highlight travel while anything
          * assistive heard silence, on the app's only search.
          */}
        <input
          ref={inputRef}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={shown[cursor] ? `palette-row-${cursor}` : undefined}
          value={query}
          placeholder="Ticket, PR, page, command… or > for actions only"
          aria-label="search tickets, PRs, pages and commands; type > for actions only"
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            }
            if (event.key === 'Enter' && shown[cursor]) {
              event.preventDefault();
              void choose(shown[cursor]);
            }
          }}
        />

        <ul className="palette-list" id="palette-list" role="listbox" aria-label="Results">
          {shown.map((item, i) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                id={`palette-row-${i}`}
                role="option"
                aria-selected={i === cursor}
                className={`palette-row${i === cursor ? ' is-cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => void choose(item)}
              >
                <span className="palette-group">{item.group}</span>
                <span className="palette-title">{item.title}</span>
                {item.subtitle && <span className="palette-sub">{item.subtitle}</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="palette-empty" role="presentation">
              Nothing matches.
            </li>
          )}
        </ul>

        <p className="palette-foot">
          {copied ? (
            <span className="palette-copied">copied {copied}</span>
          ) : actionsOnly ? (
            <>actions only · ↑↓ to move · ⏎ to run · esc to close</>
          ) : (
            <>↑↓ to move · ⏎ to choose · esc to close</>
          )}
        </p>
      </div>
    </div>
  );
};
