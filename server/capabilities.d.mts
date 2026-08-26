import type { ReportoConfig } from './reports.d.mts';

/** One module's standing. `missingEnv` is the shortest route to configured, never a value. */
export interface Capability {
  kind: string;
  label: string;
  note: string;
  /** Variables this module would accept a value for, so Settings can offer those fields. */
  vars: string[];
  missingEnv: string[];
  missingConfig: string[];
  missingGh: boolean;
  configured: boolean;
  /** False when switched off by hand, whether or not it is configured. */
  enabled: boolean;
}

export const CAPABILITIES: Record<
  string,
  { label: string; requires: string[][]; config?: string[]; gh?: boolean; note: string }
>;

/** Every variable `setSecret` will accept. Anything else is refused. */
export const WRITABLE: string[];

export function capabilityOf(
  kind: string,
  config?: ReportoConfig,
  env?: Map<string, string>,
): Capability | null;

export function capabilities(): Capability[];

/** Writes one variable into .env (0600, by rename). Returns the standing, never the value. */
export function setSecret(
  name: string,
  value: string,
): { name: string; configured: true; replaced: boolean };

export function setEnabled(kind: string, enabled: boolean): { kind: string; enabled: boolean };
