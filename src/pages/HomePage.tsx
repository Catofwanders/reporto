import { useEffect, useState } from 'react';
import type { CalendarReport, EmailReport, JiraReport, PrsReport } from '../types';
import type { Todo } from '../db';
import { loadDay } from '../db';
import { useRefresh } from '../refreshContext';
import { summarizeEmail } from '../summary';
import { CalendarWidget } from '../components/CalendarWidget';
import { MailWidget } from '../components/MailWidget';
import { JiraActiveList } from '../components/JiraActiveList';
import { OpenPrList } from '../components/OpenPrList';

interface HomePageProps {
  email: EmailReport | null;
  jira: JiraReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

export const HomePage = ({ email, jira, calendar, prs }: HomePageProps) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const { run } = useRefresh();

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    loadDay(email.date)
      .then((day) => {
        if (!cancelled && day) setTodos(day.todos);
      })
      .catch(() => {
        /* no db yet — summary falls back to raw report counts */
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const emailSummary = email ? summarizeEmail(email, todos) : null;

  return (
    <main className="home">
      <div className="home-content">
        {prs && <OpenPrList report={prs} onChanged={() => void run('prs')} />}
        {jira && <JiraActiveList report={jira} onChanged={() => void run('jira')} />}
      </div>

      <div className="home-widgets">
        {email && emailSummary && <MailWidget report={email} summary={emailSummary} />}
        {calendar && <CalendarWidget report={calendar} />}
      </div>
    </main>
  );
};
