let timer = 0;

/** A short message at the bottom of the screen, e.g. why an action failed. */
export function toast(text: string): void {
  const t = document.querySelector<HTMLElement>('.toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => t.classList.remove('show'), 2400);
}
