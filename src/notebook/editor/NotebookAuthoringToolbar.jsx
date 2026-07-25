import {
  Check,
  Gauge,
  MonitorPlay,
  Play,
  Square,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import ShinySparkles from '../../components/reactbits/ShinySparkles.jsx';
import NotebookAiGuideDialog from './NotebookAiGuideDialog.jsx';

export default function NotebookAuthoringToolbar({
  checkpoint,
  completed,
  onCopyAnimationLink,
  onCopyPrompt,
  onTogglePlayback,
  playbackLabelKey,
  playing,
  translate,
}) {
  const [showAiGuide, setShowAiGuide] = useState(false);
  const closeAiGuide = useCallback(() => setShowAiGuide(false), []);

  return (
    <>
      <div
        aria-label={translate('notebook')}
        className="notebook-add-top"
        role="toolbar"
      >
        <button
          aria-label={translate('notebookAiPromptCopy')}
          className="tiny-add-button notebook-ai-prompt-button"
          onClick={() => setShowAiGuide(true)}
          title={translate('notebookAiPromptTitle')}
          type="button"
        >
          <ShinySparkles size={13} />
          <span>{translate('notebookAiPromptCopy')}</span>
        </button>
        <button
          aria-label={translate('notebookAnimationShareCopy')}
          className="tiny-add-button notebook-animation-share-button"
          onClick={onCopyAnimationLink}
          title={translate('notebookAnimationShareTitle')}
          type="button"
        >
          <MonitorPlay size={13} />
          <span>{translate('notebookAnimationShareCopy')}</span>
        </button>
        <button
          aria-label={translate(playbackLabelKey)}
          className={`tiny-add-button notebook-play-toggle ${playing ? 'playing' : ''} ${checkpoint ? 'checkpoint' : ''} ${completed ? 'completed' : ''}`}
          onClick={onTogglePlayback}
          title={translate(playbackLabelKey)}
          type="button"
        >
          {playing
            ? <Square fill="currentColor" size={12} strokeWidth={2.5} />
            : completed
            ? <Check size={14} strokeWidth={2.8} />
            : <Play fill="currentColor" size={13} strokeWidth={2.5} />}
          <span>{translate(playbackLabelKey)}</span>
        </button>
      </div>
      {showAiGuide && (
        <NotebookAiGuideDialog
          onClose={closeAiGuide}
          onCopyPrompt={onCopyPrompt}
          translate={translate}
        />
      )}
    </>
  );
}

export function NotebookSpeedControl({
  formatSpeed,
  onSpeedChange,
  speed,
  translate,
}) {
  const progress = Math.max(0, Math.min(100, ((Number(speed) - 0.35) / 0.9) * 100));

  return (
    <div className="notebook-playback-settings">
      <label
        className="notebook-speed-control"
        style={{ '--notebook-speed-progress': `${progress}%` }}
        title={translate('notebookSpeedTitle')}
      >
        <span>
          <Gauge aria-hidden="true" size={14} strokeWidth={2.2} />
          <strong>{translate('speed')}</strong>
        </span>
        <input
          aria-label={translate('notebookSpeedTitle')}
          max="1.25"
          min="0.35"
          onChange={(event) => onSpeedChange(event.target.value)}
          step="0.05"
          type="range"
          value={speed}
        />
        <em>{formatSpeed(speed)}</em>
      </label>
    </div>
  );
}
