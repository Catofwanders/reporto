import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PALETTES, applyPalette, readPalette } from '../theme';

export const SettingsPage = () => {
  const [palette, setPalette] = useState(readPalette);

  const choose = (id: string) => {
    applyPalette(id);
    setPalette(id);
  };

  return (
    <main className="grid">
      <Link to="/" className="back-link">
        ← Home
      </Link>

      <section className="panel">
        <div className="panel-head">
          <h2>🎨 Palette</h2>
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
