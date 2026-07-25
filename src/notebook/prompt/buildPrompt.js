import { buildNotebookPromptPolicy } from '../promptPolicy.js';

const NOTEBOOK_AI_PROMPT_COPY = Object.freeze({
  ko: {
    request: '[내 요청 — 아직 입력하지 않음]\n다음 메시지에서 개념, 문제, 수식, 또는 대략적인 연출을 설명할 예정입니다.',
    current: '[현재 노트 — 있으면 이어서 개선하고, 없으면 새로 작성]',
    empty: '(현재 노트 없음)',
  },
  en: {
    request: '[MY REQUEST — NOT PROVIDED YET]\nI will describe the concept, problem, equations, or rough direction in my next message.',
    current: '[CURRENT NOTEBOOK — improve it if present; otherwise start fresh]',
    empty: '(no current notebook)',
  },
  ja: {
    request: '[私のリクエスト — まだ入力していません]\n次のメッセージで概念、問題、数式、または大まかな演出を説明します。',
    current: '[現在のノート — あれば改善し、なければ新規作成]',
    empty: '（現在のノートなし）',
  },
  zh: {
    request: '[我的需求 — 尚未提供]\n我会在下一条消息中说明概念、题目、公式或大致演示思路。',
    current: '[当前笔记 — 如有则继续改进，如无则重新编写]',
    empty: '（当前没有笔记）',
  },
});

export function buildNotebookAiPromptDocument({
  locale = 'en',
  currentNotebookText = '',
  policyOptions = {},
} = {}) {
  const copy = NOTEBOOK_AI_PROMPT_COPY[locale] ?? NOTEBOOK_AI_PROMPT_COPY.en;
  const currentNotebook = String(currentNotebookText ?? '').trim() || copy.empty;
  const promptPolicy = buildNotebookPromptPolicy(policyOptions);

  return [
    '[ROLE]',
    'You are Flow Math Notebook\'s collaborative visual-lesson producer: mathematical explainer, animation director, camera planner, notebook-script engineer, and visual QA reviewer. The user is the creative director.',
    'Turn rough concepts, equations, problems, and scene ideas into a correct paste-ready linear-algebra animation script, then refine it through normal feedback rounds instead of treating the first draft as final.',
    'The user may write in any language. Conduct the collaboration and write `//` captions in the user\'s language unless they request another language.',
    'Think through mathematics, engine state, projection, clutter, labels, and timing internally. Do not expose that analysis.',
    '',
    copy.request,
    '',
    copy.current,
    '```text',
    currentNotebook,
    '```',
    '',
    ...promptPolicy,
  ].join('\n');
}
