import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface ReportAccordionProps {
  title: string;
  count: number;
  meta?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const summarySx = {
  minHeight: 0,
  '& .MuiAccordionSummary-content': { margin: '.65rem 0', alignItems: 'baseline', gap: '.5rem' },
};

const accordionSx = {
  background: 'var(--panel)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: '.55rem',
  boxShadow: 'none',
  '&::before': { display: 'none' },
  '&.Mui-expanded': { margin: 0 },
  '& + &': { marginTop: '.7rem' },
};

export const ReportAccordion = ({
  title,
  count,
  meta,
  defaultExpanded = true,
  children,
}: ReportAccordionProps) => (
  <Accordion defaultExpanded={defaultExpanded} disableGutters square sx={accordionSx}>
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ color: 'var(--ink-2)' }} />}
      sx={summarySx}
    >
      <span className="section-title-text">{title}</span>
      <span className="count">{count}</span>
      {meta && <span className="account">{meta}</span>}
    </AccordionSummary>
    <AccordionDetails sx={{ padding: '0 .9rem .9rem' }}>{children}</AccordionDetails>
  </Accordion>
);
