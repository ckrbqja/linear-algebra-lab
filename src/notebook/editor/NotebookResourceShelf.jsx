import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Save, X } from 'lucide-react';
import { motion, useTransform } from 'motion/react';
import { Sheet } from 'react-modal-sheet';
import { t } from '../../app/localization.js';

const RESOURCE_TABS = Object.freeze({
  examples: 'examples',
  course: 'course',
  notebooks: 'notebooks',
});

const MOBILE_RESOURCE_SNAP_POINTS = Object.freeze([0, 0.42, 0.64, 0.84, 1]);

const getMobileSnapIndex = (tabId) => {
  if (tabId === RESOURCE_TABS.course) return 3;
  if (tabId === RESOURCE_TABS.notebooks) return 2;
  return 1;
};

function MobileResourceSheetFooter({ children }) {
  const { yProgress } = Sheet.useContext();
  const opacity = useTransform(yProgress, [0, 0.12, 0.2], [0, 0.7, 1]);

  return (
    <motion.div className="mobile-resource-sheet-footer" style={{ opacity }}>
      {children}
    </motion.div>
  );
}

export default function NotebookResourceShelf({
  activeSavedNotebookId,
  applyPresetToNotebook,
  collapsible = false,
  deleteSavedNotebook,
  formatSavedNotebookTime,
  locale,
  notebookCourse,
  notebookExamples,
  openSavedNotebook,
  pendingNotebookDeleteId,
  saveCurrentNotebook,
  savedNotebookTitle,
  savedNotebooks,
  setSavedNotebookTitle,
  startNewNotebook,
}) {
  const [activeTab, setActiveTab] = useState(
    collapsible ? null : RESOURCE_TABS.examples,
  );
  const [openLessonChapterId, setOpenLessonChapterId] = useState(null);
  const sheetRef = useRef(null);
  const sheetWasOpenRef = useRef(false);
  const lastActiveTabRef = useRef(RESOURCE_TABS.examples);

  if (activeTab) lastActiveTabRef.current = activeTab;

  const tabs = [
    { id: RESOURCE_TABS.examples, label: notebookExamples.title },
    { id: RESOURCE_TABS.course, label: t(locale, 'notebookResourceCourse') },
    {
      id: RESOURCE_TABS.notebooks,
      label: t(locale, 'myNotebooks'),
      count: savedNotebooks.length,
    },
  ];
  const renderedTab = activeTab ?? lastActiveTabRef.current;
  const mobileSnapIndex = getMobileSnapIndex(renderedTab);

  useEffect(() => {
    setActiveTab((current) => (
      collapsible ? null : current ?? RESOURCE_TABS.examples
    ));
    setOpenLessonChapterId(null);
  }, [collapsible]);

  useEffect(() => {
    if (!collapsible || !activeTab) {
      sheetWasOpenRef.current = false;
      return;
    }
    if (sheetWasOpenRef.current) {
      sheetRef.current?.snapTo(getMobileSnapIndex(activeTab));
    }
    sheetWasOpenRef.current = true;
  }, [activeTab, collapsible]);

  const closeMobileSheet = () => {
    setActiveTab(null);
    setOpenLessonChapterId(null);
  };

  const selectResourceTab = (tabId) => {
    if (collapsible && activeTab === tabId) {
      closeMobileSheet();
      return;
    }

    if (tabId === RESOURCE_TABS.course) setOpenLessonChapterId(null);
    setActiveTab(tabId);
  };

  const applyResourceScript = (script) => {
    applyPresetToNotebook(script);
    if (collapsible) closeMobileSheet();
  };

  const openResourceNotebook = (id) => {
    openSavedNotebook(id);
    if (collapsible) closeMobileSheet();
  };

  const createResourceNotebook = () => {
    startNewNotebook();
    if (collapsible) closeMobileSheet();
  };

  const toggleLessonChapter = (chapterId) => {
    const nextChapterId = openLessonChapterId === chapterId ? null : chapterId;
    setOpenLessonChapterId(nextChapterId);
    if (
      collapsible &&
      nextChapterId &&
      sheetRef.current?.currentSnap !== getMobileSnapIndex(RESOURCE_TABS.course)
    ) {
      sheetRef.current?.snapTo(getMobileSnapIndex(RESOURCE_TABS.course));
    }
  };

  const renderTabs = (idPrefix) => (
    <div
      aria-label={t(locale, 'notebookResources')}
      className="notebook-resource-tabs"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-controls={collapsible ? 'mobile-notebook-resource-panel' : 'notebook-resource-panel'}
            aria-expanded={isActive}
            aria-selected={isActive}
            className={isActive ? 'active' : ''}
            id={`${idPrefix}-notebook-resource-tab-${tab.id}`}
            key={tab.id}
            onClick={() => selectResourceTab(tab.id)}
            role="tab"
            type="button"
          >
            <span>{tab.label}</span>
            {Number.isInteger(tab.count) && <em>{tab.count}</em>}
          </button>
        );
      })}
    </div>
  );

  const renderResourcePanel = (tabId, idPrefix, className = '') => (
    <div
      aria-labelledby={`${idPrefix}-notebook-resource-tab-${tabId}`}
      className={`notebook-resource-panel ${className}`.trim()}
      id={collapsible ? 'mobile-notebook-resource-panel' : 'notebook-resource-panel'}
      role="tabpanel"
    >
      {tabId === RESOURCE_TABS.examples && (
        <div className="notebook-example-bank notebook-resource-examples">
          <div className="equation-presets line-presets" aria-label={notebookExamples.title}>
            {notebookExamples.lessons.map((lesson) => (
              <button key={lesson.id} onClick={() => applyResourceScript(lesson.script)} type="button">
                {lesson.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tabId === RESOURCE_TABS.course && (
        <div className="notebook-example-bank notebook-lesson-bank">
          <div className="notebook-lesson-heading">
            <div className="notebook-example-label">{notebookCourse.title}</div>
            <small>{notebookCourse.hint}</small>
          </div>
          <div className="notebook-course-chapters" aria-label={notebookCourse.title}>
            {notebookCourse.chapters.map((chapter, chapterIndex) => {
              const isOpen = openLessonChapterId === chapter.id;
              return (
                <section className={`notebook-course-chapter ${isOpen ? 'open' : ''}`} key={chapter.id}>
                  <button
                    aria-expanded={isOpen}
                    className="notebook-chapter-toggle"
                    onClick={() => toggleLessonChapter(chapter.id)}
                    type="button"
                  >
                    <span className="notebook-chapter-number">{chapter.numberLabel}</span>
                    <strong>{chapter.title}</strong>
                    <span aria-hidden="true" className="notebook-chapter-chevron">⌄</span>
                  </button>
                  {isOpen && (
                    <>
                      <div className="notebook-chapter-details">
                        <p>{chapter.summary}</p>
                      </div>
                      <div className="equation-presets notebook-lesson-presets">
                        {chapter.lessons.map((lesson, lessonIndex) => (
                          <button key={lesson.id} onClick={() => applyResourceScript(lesson.script)} type="button">
                            <span className="notebook-lesson-number">{chapterIndex + 1}.{lessonIndex + 1}</span>
                            <strong>{lesson.label}</strong>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {tabId === RESOURCE_TABS.notebooks && (
        <div className="notebook-library">
          <div className="notebook-library-body">
            <div className="notebook-library-compose">
              <input
                aria-label={t(locale, 'notebookTitle')}
                onChange={(event) => setSavedNotebookTitle(event.target.value)}
                placeholder={t(locale, 'notebookTitlePlaceholder')}
                type="text"
                value={savedNotebookTitle}
              />
              <button className="notebook-library-save" onClick={saveCurrentNotebook} type="button">
                <Save size={13} />
                <span>{t(locale, activeSavedNotebookId ? 'updateNotebook' : 'saveNotebook')}</span>
              </button>
              <button
                aria-label={t(locale, 'newNotebook')}
                className="notebook-library-new"
                onClick={createResourceNotebook}
                title={t(locale, 'newNotebook')}
                type="button"
              >
                <Plus size={14} />
              </button>
            </div>
            {savedNotebooks.length ? (
              <div className="notebook-library-list">
                {savedNotebooks.map((note) => {
                  const isActive = note.id === activeSavedNotebookId;
                  const isDeletePending = note.id === pendingNotebookDeleteId;
                  return (
                    <div className={`notebook-library-item ${isActive ? 'active' : ''}`} key={note.id}>
                      <button
                        className="notebook-library-open"
                        onClick={() => openResourceNotebook(note.id)}
                        title={t(locale, 'openNotebook')}
                        type="button"
                      >
                        <strong>{note.title}</strong>
                        <small>{formatSavedNotebookTime(note.updatedAt)}</small>
                      </button>
                      <button
                        aria-label={t(locale, isDeletePending ? 'confirmDeleteNotebook' : 'deleteNotebook')}
                        className={`notebook-library-delete ${isDeletePending ? 'confirm' : ''}`}
                        onClick={() => deleteSavedNotebook(note.id)}
                        title={t(locale, isDeletePending ? 'confirmDeleteNotebook' : 'deleteNotebook')}
                        type="button"
                      >
                        {isDeletePending ? <Check size={13} /> : <X size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="notebook-library-empty">{t(locale, 'noSavedNotebooks')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <section className={`notebook-resource-shelf ${activeTab ? 'is-open' : 'is-collapsed'}`}>
        {renderTabs('desktop')}
        {activeTab && renderResourcePanel(activeTab, 'desktop')}
      </section>
    );
  }

  return (
    <section className={`notebook-resource-shelf ${activeTab ? 'is-open' : 'is-collapsed'}`}>
      {!activeTab && renderTabs('mobile-dock')}

      <Sheet
        className={`notebook-resource-sheet-root is-${renderedTab}`}
        dragCloseThreshold={0.48}
        dragVelocityThreshold={650}
        initialSnap={mobileSnapIndex}
        isOpen={Boolean(activeTab)}
        onClose={closeMobileSheet}
        ref={sheetRef}
        snapPoints={MOBILE_RESOURCE_SNAP_POINTS}
        style={{ zIndex: 10000 }}
        tweenConfig={{ ease: 'easeOut', duration: 0.2 }}
      >
        <Sheet.Container
          aria-label={t(locale, 'notebookResources')}
          aria-modal="true"
          className="mobile-resource-sheet-container"
          role="dialog"
        >
          <Sheet.Header
            aria-label={locale === 'ko' ? '바텀 시트 높이 조절' : 'Adjust bottom sheet height'}
            className="mobile-resource-sheet-header"
          >
            <span aria-hidden="true" className="mobile-resource-sheet-static-handle" />
          </Sheet.Header>
          <Sheet.Content
            className="mobile-resource-sheet-content"
            scrollClassName="mobile-resource-sheet-scroller"
          >
            {renderResourcePanel(renderedTab, 'mobile-sheet', 'mobile-resource-sheet-panel')}
          </Sheet.Content>
        </Sheet.Container>
        <MobileResourceSheetFooter>
          {renderTabs('mobile-sheet')}
        </MobileResourceSheetFooter>
        <Sheet.Backdrop
          aria-label={locale === 'ko' ? '바텀 시트 닫기' : 'Close bottom sheet'}
          className="mobile-resource-sheet-backdrop"
          onTap={closeMobileSheet}
        />
      </Sheet>
    </section>
  );
}
