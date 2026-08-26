import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ReportKind } from '../reportKinds';
import { useCapabilities } from '../capabilitiesContext';

interface ModuleGateProps {
  kind: ReportKind;
  children: ReactNode;
}

/**
 * The page behind a hidden nav row.
 *
 * Hiding the row is not enough: a bookmark, a ⌘K entry from before the switch, or the browser
 * back button all still land here, and a page that renders empty in that case looks broken.
 * So it says which of the two it is — never set up, or switched off — and where to change it.
 */
export const ModuleGate = ({ kind, children }: ModuleGateProps) => {
  const { of, loaded } = useCapabilities();
  const module = of(kind);

  // No answer from the server (static build, or still in flight) means no claim to make.
  if (!loaded || !module || (module.configured && module.enabled)) return <>{children}</>;

  const missing = [
    ...module.missingEnv,
    ...module.missingConfig,
    ...(module.missingGh ? ['gh auth login'] : []),
  ];

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <h2>{module.label} is {module.configured ? 'switched off' : 'not set up'}</h2>
        </div>
        <p className="status">
          {module.configured
            ? 'This module is off, so it is hidden from the sidebar and the dashboard.'
            : `${module.note} Missing: ${missing.join(', ')}.`}{' '}
          <Link to="/settings">Change it in Settings</Link>.
        </p>
      </section>
    </main>
  );
};
