import {
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import NotebookOperationHud from './NotebookOperationHud.jsx';

export default function NotebookSceneDock({
  activeLineIndex,
  activeSegment,
  activeSegmentProgress,
  checkpoint,
  colorToHex,
  completed,
  isAnimationFocus,
  isAnimationViewer,
  marks,
  onFocusToggle,
  onJumpToLine,
  onProgressKeyDown,
  onProgressPointerDown,
  onSelectSegment,
  onTogglePlayback,
  operationPresentation,
  playbackLabelKey,
  playing,
  progressRef,
  renderMath,
  segments,
  translate,
}) {
  return (
    <div className="notebook-scene-dock">
      <button
        aria-label={translate(playbackLabelKey)}
        className={`notebook-scene-play ${playing ? 'playing' : ''} ${checkpoint ? 'checkpoint' : ''} ${completed ? 'completed' : ''}`}
        data-segment-id={activeSegment?.id ?? ''}
        onClick={(event) => onTogglePlayback(event.currentTarget.dataset.segmentId)}
        title={translate(playbackLabelKey)}
        type="button"
      >
        {playing ? <Pause size={14} /> : checkpoint || completed ? <RotateCcw size={14} /> : <Play size={14} />}
      </button>
      <div className="notebook-scene-progress">
        <div className="progress-meta notebook-scene-meta">
          <select
            aria-label={translate('notebookSegmentPicker')}
            className="notebook-segment-picker"
            onChange={(event) => onSelectSegment(event.target.value)}
            value={activeSegment?.id ?? ''}
          >
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {translate(
                  segment.kind === 'inspect'
                    ? 'notebookInspectSegment'
                    : segment.kind === 'final'
                      ? 'notebookFinalSegment'
                      : 'notebookCheckpointSegment',
                  { index: segment.ordinal }
                )}
              </option>
            ))}
          </select>
          <NotebookOperationHud
            compact
            presentation={operationPresentation}
            renderMath={renderMath}
            translate={translate}
          />
          <strong>{Math.round(activeSegmentProgress)}%</strong>
        </div>
        <div
          aria-label={translate('notebookSegmentProgress')}
          aria-valuemax="100"
          aria-valuemin="0"
          aria-valuenow={Math.round(activeSegmentProgress)}
          className="notebook-scene-scrubber"
          onKeyDown={onProgressKeyDown}
          onPointerDown={onProgressPointerDown}
          ref={progressRef}
          role="slider"
          tabIndex={0}
        >
          <span className="notebook-scene-track" />
          <span className="notebook-scene-fill" style={{ width: `${activeSegmentProgress}%` }} />
          {marks.map((mark) => {
            const lineColor = mark.color ? colorToHex(mark.color) : '#8b5cf6';
            return (
              <button
                aria-label={`${mark.detail}, ${Math.round(mark.percent)}%`}
                className={`notebook-scene-mark ${mark.kind ?? ''} ${mark.lineIndex <= activeLineIndex ? 'revealed' : 'future'} ${mark.percent < 12 ? 'edge-start' : mark.percent > 88 ? 'edge-end' : ''}`}
                key={`${mark.lineIndex}-${mark.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onJumpToLine(mark.lineIndex);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ left: `${mark.percent}%`, '--line-color': lineColor }}
                type="button"
              >
                <span aria-hidden="true" className="notebook-scene-mark-tick" />
                <span className="notebook-scene-mark-tooltip" role="tooltip">
                  <span className="notebook-scene-mark-detail">{mark.detail}</span>
                  <span className="notebook-scene-mark-meta">
                    <b style={{ '--line-color': lineColor }}>{mark.label}</b>
                    {Math.round(mark.percent)}%
                  </span>
                </span>
              </button>
            );
          })}
          <span className="notebook-scene-thumb" style={{ left: `${activeSegmentProgress}%` }} />
        </div>
      </div>
      {!isAnimationViewer && (
        <button
          aria-pressed={isAnimationFocus}
          className={`icon-text-button animation-focus-button ${isAnimationFocus ? 'active' : ''}`}
          onClick={onFocusToggle}
          title={translate(isAnimationFocus ? 'animationFocusExitTitle' : 'animationFocusTitle')}
          type="button"
        >
          {isAnimationFocus ? <EyeOff size={17} /> : <Eye size={17} />}
          <span>{translate(isAnimationFocus ? 'animationFocusExit' : 'animationFocus')}</span>
        </button>
      )}
    </div>
  );
}
