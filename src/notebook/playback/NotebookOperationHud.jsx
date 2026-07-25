import { useEffect, useState } from 'react';

const EXIT_MS = 220;

export default function NotebookOperationHud({ compact = false, presentation, renderMath, translate }) {
  const [current, setCurrent] = useState(presentation);
  const [visible, setVisible] = useState(Boolean(presentation));
  const presentationKey = presentation
    ? `${presentation.kind}|${presentation.labelKey}|${presentation.math}`
    : '';

  useEffect(() => {
    if (presentationKey) {
      setCurrent(presentation);
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const timer = window.setTimeout(() => setCurrent(null), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [presentationKey]);

  if (!current) return null;

  return (
    <div
      aria-live="polite"
      className={`notebook-operation-hud ${compact ? 'compact' : ''} ${visible ? 'visible' : 'leaving'} ${current.kind}`}
      role="status"
    >
      <span className="notebook-operation-hud-label">
        <i aria-hidden="true" />
        {translate(current.labelKey)}
      </span>
      <strong>{renderMath(current.math)}</strong>
      <span aria-hidden="true" className="notebook-operation-hud-progress" />
    </div>
  );
}
