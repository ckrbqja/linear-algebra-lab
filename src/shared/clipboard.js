export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy copy path for restricted browser contexts.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('copy failed');
  } finally {
    textarea.remove();
  }
}
