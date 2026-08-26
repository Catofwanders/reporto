import { useState } from 'react';
import Button from '@mui/material/Button';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { copyText } from '../copyText';

interface CopyPrLinksProps {
  /** PR urls to copy, one per line. The button hides itself when there are none. */
  links: string[];
  /** Overrides the button text where the caller has a better word than "links". */
  label?: string;
}

/**
 * Copies the links for a nudge. It lives beside the lane it applies to rather than in the
 * panel header, because "copy 0 links" as a permanently disabled control in a header reads
 * as something broken.
 */
export const CopyPrLinks = ({ links, label }: CopyPrLinksProps) => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string[] | null>(null);

  if (links.length === 0) return null;

  const copy = async () => {
    setFailed(null);
    if (await copyText(links.join('\n'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
      return;
    }
    // Every copy path refused; show the links so they can be selected by hand rather than
    // losing the action entirely.
    setFailed(links);
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<ContentCopyIcon fontSize="small" />}
        onClick={() => void copy()}
        sx={{ textTransform: 'none', color: 'var(--accent)', borderColor: 'var(--line)' }}
        variant="outlined"
      >
        {copied ? 'Copied' : (label ?? `Copy ${links.length} link${links.length === 1 ? '' : 's'}`)}
      </Button>

      {failed && (
        <details className="pr-copy-fallback" open>
          <summary>Clipboard refused — select these instead</summary>
          <textarea readOnly rows={Math.min(failed.length, 8)} value={failed.join('\n')} />
        </details>
      )}
    </>
  );
};
