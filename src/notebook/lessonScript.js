export function normalizeNotebookLessonScriptLine(line) {
  const source = String(line ?? '');
  if (!source.trimStart().startsWith('//') || !source.includes('\n')) return source;
  return source.replace(/\r?\n/gu, '\\n');
}

export function normalizeNotebookLesson(lesson) {
  if (!lesson || !Array.isArray(lesson.script)) return lesson;
  return {
    ...lesson,
    script: lesson.script.map(normalizeNotebookLessonScriptLine),
  };
}
