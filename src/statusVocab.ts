import type { Chip } from './types';

/**
 * The board's status vocabulary, which is configuration rather than code.
 *
 * A workflow's column names belong to whoever owns the board: "QA passed", "waiting on the
 * client", "ready to ship" are all the same idea under names that differ per employer, and
 * this repo is public. So the names live in `config/reporto.json` (gitignored) and only the
 * words every Jira has — in progress, in review, blocked, done — are committed here as
 * defaults.
 *
 * That has a second benefit beyond the obvious one: a checkout with no config still boots and
 * still colours a board sensibly, and somebody else's workflow is a config edit rather than a
 * patch to five modules.
 */
export interface StatusVocab {
  /** Column order, left to right. A status not named keeps its place after the ones that are. */
  order: string[];
  /** Status name → chip tone. */
  tones: Map<string, Chip>;
  groups: StatusGroups;
}

export interface StatusGroups {
  /** In flight and mine: what the dashboard counts as today's work. */
  active: string[];
  /** Development itself is not finished. */
  inFlight: string[];
  /** Stuck, and worth saying out loud at stand-up. */
  blocked: string[];
  /** Development is finished, whatever comes after it has not happened. */
  devDone: string[];
  /** The work has shipped. */
  shipped: string[];
}

/** The raw shape `config/reporto.json` carries, and `/api/settings` passes through. */
export interface StatusVocabConfig {
  order?: string[];
  tones?: Partial<Record<Chip, string[]>>;
  groups?: Partial<StatusGroups>;
}

const key = (status: string) => status.trim().toLowerCase();

/**
 * Universal Jira vocabulary only. Anything past "in review" — a QA stage, a client sign-off,
 * a release column — is somebody's own pipeline and comes from config.
 */
const DEFAULT_ORDER = [
  'backlog',
  'next',
  'to do',
  'selected',
  'in progress',
  'in development',
  'doing',
  'code review',
  'in review',
  'review',
  'done',
  'closed',
  'blocked',
  'on hold',
];

const DEFAULT_TONES: Partial<Record<Chip, string[]>> = {
  na: ['backlog', 'next', 'to do', 'selected', 'new'],
  open: ['in progress', 'in development', 'doing'],
  warn: ['code review', 'in review', 'review'],
  bad: ['blocked'],
  qcout: ['on hold'],
  ok: ['done', 'closed', 'released'],
};

const DEFAULT_GROUPS: StatusGroups = {
  active: ['in progress', 'in development', 'doing', 'code review', 'in review'],
  inFlight: ['in progress', 'in development', 'doing', 'code review', 'in review'],
  blocked: ['blocked'],
  // Empty on purpose: no universal status means "development finished, release pending". A
  // workflow that has one names it in config, and until then the checks that need it stay
  // quiet rather than guessing.
  devDone: [],
  shipped: ['done', 'closed', 'released'],
};

const toneMap = (lists: Partial<Record<Chip, string[]>>): Map<string, Chip> => {
  const out = new Map<string, Chip>();
  for (const [tone, names] of Object.entries(lists)) {
    for (const name of names ?? []) out.set(key(name), tone as Chip);
  }
  return out;
};

export const DEFAULT_VOCAB: StatusVocab = {
  order: DEFAULT_ORDER,
  tones: toneMap(DEFAULT_TONES),
  groups: DEFAULT_GROUPS,
};

/**
 * Config over defaults.
 *
 * `order` is replaced when configured — it is one sequence, and merging would append the
 * configured columns after the generic ones, which is the wrong order by construction. Tones
 * and groups merge, with config winning per status: a workflow adds its own names without
 * having to restate "in progress", and can still move a status the defaults already knew.
 *
 * A group configured as `[]` is emptied rather than ignored. That is the only way to say "no
 * status counts as this", and it is a thing a workflow legitimately wants to say.
 */
export const statusVocab = (config: StatusVocabConfig | null | undefined): StatusVocab => {
  if (!config) return DEFAULT_VOCAB;
  const tones = new Map(DEFAULT_VOCAB.tones);
  for (const [name, tone] of toneMap(config.tones ?? {})) tones.set(name, tone);

  const groups = { ...DEFAULT_GROUPS };
  for (const name of Object.keys(DEFAULT_GROUPS) as (keyof StatusGroups)[]) {
    const extra = config.groups?.[name];
    if (extra === undefined) continue;
    /*
     * An explicit empty list means "nothing belongs in this group", and it has to be obeyed.
     * Testing truthiness of `length` treated `[]` as "unset" and quietly kept the generic
     * defaults — so a board where "in review" is *not* active work, or one that wants the
     * stand-up's blocked list silent, had no way to say so.
     */
    groups[name] = extra.length
      ? [...new Set([...DEFAULT_GROUPS[name], ...extra].map(key))]
      : [];
  }

  return {
    order: config.order?.length ? config.order.map(key) : DEFAULT_ORDER,
    tones,
    groups,
  };
};

export const inStatusGroup = (
  vocab: StatusVocab,
  group: keyof StatusGroups,
  status: string,
): boolean => vocab.groups[group].some((name) => key(name) === key(status));

/**
 * Position on the board, left to right.
 *
 * Blocked comes first, whatever the configured order says. A blocked ticket is the only kind
 * whose position in the workflow is beside the point — it is not moving, and somebody has to
 * unstick it — so it belongs where the eye lands rather than wherever the pipeline puts it.
 * Expressed through the `blocked` group, so no status name is needed here (rules/nda.md).
 *
 * Unknown statuses sort after every known one.
 */
export const statusRank = (vocab: StatusVocab, status: string): number => {
  if (inStatusGroup(vocab, 'blocked', status)) return -1;
  const at = vocab.order.indexOf(key(status));
  return at === -1 ? vocab.order.length : at;
};

/** The configured tone for a status, or null when the vocabulary has never seen it. */
export const statusToneOf = (vocab: StatusVocab, status: string): Chip | null =>
  vocab.tones.get(key(status)) ?? null;

