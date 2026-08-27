import type { Meta, StoryObj } from '@storybook/react-vite';
import { Adf } from '../components/Adf';
import { adfDescription } from './fixtures';

const meta = {
  title: 'Panels/Adf',
  component: Adf,
  args: { doc: adfDescription },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Adf>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every node type the renderer handles, in one description. Worth reading as a checklist: the
 * `date` renders (it has no children, so the fall-through used to drop it), the attachment
 * becomes a line rather than a broken image, and the invented `someFutureNode` at the bottom
 * keeps its text — which is the whole point of degrading instead of throwing.
 */
export const Everything: Story = {};

/** The common case by far: a couple of paragraphs and a link. */
export const JustProse: Story = {
  args: {
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Buyers see a stale basket total after a listing price change. ' },
            {
              type: 'text',
              text: 'repro steps',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/repro' } }],
            },
          ],
        },
      ],
    },
  },
};

/**
 * A link whose href is not http(s). ADF is content written by whoever wrote the ticket, so a
 * `javascript:` href is a script somebody else chose to run in this page: the text stays, the
 * link does not.
 */
export const UnsafeLinkDropped: Story = {
  args: {
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'this text renders, ' },
            {
              type: 'text',
              text: 'this one is not a link',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
  },
};

/** No description at all — renders nothing, so the caller decides what to say instead. */
export const Nothing: Story = { args: { doc: null } };
