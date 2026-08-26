import { useState } from 'react';
import { PALETTES, applyPalette, readPalette } from '../theme';
import { STALE_HOURS, autoRefreshEnabled, setAutoRefresh } from '../autoRefresh';
import { ModuleSettings } from '../components/ModuleSettings';

export const SettingsPage = () => {
  const [palette, setPalette] = useState(readPalette);
  const [auto, setAuto] = useState(autoRefreshEnabled);

  const toggleAuto = () => {
    setAutoRefresh(!auto);
    setAuto(!auto);
  };

  const choose = (id: string) => {
    applyPalette(id);
    setPalette(id);
  };

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Modules</h2>
            <p className="panel-sub">
              What this machine can fetch. Anything unconfigured or switched off is hidden
              from the sidebar, the dashboard and ⌘K rather than failing when pressed.
            </p>
          </div>
          <span className="panel-meta">saved on this machine</span>
        </div>

        <ModuleSettings />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Updating</h2>
          <span className="panel-meta">saved in this browser</span>
        </div>

        <label className="setting-row">
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <span>
            <strong>Update stale reports when I open the dashboard</strong>
            <em>
              Anything older than {STALE_HOURS} hours is refetched once per session — only
              the reports the server can pull itself, never an agent run.
            </em>
          </span>
        </label>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Palette</h2>
          <span className="panel-meta">applies everywhere, saved in this browser</span>
        </div>

        <div className="palette-grid">
          {PALETTES.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`palette-card${palette === option.id ? ' is-current' : ''}`}
              onClick={() => choose(option.id)}
              aria-pressed={palette === option.id}
            >
              <span className="palette-swatch" aria-hidden="true">
                {option.swatch.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="palette-name">
                {option.name}
                {palette === option.id && <span className="palette-current">current</span>}
              </span>
              <span className="palette-note">{option.note}</span>
            </button>
          ))}
        </div>

        <p className="foot">
          Light or dark follows the operating system — every palette defines both, so
          switching your system appearance switches with it.
        </p>
      </section>
    </main>
  );
};
