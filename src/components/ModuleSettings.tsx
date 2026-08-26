import { useState } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import type { Capability } from '../capabilitiesContext';
import { useCapabilities } from '../capabilitiesContext';

/** What a variable is for, in the words of whoever has to paste it. */
const VAR_LABEL: Record<string, string> = {
  JIRA_EMAIL: 'Atlassian account e-mail',
  JIRA_API_TOKEN: 'Atlassian API token',
  GOOGLE_SERVICE_ACCOUNT_KEY: 'Path to the service-account JSON key',
  GOOGLE_CLIENT_ID: 'Google client id',
  GOOGLE_CLIENT_SECRET: 'Google client secret',
  GOOGLE_REFRESH_TOKEN: 'Google refresh token',
  SLACK_USER_TOKEN: 'Slack user token (xoxp-)',
};

const SecretField = ({ name }: { name: string }) => {
  const { saveSecret } = useCapabilities();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveSecret(name, value);
      // Cleared the moment it lands: a token sitting in a form is one screen-share away
      // from being somebody else's.
      setValue('');
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="secret-field">
      <label htmlFor={`secret-${name}`}>
        {VAR_LABEL[name] ?? name}
        <code>{name}</code>
      </label>
      <div className="secret-row">
        <input
          id={`secret-${name}`}
          type="password"
          value={value}
          autoComplete="off"
          spellCheck={false}
          placeholder="paste the value"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value) void save();
          }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!value || busy}
          onClick={() => void save()}
          sx={{ textTransform: 'none', color: 'var(--accent)', borderColor: 'var(--line)' }}
        >
          {busy ? <CircularProgress size={14} /> : saved ? 'Saved' : 'Save'}
        </Button>
      </div>
      {error && <p className="secret-error">{error}</p>}
    </div>
  );
};

const ModuleRow = ({ module }: { module: Capability }) => {
  const { setEnabled } = useCapabilities();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!module.configured);

  const toggle = async () => {
    setBusy(true);
    try {
      await setEnabled(module.kind, !module.enabled);
    } finally {
      setBusy(false);
    }
  };

  const status = !module.configured
    ? { tone: 'bad', text: 'not configured' }
    : module.enabled
      ? { tone: 'ok', text: 'on' }
      : { tone: 'na', text: 'off' };

  return (
    <article className={`module-row${module.configured ? '' : ' is-unconfigured'}`}>
      <div className="module-row-head">
        <label className="module-toggle">
          <input
            type="checkbox"
            checked={module.enabled}
            // Nothing to switch on until it can work; the fields below are the way in.
            disabled={!module.configured || busy}
            onChange={() => void toggle()}
          />
          <strong>{module.label}</strong>
        </label>
        <span className={`chip chip-${status.tone}`}>{status.text}</span>
      </div>

      <p className="module-note">{module.note}</p>

      {module.missingConfig.length > 0 && (
        <p className="module-missing">
          Missing from <code>config/reporto.json</code>: {module.missingConfig.join(', ')}
        </p>
      )}
      {module.missingGh && (
        <p className="module-missing">
          The <code>gh</code> CLI is not authenticated — run <code>gh auth login</code>.
        </p>
      )}

      {module.vars.length > 0 && (
        <>
          <button type="button" className="module-more" onClick={() => setOpen(!open)}>
            {open ? 'Hide credentials' : module.configured ? 'Replace credentials' : 'Add credentials'}
          </button>
          {open && (
            <div className="module-secrets">
              {module.vars.map((name) => (
                <SecretField key={name} name={name} />
              ))}
              <p className="module-hint">
                {module.missingEnv.length > 0
                  ? `Still missing: ${module.missingEnv.join(', ')}`
                  : 'All set. Saving again replaces the value — that is how a rotated token gets in.'}
              </p>
            </div>
          )}
        </>
      )}
    </article>
  );
};

/**
 * The modules this machine has, what each one is missing, and a switch per module.
 *
 * Values are write-only by design: the server answers "set or unset" and never hands a
 * credential back, so this page can say what is configured without ever holding a token.
 * The switch is a config write rather than a browser preference, because `npm run pull` from
 * cron has to respect it too.
 */
export const ModuleSettings = () => {
  const { modules, loaded } = useCapabilities();

  if (!loaded) return <p className="status">Checking what this machine can do…</p>;
  if (modules.length === 0) {
    return (
      <p className="status">
        No answer from the dev server, so every module stays visible. This is a static build,
        or <code>npm run dev</code> is not the server behind this page.
      </p>
    );
  }

  return (
    <div className="module-rows">
      {modules.map((module) => (
        <ModuleRow key={module.kind} module={module} />
      ))}
    </div>
  );
};
