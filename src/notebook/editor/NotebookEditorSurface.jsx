import React, { forwardRef, lazy, Suspense } from 'react';
import NotebookEditorLoadingState from './NotebookEditorLoadingState.jsx';

const MonacoNotebookEditor = lazy(() => import('./MonacoNotebookEditor.jsx'));

const NotebookEditorSurface = forwardRef(function NotebookEditorSurface(
  { fill = false, height, loadingLabel, ...editorProps },
  forwardedRef
) {
  return (
    <Suspense
      fallback={(
        <NotebookEditorLoadingState height={fill ? '100%' : height} label={loadingLabel} />
      )}
    >
      <MonacoNotebookEditor
        fill={fill}
        height={height}
        loadingLabel={loadingLabel}
        ref={forwardedRef}
        {...editorProps}
      />
    </Suspense>
  );
});

export default NotebookEditorSurface;
