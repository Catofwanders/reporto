/**
 * Writes to Slack, from the browser to the dev server.
 *
 * The row id is what travels, not a channel: the server looks the row up in the report it
 * holds and refuses anything that is not in it. So the worst a bug here can do is answer a
 * conversation that is already on the page.
 */
const post = async (path: string, body: unknown) => {
  const res = await fetch(`/api/slack${path}`, {
    method: 'POST',
    // The custom header forces a preflight the dev server never answers, so no other page
    // can reach this endpoint.
    headers: { 'Content-Type': 'application/json', 'X-Reporto-Write': '1' },
    body: JSON.stringify(body),
  });
  const answer = (await res.json()) as { ok?: boolean; error?: string; ts?: string };
  if (!res.ok || !answer.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
  return answer;
};

/** Sends a reply as me — in the thread when there is one, in the channel when there is not. */
export const sendSlackReply = (id: string, text: string) => post('/reply', { id, text });

/** A reaction as a one-word answer. Defaults to ✅ on the server. */
export const sendSlackReaction = (id: string, name?: string) => post('/react', { id, name });
