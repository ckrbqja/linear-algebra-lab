import { buildNotebookBasicLessons } from '../src/notebook/lessonExamples.js';
import { buildNotebookExamplePresets } from '../src/notebook/examplePresets.js';
import { buildVisualLinearAlgebraCourse } from '../src/notebook/visualCourse.js';

const LOCALES = Object.freeze(['ko', 'en', 'ja', 'zh']);
const BUILDERS = Object.freeze([
  ['basic', buildNotebookBasicLessons],
  ['visual-course', buildVisualLinearAlgebraCourse],
]);
const errors = [];

function fail(scope, message) {
  errors.push(`${scope}: ${message}`);
}

function nonEmptyLines(script) {
  return script.map((line) => String(line).trim()).filter(Boolean);
}

function isNumericToken(token) {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/u.test(token);
}

function collectMatrixNames(script) {
  const names = new Set();

  script.forEach((rawLine) => {
    const line = String(rawLine).trim();
    const alias = line.match(/#([A-Za-z][A-Za-z0-9_]*)!?@?\s*$/u)?.[1];
    const valueSource = line.replace(/\s+#.*$/u, '').trim();
    const numericTokens = valueSource.split(/\s+/u);
    if (
      alias &&
      !valueSource.includes(',') &&
      numericTokens.length >= 2 &&
      numericTokens.every(isNumericToken)
    ) {
      names.add(alias);
      return;
    }

    const product = line.match(
      /^([A-Za-z][A-Za-z0-9_]*)\s*\*\s*([A-Za-z][A-Za-z0-9_]*)\s+#([A-Za-z][A-Za-z0-9_]*)!?@?\s*$/u,
    );
    if (product && names.has(product[1]) && names.has(product[2])) {
      names.add(product[3]);
    }
  });

  return names;
}

function validateLesson(courseName, locale, chapter, lesson) {
  const scope = `${courseName}/${locale}/${chapter.id}/${lesson.id}`;
  if (!lesson.label?.trim()) fail(scope, 'missing localized lesson label');
  if (!Array.isArray(lesson.script) || lesson.script.length === 0) {
    fail(scope, 'script must be a non-empty line array');
    return;
  }

  lesson.script.forEach((rawLine, lineIndex) => {
    if (String(rawLine).replace(/\r/gu, '').includes('\n')) {
      fail(
        scope,
        `script item ${lineIndex + 1} contains a physical newline; use literal \\n inside one caption or separate line-array items`,
      );
    }
  });

  const lines = nonEmptyLines(lesson.script);
  if (!lines.some((line) => line.startsWith('//'))) {
    fail(scope, 'lesson needs at least one visible teaching caption');
  }

  const finalLine = lines.at(-1) ?? '';
  if (/^(?:checkpoint|clear|focus\s+-)$/iu.test(finalLine)) {
    fail(scope, `destructive or empty final beat: ${finalLine}`);
  }

  const matrixNames = collectMatrixNames(lesson.script);
  lines.forEach((line, lineIndex) => {
    const focus = line.match(/^focus\s+(.+)$/iu)?.[1];
    if (!focus || focus.trim() === '-') return;
    const focusedNames = focus.trim().split(/\s+/u);
    const focusedMatrices = focusedNames.filter((name) => matrixNames.has(name));
    if (focusedMatrices.length > 0) {
      fail(
        scope,
        `line ${lineIndex + 1} focuses matrix card(s): ${focusedMatrices.join(', ')}`,
      );
    }
  });

  if (lesson.id === 'positive-definite') {
    const contractFields = ['claim', 'evidence', 'representation', 'operation', 'finalState'];
    contractFields.forEach((field) => {
      if (!lesson.contract?.[field]?.trim()) {
        fail(scope, `missing positive-definite lesson contract field: ${field}`);
      }
    });

    const sourceIndex = lines.findIndex((line) => /^1,\s*2\s+#x@$/u.test(line));
    const transformIndex = lines.findIndex((line) => /^A\s*\*\s*x\s+#Ax@$/u.test(line));
    const dotIndex = lines.findIndex((line) => /^dot\(x,\s*Ax\)\s+#energy@$/u.test(line));
    const boardIndex = lines.findIndex((line) => line === 'field board');
    const proofIndex = lines.findIndex((line) => line.includes('uᵀAu'));

    if (!(sourceIndex >= 0 && sourceIndex < transformIndex && transformIndex < dotIndex)) {
      fail(scope, 'comparison must preserve x, create Ax, then measure dot(x, Ax)');
    }
    if (sourceIndex >= 0 && dotIndex >= sourceIndex) {
      const comparisonWindow = lines.slice(sourceIndex, dotIndex + 1);
      if (comparisonWindow.some((line) => line === 'A' || line === 'x -' || line === 'clear')) {
        fail(scope, 'comparison mutates or hides the original x before the dot measurement');
      }
    }
    if (!(dotIndex >= 0 && dotIndex < boardIndex && boardIndex < proofIndex)) {
      fail(scope, 'one-vector sample must be followed by a board-based all-vector proof');
    }
  }
}

for (const [courseName, buildCourse] of BUILDERS) {
  const localizedCourses = LOCALES.map((locale) => [locale, buildCourse(locale)]);
  const reference = localizedCourses[0][1];
  const referenceChapterIds = reference.chapters.map((chapter) => chapter.id);
  const referenceLessonIds = reference.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => lesson.id),
  );

  localizedCourses.forEach(([locale, course]) => {
    const scope = `${courseName}/${locale}`;
    if (!course.title?.trim()) fail(scope, 'missing localized course title');
    if (!course.hint?.trim()) fail(scope, 'missing localized course hint');

    const chapterIds = course.chapters.map((chapter) => chapter.id);
    if (chapterIds.join('|') !== referenceChapterIds.join('|')) {
      fail(scope, 'chapter IDs/order differ from the Korean reference');
    }

    const lessonIds = course.chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => lesson.id),
    );
    if (lessonIds.join('|') !== referenceLessonIds.join('|')) {
      fail(scope, 'lesson IDs/order differ from the Korean reference');
    }
    if (new Set(lessonIds).size !== lessonIds.length) {
      fail(scope, 'duplicate lesson IDs');
    }

    course.chapters.forEach((chapter) => {
      if (!chapter.title?.trim()) fail(`${scope}/${chapter.id}`, 'missing chapter title');
      if (!chapter.numberLabel?.trim()) fail(`${scope}/${chapter.id}`, 'missing chapter number');
      if (courseName === 'visual-course') {
        if (!chapter.summary?.trim()) fail(`${scope}/${chapter.id}`, 'missing chapter summary');
      }
      chapter.lessons.forEach((lesson) => validateLesson(courseName, locale, chapter, lesson));
    });
  });
}

{
  const localizedExamples = LOCALES.map((locale) => [locale, buildNotebookExamplePresets(locale)]);
  const referenceIds = localizedExamples[0][1].lessons.map((lesson) => lesson.id);
  const contractFields = ['claim', 'evidence', 'representation', 'operation', 'finalState'];

  localizedExamples.forEach(([locale, collection]) => {
    const scope = `quick-examples/${locale}`;
    if (!collection.title?.trim()) fail(scope, 'missing localized collection title');

    const lessonIds = collection.lessons.map((lesson) => lesson.id);
    if (lessonIds.join('|') !== referenceIds.join('|')) {
      fail(scope, 'example IDs/order differ from the Korean reference');
    }
    if (new Set(lessonIds).size !== lessonIds.length) {
      fail(scope, 'duplicate example IDs');
    }

    collection.lessons.forEach((lesson) => {
      validateLesson('quick-examples', locale, { id: 'quick' }, lesson);
      contractFields.forEach((field) => {
        if (!lesson.contract?.[field]?.trim()) {
          fail(`${scope}/${lesson.id}`, `missing lesson contract field: ${field}`);
        }
      });
      if (collection.byId?.[lesson.id] !== lesson) {
        fail(`${scope}/${lesson.id}`, 'byId index does not reference the lesson object');
      }
    });
  });
}

if (errors.length > 0) {
  console.error(`Visual lesson validation failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Visual lesson validation passed: locale parity, structure, endings, and focus rules.');
}
