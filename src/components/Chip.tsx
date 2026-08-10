import type { Chip as ChipTone } from '../types';

interface ChipProps {
  tone: ChipTone;
  children: React.ReactNode;
}

export const Chip = ({ tone, children }: ChipProps) => (
  <span className={`chip chip-${tone}`}>{children}</span>
);
