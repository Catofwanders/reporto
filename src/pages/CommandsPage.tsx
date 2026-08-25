import { useEffect, useMemo, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import type { KitEntry, KitReport } from '../types';
import { fetchKit } from '../kit';
import { copyText } from '../copyText';

type KindFilter = 'all' | 'command' | 'skill';
type SourceFilter = 'all' | 'personal' | 'project' | 'plugin';

const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'command', label: 'Commands' },
  { id: 'skill', label: 'Skills' },
];

const SOURCES: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All sources' },
  { id: 'personal', label: 'Mine' },
  { id: 'project', label: 'This repo' },
  { id: 'plugin', label: 'Plugins' },
];

const matches = (entry: KitEntry, query: string) => {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    entry.name.toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle) ||
    entry.tools.some((tool) => tool.toLowerCase().includes(needle)) ||
    (entry.plugin ?? '').toLowerCase().includes(needle)
  );
};

const Row = ({ entry }: { entry: KitEntry }) => {
  const [copied, setCopied] = useState(false);
  const invocation = `/${entry.name}`;

  const copy = async () => {
    if (await copyText(invocation)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <article className="kit-row">
      <div className="kit-row-head">
        <code className="kit-name">{entry.kind === 'command' ? invocation : entry.name}</code>
        <span className={`chip chip-${entry.kind === 'command' ? 'open' : 'qcout'}`}>
          {entry.kind}
        </span>
        {entry.plugin && <span className="kit-plugin">{entry.plugin}</span>}
        {entry.argumentHint && <code className="kit-args">{entry.argumentHint}</code>}
        <Tooltip title={copied ? 'Copied' : `Copy ${invocation}`} disableInteractive>
          <IconButton
            size="small"
            onClick={() => void copy()}
            aria-label={`copy ${invocation}`}
            sx={{ color: copied ? 'var(--ok-ink)' : 'var(--ink-2)', marginLeft: 'auto' }}
          >
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </div>

      {entry.description && <p className="kit-desc">{entry.description}</p>}

      <div className="kit-row-foot">
        {entry.tools.length > 0 && (
          <span className="kit-tools" title={`allowed tools: ${entry.tools.join(', ')}`}>
            {entry.tools.slice(0, 4).join(' · ')}
            {entry.tools.length > 4 && ` +${entry.tools.length - 4}`}
          </span>
        )}
        {entry.model && <span className="kit-tools">model: {entry.model}</span>}
        <code className="kit-path" title={entry.path}>
          {entry.path}
        </code>
      </div>
    </article>
  );
};

/**
 * Everything this laptop's Claude Code can be told to do. The list is long enough that
 * `/help` scrolls past it, which is the whole reason this page exists — a command you
 * cannot find is a command you rewrite by hand instead.
 */
export const CommandsPage = () => {
  const [kit, setKit] = useState<KitReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchKit()
      .then((next) => {
        if (!cancelled) {
          setKit(next);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadAt]);

  const shown = useMemo(() => {
    const entries = kit?.entries ?? [];
    return entries
      .filter((entry) => (kind === 'all' ? true : entry.kind === kind))
      .filter((entry) => (source === 'all' ? true : entry.source === source))
      .filter((entry) => matches(entry, query));
  }, [kit, kind, source, query]);

  const counts = useMemo(() => {
    const entries = kit?.entries ?? [];
    return {
      commands: entries.filter((e) => e.kind === 'command').length,
      skills: entries.filter((e) => e.kind === 'skill').length,
      mine: entries.filter((e) => e.source === 'personal').length,
    };
  }, [kit]);

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-open" aria-hidden="true">
              <TerminalRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Commands and skills</h2>
              <p className="panel-sub">
                {counts.commands} commands · {counts.skills} skills · {kit?.plugins.length ?? 0}{' '}
                plugins · {counts.mine} written by me
              </p>
            </div>
          </div>
          <span className="panel-meta">
            <Tooltip title="Re-read ~/.claude" disableInteractive>
              <IconButton
                size="small"
                onClick={() => setReloadAt((n) => n + 1)}
                aria-label="re-read the command directory"
                sx={{ color: 'var(--ink-2)' }}
              >
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </span>
        </div>

        {error && <p className="status error">{error}</p>}
        {!kit && !error && <p className="status">Reading ~/.claude…</p>}

        {kit && (
          <>
            <div className="kit-filters">
              <input
                className="kit-search"
                type="search"
                value={query}
                placeholder="Filter by name, description or tool…"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="filter commands and skills"
              />
              <div className="segmented" role="tablist" aria-label="kind">
                {KINDS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={kind === option.id}
                    className={kind === option.id ? 'is-active' : ''}
                    onClick={() => setKind(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="segmented" role="tablist" aria-label="source">
                {SOURCES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={source === option.id}
                    className={source === option.id ? 'is-active' : ''}
                    onClick={() => setSource(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="kit-count">
              {shown.length} of {kit.entries.length}
            </p>

            <div className="kit-list">
              {shown.map((entry) => (
                <Row key={`${entry.source}:${entry.kind}:${entry.name}`} entry={entry} />
              ))}
              {shown.length === 0 && <p className="status">Nothing matches that filter.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  );
};
