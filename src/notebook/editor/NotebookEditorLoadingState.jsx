export default function NotebookEditorLoadingState({
  embedded = false,
  height,
  label,
}) {
  return (
    <div
      aria-live="polite"
      className={`notebook-monaco-loading${embedded ? ' embedded' : ''}`}
      role="status"
      style={{ height }}
    >
      <span className="notebook-monaco-loading-indicator">
        <span aria-hidden="true" className="notebook-monaco-loading-spinner" />
        <span>{label}</span>
      </span>
    </div>
  );
}
