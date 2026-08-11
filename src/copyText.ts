/**
 * Copies text, tolerating a clipboard API that never answers.
 *
 * `navigator.clipboard.writeText` can hang indefinitely — neither resolving nor
 * rejecting — when the tab is not the frontmost OS window, even with permission granted
 * in a secure context. A bare await there leaves the caller stuck forever, so race it and
 * fall back to the synchronous selection trick, which does not depend on window focus.
 */
export async function copyText(text: string): Promise<boolean> {
  const viaApi = await Promise.race([
    navigator.clipboard
      ?.writeText(text)
      .then(() => true)
      .catch(() => false) ?? Promise.resolve(false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1200)),
  ]);
  if (viaApi) return true;

  return copyBySelection(text);
}

function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  // Keep it out of view but still selectable; `display:none` cannot be selected.
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
