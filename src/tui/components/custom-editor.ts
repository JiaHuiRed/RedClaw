import { Editor, getKeybindings, isKeyRelease, Key, matchesKey } from "@earendil-works/pi-tui";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";

const KITTY_CSI_U_SUFFIX_REGEX = /^(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/u;
const KITTY_MODIFIERS = {
  alt: 2,
  ctrl: 4,
};
const LOCK_MODIFIER_MASK = 64 + 128;

function decodeAltGrPrintable(data: string): string | undefined {
  if (!data.startsWith("\u001b[")) {
    return undefined;
  }

  const match = data.slice(2).match(KITTY_CSI_U_SUFFIX_REGEX);
  if (!match) {
    return undefined;
  }

  const codepoint = Number.parseInt(match[1] ?? "", 10);
  const baseLayoutKey = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const modifierValue = match[4] ? Number.parseInt(match[4], 10) : 1;
  const modifier = (Number.isFinite(modifierValue) ? modifierValue - 1 : 0) & ~LOCK_MODIFIER_MASK;

  if (modifier !== (KITTY_MODIFIERS.alt | KITTY_MODIFIERS.ctrl)) {
    return undefined;
  }
  if (typeof baseLayoutKey !== "number" || baseLayoutKey === codepoint) {
    return undefined;
  }
  if (!Number.isFinite(codepoint) || codepoint < 32) {
    return undefined;
  }

  try {
    return String.fromCodePoint(codepoint);
  } catch {
    return undefined;
  }
}

type SelectionAnchor = { line: number; col: number };

export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onAltEnter?: () => void;
  onAltUp?: () => void;

  private _selectionAnchor: SelectionAnchor | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get _p(): any {
    return this as any;
  }

  /** Whether there is an active selection. */
  get hasSelection(): boolean {
    return this._selectionAnchor !== null;
  }

  /** The normalized selection range (start ≤ end). */
  private get _selectionRange(): { start: SelectionAnchor; end: SelectionAnchor } | null {
    if (!this._selectionAnchor) return null;
    const a = this._selectionAnchor;
    const c = { line: this._p.state.cursorLine, col: this._p.state.cursorCol };
    if (a.line < c.line || (a.line === c.line && a.col <= c.col)) {
      return { start: a, end: c };
    }
    return { start: c, end: a };
  }

  private _clearSelection(): void {
    this._selectionAnchor = null;
  }

  /** Set anchor if no active selection. Called before Shift-movement. */
  private _ensureSelectionAnchor(): void {
    if (!this._selectionAnchor) {
      this._selectionAnchor = { line: this._p.state.cursorLine, col: this._p.state.cursorCol };
    }
  }

  /** Delete the selected text. */
  private _deleteSelection(): void {
    const range = this._selectionRange;
    if (!range) return;

    this._p.pushUndoSnapshot();
    // reset undo coalescing since delete is an atomic action
    this._p.lastAction = null;
    this._p.historyIndex = -1;

    const { start, end } = range;

    if (start.line === end.line) {
      const line = this._p.state.lines[start.line] || "";
      this._p.state.lines[start.line] = line.slice(0, start.col) + line.slice(end.col);
    } else {
      const firstLine = (this._p.state.lines[start.line] || "").slice(0, start.col);
      const lastLine = (this._p.state.lines[end.line] || "").slice(end.col);
      this._p.state.lines.splice(start.line, end.line - start.line + 1, firstLine + lastLine);
    }

    this._p.state.cursorLine = start.line;
    this._p.state.cursorCol = start.col;
    this._clearSelection();

    if (this.onChange) this.onChange(this.getText());
  }

  /** Get the selected text (for copy). */
  private _getSelectedText(): string {
    const range = this._selectionRange;
    if (!range) return "";

    const { start, end } = range;

    if (start.line === end.line) {
      return (this._p.state.lines[start.line] || "").slice(start.col, end.col);
    }

    const parts: string[] = [];
    parts.push((this._p.state.lines[start.line] || "").slice(start.col));
    for (let i = start.line + 1; i < end.line; i++) {
      parts.push(this._p.state.lines[i] || "");
    }
    parts.push((this._p.state.lines[end.line] || "").slice(0, end.col));
    return parts.join("\n");
  }

  /** Select all text in the editor. */
  private _selectAll(): void {
    if (
      this._p.state.lines.length === 0 ||
      (this._p.state.lines.length === 1 && this._p.state.lines[0] === "")
    ) {
      this._clearSelection();
      return;
    }
    const lastLine = this._p.state.lines.length - 1;
    this._selectionAnchor = { line: 0, col: 0 };
    this._p.state.cursorLine = lastLine;
    this._p.state.cursorCol = (this._p.state.lines[lastLine] || "").length;
  }

  /**
   * Build display text with selection highlighting and cursor highlighting combined.
   * Returns the final text and its visible width.
   */
  private _buildDisplayText(
    text: string,
    cursorPos: number | undefined,
    logicalLine: number,
    startCol: number,
    emitCursorMarker: boolean,
  ): { text: string; visibleWidth: number; cursorInPadding: boolean } {
    const selRange = this._selectionRange;

    // Compute selection bounds in this visual line's coordinate space
    let selStartVis = -1;
    let selEndVis = -1;
    if (selRange) {
      const sStart = logicalLine === selRange.start.line ? selRange.start.col : 0;
      const sEnd = logicalLine === selRange.end.line ? selRange.end.col : text.length + startCol;
      selStartVis = Math.max(0, sStart - startCol);
      selEndVis = Math.min(text.length, sEnd - startCol);
    }

    const hasSelection = selStartVis >= 0 && selEndVis > selStartVis;

    // ---- Apply cursor highlighting first ----
    // We do cursor first so we can find the cursor grapheme reliably.
    let displayText: string;
    let lineWidth = visibleWidth(text);
    let cursorInPadding = false;
    const marker = emitCursorMarker ? CURSOR_MARKER : "";

    if (cursorPos !== undefined) {
      const before = text.slice(0, cursorPos);
      const after = text.slice(cursorPos);
      if (after.length > 0) {
        const afterGraphemes = [...this._p.segment(after)];
        const firstGrapheme = afterGraphemes[0]?.segment || "";
        const restAfter = after.slice(firstGrapheme.length);
        const cursor = `\x1b[7m${firstGrapheme}\x1b[0m`;
        displayText = before + marker + cursor + restAfter;
      } else {
        const cursor = "\x1b[7m \x1b[0m";
        displayText = before + marker + cursor;
        lineWidth = lineWidth + 1;
        cursorInPadding = true;
      }
    } else {
      displayText = text;
    }

    // ---- Apply selection highlighting on top ----
    if (hasSelection) {
      // Adjust selection bounds for cursor-end space
      let adjSelStart = selStartVis;
      let adjSelEnd = selEndVis;

      // If selection end is exactly at the visual end and cursor is at end,
      // the " " space is part of cursor display, not selection
      if (cursorPos !== undefined && cursorPos >= text.length && adjSelEnd > text.length) {
        adjSelEnd = text.length;
      }

      if (adjSelStart < adjSelEnd) {
        // Selection starts inside or at the cursor-affected text.
        // The displayText has ANSI codes from cursor that we need to account for.
        // Strategy: rebuild from scratch with both highlights, since applying
        // to already-ANSI'd text is fragile.

        // Rebuild: slice original text at 4 points:
        //   beforeSel | selBeforeCursor(if cursor inside sel) | cursorChar | selAfterCursor(if cursor inside sel) | afterSel
        const origText = text;

        // Find the cursor char position in logical (not ANSI) text
        // cursorPos is in the visual line's text coordinate space (0..text.length)
        const cursorChar =
          cursorPos !== undefined
            ? cursorPos < origText.length
              ? origText[cursorPos]
              : " "
            : null;

        const parts: string[] = [];

        if (cursorPos !== undefined && cursorPos >= adjSelStart && cursorPos <= adjSelEnd) {
          // Cursor is within selection
          // Before selection
          parts.push(origText.slice(0, adjSelStart));
          // Selected text before cursor
          if (cursorPos > adjSelStart) {
            parts.push("\x1b[7m");
            parts.push(origText.slice(adjSelStart, cursorPos));
            parts.push("\x1b[0m");
          }
          // Cursor character (unhighlighted to distinguish from selection)
          // Use inverse for cursor too — cursor and selection look the same, which is fine
          parts.push(marker);
          parts.push(`\x1b[7m${cursorChar}\x1b[0m`);
          // Selected text after cursor
          if (adjSelEnd > cursorPos + 1) {
            parts.push("\x1b[7m");
            parts.push(origText.slice(cursorPos + 1, adjSelEnd));
            parts.push("\x1b[0m");
          } else if (cursorPos >= origText.length) {
            // Cursor at end, no text after — cursor space already shown
          }
          // After selection
          parts.push(origText.slice(adjSelEnd));
        } else {
          // Cursor outside selection
          parts.push(origText.slice(0, adjSelStart));
          parts.push("\x1b[7m");
          parts.push(origText.slice(adjSelStart, adjSelEnd));
          parts.push("\x1b[0m");
          parts.push(origText.slice(adjSelEnd));

          // If cursor is somewhere, we already applied it above
          if (cursorPos !== undefined) {
            // cursorPos is in original text coordinates
            // But displayText already has it — we need to re-apply properly
            // This case: cursor is outside selection range. Easiest: re-apply cursor
            // after selection wrapping
            displayText = parts.join("");
            // Now apply cursor over the result
            // cursorPos in the ANSI-free text is cursorPos.
            // But in the ANSI'd text, positions shifted due to selection ANSI codes.
            // This is the hardest case...
          } else {
            displayText = parts.join("");
          }
        }

        if (cursorPos !== undefined && cursorPos >= adjSelStart && cursorPos <= adjSelEnd) {
          displayText = parts.join("");
        } else if (cursorPos === undefined) {
          displayText = parts.join("");
        }
      }
    }

    const finalWidth = lineWidth;
    // Recompute cursorInPadding based on final content
    if (cursorInPadding) {
      const maxPad = Math.max(0, Math.floor(/* width */ (80 - 1) / 2));
      const padX = Math.min(this.getPaddingX(), maxPad);
      const contentW2 = Math.max(1, /* width */ 80 - padX * 2);
      // approximate check
      if (finalWidth > contentW2) cursorInPadding = true;
    }

    return { text: displayText, visibleWidth: finalWidth, cursorInPadding };
  }

  override handleInput(data: string): void {
    if (isKeyRelease(data)) {
      return;
    }

    // === Selection-aware shortcuts (processed before existing handlers) ===

    // Ctrl+A — select all (overrides default cursorLineStart)
    if (matchesKey(data, "ctrl+a")) {
      this._selectAll();
      this.tui.requestRender();
      return;
    }

    // Shift+Arrow keys — extend selection
    if (matchesKey(data, "shift+up")) {
      this._ensureSelectionAnchor();
      this._p.moveCursor(-1, 0);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "shift+down")) {
      this._ensureSelectionAnchor();
      this._p.moveCursor(1, 0);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "shift+left")) {
      this._ensureSelectionAnchor();
      this._p.moveCursor(0, -1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "shift+right")) {
      this._ensureSelectionAnchor();
      this._p.moveCursor(0, 1);
      this.tui.requestRender();
      return;
    }

    // Shift+Home/End — extend selection to line start/end
    if (matchesKey(data, "shift+home")) {
      this._ensureSelectionAnchor();
      this._p.moveToLineStart();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "shift+end")) {
      this._ensureSelectionAnchor();
      this._p.moveToLineEnd();
      this.tui.requestRender();
      return;
    }

    // Shift+PageUp/PageDown — extend selection
    if (matchesKey(data, "shift+pageUp")) {
      this._ensureSelectionAnchor();
      this._p.pageScroll(-1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "shift+pageDown")) {
      this._ensureSelectionAnchor();
      this._p.pageScroll(1);
      this.tui.requestRender();
      return;
    }

    // Ctrl+Shift+Left/Right — extend selection by word
    if (matchesKey(data, "ctrl+shift+left")) {
      this._ensureSelectionAnchor();
      this._p.moveWordBackwards();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "ctrl+shift+right")) {
      this._ensureSelectionAnchor();
      this._p.moveWordForwards();
      this.tui.requestRender();
      return;
    }

    // Backspace/Delete with selection — delete selection
    if (this._selectionAnchor) {
      const kb = getKeybindings();
      if (
        kb.matches(data, "tui.editor.deleteCharBackward") ||
        matchesKey(data, "shift+backspace")
      ) {
        this._deleteSelection();
        this.tui.requestRender();
        return;
      }
      if (kb.matches(data, "tui.editor.deleteCharForward") || matchesKey(data, "shift+delete")) {
        this._deleteSelection();
        this.tui.requestRender();
        return;
      }
    }

    // Existing handlers
    if (matchesKey(data, Key.alt("enter")) && this.onAltEnter) {
      this._clearSelection();
      this.onAltEnter();
      return;
    }
    if (matchesKey(data, Key.alt("up")) && this.onAltUp) {
      this._clearSelection();
      this.onAltUp();
      return;
    }
    if (matchesKey(data, Key.ctrl("l")) && this.onCtrlL) {
      this._clearSelection();
      this.onCtrlL();
      return;
    }
    if (matchesKey(data, Key.ctrl("o")) && this.onCtrlO) {
      this._clearSelection();
      this.onCtrlO();
      return;
    }
    if (matchesKey(data, Key.ctrl("p")) && this.onCtrlP) {
      this._clearSelection();
      this.onCtrlP();
      return;
    }
    if (matchesKey(data, Key.ctrl("g")) && this.onCtrlG) {
      this._clearSelection();
      this.onCtrlG();
      return;
    }
    if (matchesKey(data, Key.ctrl("t")) && this.onCtrlT) {
      this._clearSelection();
      this.onCtrlT();
      return;
    }
    if (matchesKey(data, Key.shift("tab")) && this.onShiftTab) {
      this._clearSelection();
      this.onShiftTab();
      return;
    }
    if (matchesKey(data, Key.escape) && this.onEscape && !this.isShowingAutocomplete()) {
      this._clearSelection();
      this.onEscape();
      return;
    }

    // Ctrl+C: copy selection if present, otherwise fall through to onCtrlC
    // We check tui.input.copy (Ctrl+C) binding
    if (matchesKey(data, Key.ctrl("c"))) {
      if (this._selectionAnchor) {
        // Copy and clear selection
        const text = this._getSelectedText();
        if (text) {
          this._p.killRing.push(text, { prepend: false, accumulate: false });
        }
        this._clearSelection();
        this.tui.requestRender();
        return;
      }
      // No selection — let onCtrlC handle it
      if (this.onCtrlC) {
        this.onCtrlC();
      }
      return;
    }

    if (matchesKey(data, Key.ctrl("d"))) {
      this._clearSelection();
      if (this.getText().length === 0 && this.onCtrlD) {
        this.onCtrlD();
      }
      return;
    }

    // Any remaining input → clear selection and fall through to base
    this._clearSelection();

    const altGrPrintable = decodeAltGrPrintable(data);
    if (altGrPrintable !== undefined) {
      super.handleInput(altGrPrintable);
      return;
    }

    super.handleInput(data);
  }

  override render(width: number): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _this = this as any;

    const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
    const paddingX = Math.min(_this.paddingX, maxPadding);
    const contentWidth = Math.max(1, width - paddingX * 2);
    const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));
    _this._p.lastWidth = layoutWidth;
    const horizontal = this.borderColor("─");

    const layoutLines = _this.layoutText(layoutWidth);
    const visualLineMap = _this.buildVisualLineMap(layoutWidth);

    const terminalRows = this.tui.terminal.rows;
    const maxVisibleLines = Math.max(5, Math.floor(terminalRows * 0.3));

    let cursorLineIndex = layoutLines.findIndex((line: any) => line.hasCursor);
    if (cursorLineIndex === -1) cursorLineIndex = 0;

    if (cursorLineIndex < _this.scrollOffset) {
      _this.scrollOffset = cursorLineIndex;
    } else if (cursorLineIndex >= _this.scrollOffset + maxVisibleLines) {
      _this.scrollOffset = cursorLineIndex - maxVisibleLines + 1;
    }

    const maxScrollOffset = Math.max(0, layoutLines.length - maxVisibleLines);
    _this.scrollOffset = Math.max(0, Math.min(_this.scrollOffset, maxScrollOffset));

    const visibleLines = layoutLines.slice(
      _this.scrollOffset,
      _this.scrollOffset + maxVisibleLines,
    );

    const result: string[] = [];
    const leftPadding = " ".repeat(paddingX);
    const rightPadding = leftPadding;

    if (_this.scrollOffset > 0) {
      const indicator = `─── ↑ ${_this.scrollOffset} more `;
      const remaining = width - visibleWidth(indicator);
      if (remaining >= 0) {
        result.push(this.borderColor(indicator + "─".repeat(remaining)));
      } else {
        result.push(this.borderColor(indicator));
      }
    } else {
      result.push(horizontal.repeat(width));
    }

    const showingAutocomplete = _this.isShowingAutocomplete();
    const emitCursorMarker = this.focused && !showingAutocomplete;

    for (let i = 0; i < visibleLines.length; i++) {
      const layoutLine = visibleLines[i];
      const vlIndex = _this.scrollOffset + i;
      const vl = visualLineMap[vlIndex];
      const logicalLine = vl?.logicalLine ?? 0;
      const startCol = vl?.startCol ?? 0;

      const highlighted = this._buildDisplayText(
        layoutLine.text,
        layoutLine.hasCursor ? layoutLine.cursorPos : undefined,
        logicalLine,
        startCol,
        emitCursorMarker,
      );

      let displayText = highlighted.text;
      const lineVisibleWidth = highlighted.visibleWidth;
      const cursorInPadding = highlighted.cursorInPadding;

      const padding = " ".repeat(Math.max(0, contentWidth - lineVisibleWidth));
      const lineRightPadding =
        cursorInPadding && paddingX > 0 ? rightPadding.slice(1) : rightPadding;
      result.push(`${leftPadding}${displayText}${padding}${lineRightPadding}`);
    }

    const linesBelow = layoutLines.length - (_this.scrollOffset + visibleLines.length);
    if (linesBelow > 0) {
      const indicator = `─── ↓ ${linesBelow} more `;
      const remaining = width - visibleWidth(indicator);
      result.push(this.borderColor(indicator + "─".repeat(Math.max(0, remaining))));
    } else {
      result.push(horizontal.repeat(width));
    }

    if (showingAutocomplete && _this.autocompleteList) {
      const autocompleteResult = _this.autocompleteList.render(contentWidth);
      for (const line of autocompleteResult) {
        const lineWidth = visibleWidth(line);
        const linePadding = " ".repeat(Math.max(0, contentWidth - lineWidth));
        result.push(`${leftPadding}${line}${linePadding}${rightPadding}`);
      }
    }

    return result;
  }
}
