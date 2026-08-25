import type { Meta, StoryObj } from '@storybook/react-vite';
import { InfraDiagram } from '../components/InfraDiagram';
import type { ProjectMap } from '../types';

/** Invented, like every fixture here: the real map names an employer's systems. */
const map: ProjectMap = {
  projects: [],
  workflow: { stages: [] },
  infra: {
    note: 'High level only — what talks to what, not how it is deployed.',
    layers: ['Clients', 'Edge', 'Services', 'Data'],
    nodes: [
      { id: 'web', label: 'Customer web', layer: 'Clients' },
      { id: 'admin', label: 'Admin console', layer: 'Clients' },
      { id: 'graph', label: 'GraphQL gateway', note: 'schema of record', layer: 'Edge' },
      { id: 'core', label: 'Backend core', layer: 'Services' },
      { id: 'jobs', label: 'Workers', note: 'queues', layer: 'Services' },
      { id: 'db', label: 'Postgres', layer: 'Data' },
    ],
    edges: [
      ['web', 'graph'],
      ['admin', 'graph'],
      ['graph', 'core'],
      ['core', 'jobs'],
      ['core', 'db'],
      ['jobs', 'db'],
    ],
  },
};

const meta = {
  title: 'Charts/InfraDiagram',
  component: InfraDiagram,
  args: { map },
} satisfies Meta<typeof InfraDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Layers: Story = {};

/** One layer, no edges: the layout must not divide by zero on a single row. */
export const SingleLayer: Story = {
  args: {
    map: {
      ...map,
      infra: { ...map.infra, layers: ['Clients'], nodes: map.infra.nodes.slice(0, 2), edges: [] },
    },
  },
};

/** An edge naming a node that is not on the map is dropped, not drawn to nowhere. */
export const DanglingEdge: Story = {
  args: {
    map: { ...map, infra: { ...map.infra, edges: [...map.infra.edges, ['core', 'ghost']] } },
  },
};
