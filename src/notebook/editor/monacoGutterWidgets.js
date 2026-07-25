function markColor(mark) {
  if (!mark?.color) return undefined;
  return `#${Number(mark.color).toString(16).padStart(6, '0')}`;
}

function markClassName(mark, activeLineIndex, lineIndex, cuedLineIndex) {
  const lineState = lineIndex <= activeLineIndex ? 'revealed' : 'future';
  const kind = mark?.kind || 'blank';
  const cueState = lineIndex === cuedLineIndex ? 'cued' : '';
  return `notebook-glyph-mark smart-mark ${kind} ${lineState} ${cueState} ${mark?.hidden ? 'hidden' : ''}`;
}

class NotebookGlyphMarkWidget {
  constructor(editor, monaco, lineIndex) {
    this.editor = editor;
    this.monaco = monaco;
    this.lineIndex = lineIndex;
    this.state = null;

    this.domNode = document.createElement('div');
    this.domNode.className = 'notebook-gutter-widget';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.tabIndex = -1;
    this.domNode.appendChild(this.button);

    this.handlePointerDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.editor.focus();
    };
    this.handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.editor.setPosition({ lineNumber: this.lineIndex + 1, column: 1 });
      this.editor.revealLineInCenterIfOutsideViewport(this.lineIndex + 1);
      this.state?.onCueLine?.(this.lineIndex);
      this.editor.focus();
    };
    this.button.addEventListener('pointerdown', this.handlePointerDown);
    this.button.addEventListener('click', this.handleClick);
    editor.addGlyphMarginWidget(this);
  }

  getId() {
    return `flow-math-notebook-gutter-${this.lineIndex}`;
  }

  getDomNode() {
    return this.domNode;
  }

  getPosition() {
    const lineNumber = this.lineIndex + 1;
    return {
      lane: this.monaco.editor.GlyphMarginLane.Center,
      range: new this.monaco.Range(lineNumber, 1, lineNumber, 1),
      zIndex: 100,
    };
  }

  update(state) {
    this.state = state;
    const {
      activeLineIndex,
      cueLabel,
      cuedLineIndex,
      mark,
      matrixTitle,
      playCueLabel,
    } = state;
    const label = String(mark?.label ?? '').trim();
    const isCued = this.lineIndex === cuedLineIndex;
    this.domNode.classList.toggle('unlabeled', !label && !isCued);
    this.button.className = markClassName(mark, activeLineIndex, this.lineIndex, cuedLineIndex);
    this.button.textContent = isCued ? '' : label;
    this.button.setAttribute('aria-label', isCued ? playCueLabel : label ? `${label} ${cueLabel}` : cueLabel);
    this.button.setAttribute('aria-pressed', isCued ? 'true' : 'false');
    this.button.title = isCued
      ? playCueLabel
      : mark?.kind === 'matrix' ? matrixTitle : cueLabel;
    const color = markColor(mark);
    if (color) this.button.style.setProperty('--line-color', color);
    else this.button.style.removeProperty('--line-color');
    this.editor.layoutGlyphMarginWidget(this);
  }

  dispose() {
    this.button.removeEventListener('pointerdown', this.handlePointerDown);
    this.button.removeEventListener('click', this.handleClick);
    this.editor.removeGlyphMarginWidget(this);
    this.domNode.remove();
  }
}

export function createNotebookGutterWidgetController(editor, monaco) {
  const widgets = new Map();

  return {
    sync(state) {
      const wantedLines = new Set();
      const modelLineCount = editor.getModel()?.getLineCount() ?? state.marks.length;
      for (let lineIndex = 0; lineIndex < modelLineCount; lineIndex += 1) {
        const mark = state.marks[lineIndex] ?? null;
        wantedLines.add(lineIndex);
        let widget = widgets.get(lineIndex);
        if (!widget) {
          widget = new NotebookGlyphMarkWidget(editor, monaco, lineIndex);
          widgets.set(lineIndex, widget);
        }
        widget.update({ ...state, mark });
      }

      widgets.forEach((widget, lineIndex) => {
        if (wantedLines.has(lineIndex)) return;
        widget.dispose();
        widgets.delete(lineIndex);
      });
    },

    dispose() {
      widgets.forEach((widget) => widget.dispose());
      widgets.clear();
    },
  };
}
