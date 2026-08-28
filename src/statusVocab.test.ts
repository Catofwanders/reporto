import { describe, expect, it } from 'vitest';
import type { Ticket } from './types';
import { statusTone } from './jiraStatus';
import {
  DEFAULT_VOCAB,
  inStatusGroup,
  statusRank,
  statusToneOf,
  statusVocab,
} from './statusVocab';

/**
 * The vocabulary is the piece that keeps one employer's column names out of a public repo, so
 * these tests are as much about what is *absent* from the defaults as about the merge rules.
 */
const ticket = (status: string, chip: Ticket['chip'] = 'na'): Pick<Ticket, 'status' | 'chip'> => ({
  status,
  chip,
});

describe('the committed defaults', () => {
  it('know the words every Jira has', () => {
    expect(statusToneOf(DEFAULT_VOCAB, 'In Progress')).toBe('open');
    expect(statusToneOf(DEFAULT_VOCAB, 'in review')).toBe('warn');
    expect(statusToneOf(DEFAULT_VOCAB, 'BLOCKED')).toBe('bad');
    expect(statusToneOf(DEFAULT_VOCAB, 'Done')).toBe('ok');
    expect(statusToneOf(DEFAULT_VOCAB, 'Backlog')).toBe('na');
  });

  /*
   * The point of the whole exercise: a pipeline stage past "in review" is somebody's own
   * vocabulary. If one of these ever starts resolving, a column name has crept back into
   * committed code.
   */
  it.each(['QA rejected', 'Ready for QA', 'Awaiting sign-off', 'Ready to ship'])(
    'has no opinion about %s',
    (status) => {
      expect(statusToneOf(DEFAULT_VOCAB, status)).toBeNull();
    },
  );

  it('claims no status means development-done, so those checks stay quiet unconfigured', () => {
    expect(DEFAULT_VOCAB.groups.devDone).toEqual([]);
  });
});

describe('statusVocab', () => {
  const config = {
    order: ['Backlog', 'In Progress', 'Ready for QA', 'Ready to ship'],
    tones: { qc: ['Ready for QA'], ok: ['Ready to ship'], open: ['Backlog'] },
    groups: { devDone: ['Ready for QA'], shipped: ['Ready to ship'] },
  };
  const vocab = statusVocab(config);

  it('falls back to the generic vocabulary when there is no config at all', () => {
    expect(statusVocab(null)).toBe(DEFAULT_VOCAB);
    expect(statusVocab(undefined)).toBe(DEFAULT_VOCAB);
  });

  it('matches statuses whatever case and spacing the workflow author typed', () => {
    expect(statusToneOf(vocab, '  ready for qa ')).toBe('qc');
    expect(statusRank(vocab, 'READY TO SHIP')).toBe(3);
  });

  /* Order is one sequence: merging would append the real columns after the generic ones. */
  it('replaces the column order rather than appending to it', () => {
    expect(vocab.order).toEqual(['backlog', 'in progress', 'ready for qa', 'ready to ship']);
    expect(statusRank(vocab, 'In Progress')).toBe(1);
  });

  it('sorts a status nobody named after every column that is named', () => {
    expect(statusRank(vocab, 'Some Future Column')).toBe(vocab.order.length);
  });

  it('merges tones, and lets config move a status the defaults already knew', () => {
    // Untouched by config, so still the generic answer.
    expect(statusToneOf(vocab, 'In Progress')).toBe('open');
    // Configured, so config wins over the default `na`.
    expect(statusToneOf(vocab, 'Backlog')).toBe('open');
  });

  it('merges groups, so a workflow adds its stages without restating the generic ones', () => {
    expect(inStatusGroup(vocab, 'inFlight', 'In Progress')).toBe(true);
    expect(inStatusGroup(vocab, 'devDone', 'Ready for QA')).toBe(true);
    expect(inStatusGroup(vocab, 'shipped', 'Done')).toBe(true);
    expect(inStatusGroup(vocab, 'shipped', 'Ready to ship')).toBe(true);
    expect(inStatusGroup(vocab, 'devDone', 'In Progress')).toBe(false);
  });

  /*
   * The distinction that was missing: `[]` is a statement, not an omission. Without it a board
   * where "in review" is not active work, or one that wants no blocked group at all, could not
   * say so — the generic defaults won.
   */
  it('empties a group configured as an empty list, rather than keeping the defaults', () => {
    const emptied = statusVocab({ groups: { blocked: [], inFlight: [] } });
    expect(emptied.groups.blocked).toEqual([]);
    expect(inStatusGroup(emptied, 'blocked', 'Blocked')).toBe(false);
    expect(inStatusGroup(emptied, 'inFlight', 'In Progress')).toBe(false);
    // A group left out of the config is untouched.
    expect(inStatusGroup(emptied, 'active', 'In Progress')).toBe(true);
  });

  it('leaves the defaults untouched, so one page cannot poison another', () => {
    expect(DEFAULT_VOCAB.groups.devDone).toEqual([]);
    expect(statusToneOf(DEFAULT_VOCAB, 'Ready for QA')).toBeNull();
  });
});

describe('statusTone', () => {
  it('prefers the vocabulary over the chip the pull wrote', () => {
    expect(statusTone(ticket('In Progress', 'bad'))).toBe('open');
  });

  /*
   * The fallback that keeps an unconfigured board readable: the server writes a chip per
   * ticket, and an unknown status keeps it rather than going grey.
   */
  it('falls back to the report’s own chip for a status it has never seen', () => {
    expect(statusTone(ticket('Ready for QA', 'qc'))).toBe('qc');
  });

  it('uses the configured tone once the vocabulary knows the status', () => {
    const vocab = statusVocab({ tones: { qc: ['Ready for QA'] } });
    expect(statusTone(ticket('Ready for QA', 'na'), vocab)).toBe('qc');
  });
});
