import { createContext, useContext } from 'react';
import type { ReportKind } from './reportKinds';

/** One module's standing, as the server reports it. Never carries a credential's value. */
export interface Capability {
  kind: ReportKind;
  label: string;
  note: string;
  vars: string[];
  missingEnv: string[];
  missingConfig: string[];
  missingGh: boolean;
  configured: boolean;
  enabled: boolean;
}

export interface CapabilitiesValue {
  modules: Capability[];
  /** Configured *and* switched on — the test for showing a nav row, a module or a card. */
  usable: (kind: ReportKind) => boolean;
  of: (kind: ReportKind) => Capability | null;
  /** False until the first answer arrives, so nothing flashes into view and back out. */
  loaded: boolean;
  setEnabled: (kind: ReportKind, enabled: boolean) => Promise<void>;
  /** Sends a credential to the dev server, which writes it to .env and answers with status. */
  saveSecret: (name: string, value: string) => Promise<void>;
}

/**
 * Before the first fetch answers, everything is usable. The alternative — hiding every module
 * until the server replies — makes the whole app blink on each load, and a static build has
 * no server to reply at all.
 */
export const CapabilitiesContext = createContext<CapabilitiesValue>({
  modules: [],
  usable: () => true,
  of: () => null,
  loaded: false,
  setEnabled: async () => {},
  saveSecret: async () => {},
});

export const useCapabilities = () => useContext(CapabilitiesContext);
