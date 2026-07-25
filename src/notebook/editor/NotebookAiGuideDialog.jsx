import { ArrowRight, Copy, NotebookPen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function NotebookAiGuideDialog({ onClose, onCopyPrompt, translate }) {
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await onCopyPrompt();
      onClose();
    } finally {
      setCopying(false);
    }
  };

  return createPortal(
    <div
      className="notebook-ai-guide-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="notebook-ai-guide-title"
        aria-modal="true"
        className="notebook-ai-guide-dialog"
        role="dialog"
      >
        <header className="notebook-ai-guide-head">
          <span className="notebook-ai-guide-icon" aria-hidden="true">
            <NotebookPen size={18} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="notebook-ai-guide-title">{translate('notebookAiGuideTitle')}</h2>
            <p>{translate('notebookAiGuideDescription')}</p>
          </div>
          <button
            aria-label={translate('notebookAiGuideClose')}
            className="notebook-ai-guide-close"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <ol className="notebook-ai-guide-steps">
          <li><span aria-hidden="true">01</span><p>{translate('notebookAiGuideStep1')}</p></li>
          <li><span aria-hidden="true">02</span><p>{translate('notebookAiGuideStep2')}</p></li>
          <li><span aria-hidden="true">03</span><p>{translate('notebookAiGuideStep3')}</p></li>
        </ol>

        <div className="notebook-ai-guide-examples">
          <strong>{translate('notebookAiGuideExamplesTitle')}</strong>
          <ul>
            <li><ArrowRight aria-hidden="true" size={14} /><span>{translate('notebookAiGuideExample1')}</span></li>
            <li><ArrowRight aria-hidden="true" size={14} /><span>{translate('notebookAiGuideExample2')}</span></li>
            <li><ArrowRight aria-hidden="true" size={14} /><span>{translate('notebookAiGuideExample3')}</span></li>
          </ul>
        </div>

        <p className="notebook-ai-guide-hint">{translate('notebookAiGuideIterationHint')}</p>

        <footer className="notebook-ai-guide-actions">
          <button className="secondary" onClick={onClose} type="button">
            {translate('notebookAiGuideClose')}
          </button>
          <button autoFocus disabled={copying} onClick={handleCopy} type="button">
            <Copy size={15} />
            <span>{translate('notebookAiGuideCopyAction')}</span>
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
