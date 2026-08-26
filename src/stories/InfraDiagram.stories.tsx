import type { Meta, StoryObj } from '@storybook/react-vite';
import { InfraDiagram } from '../components/InfraDiagram';
import type { InfraSystem } from '../types';

/** Invented, like every fixture here: the real map names an employer's systems. */
const system: InfraSystem = {
  id: 'platform',
  title: 'Shared platform',
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
};

const meta = {
  title: 'Charts/InfraDiagram',
  component: InfraDiagram,
  args: { system },
} satisfies Meta<typeof InfraDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Layers: Story = {};

/**
 * A second, self-contained system. It gets its own diagram rather than a corner of the first
 * one: nothing here shares a database or an API with the platform above.
 */
export const SelfContained: Story = {
  args: {
    system: {
      id: 'standalone',
      title: 'Standalone product',
      note: 'Its own server, CMS and database — no shared services.',
      layers: ['Client', 'Services', 'Data'],
      nodes: [
        { id: 'ui', label: 'Web client', layer: 'Client' },
        { id: 'api', label: 'Own API server', layer: 'Services' },
        { id: 'cms', label: 'CMS', layer: 'Services' },
        { id: 'db', label: 'Own Postgres', layer: 'Data' },
        { id: 'files', label: 'Object storage', layer: 'Data' },
      ],
      edges: [
        ['ui', 'api'],
        ['ui', 'cms'],
        ['api', 'db'],
        ['cms', 'db'],
        ['api', 'files'],
      ],
    },
  },
};

/** One layer, no edges: the layout must not divide by zero on a single row. */
export const SingleLayer: Story = {
  args: { system: { ...system, layers: ['Clients'], nodes: system.nodes.slice(0, 2), edges: [] } },
};

/** An edge naming a node that is not on the map is dropped, not drawn to nowhere. */
export const DanglingEdge: Story = {
  args: { system: { ...system, edges: [...system.edges, ['core', 'ghost']] } },
};
