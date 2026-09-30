import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

const BLOCKED_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
  "insertFromYank",
]);

/**
 * CodeMirror extension that completely disables pasting and drag-dropping text
 * into the editor (Ctrl/Cmd+V, Shift+Insert, right-click paste, middle-click
 * paste, mobile paste, drag & drop). Typing still works normally.
 *
 * `onBlock` is called (throttled) whenever an attempt is blocked — use it to
 * show a toast.
 */
export function noPaste(onBlock?: () => void): Extension {
  let last = 0;
  const notify = () => {
    const now = Date.now();
    if (now - last > 1500) {
      last = now;
      onBlock?.();
    }
  };
  const block = (e: Event) => {
    e.preventDefault();
    notify();
    return true;
  };
  return EditorView.domEventHandlers({
    paste: block,
    drop: block,
    dragover: (e) => {
      e.preventDefault();
      return true;
    },
    beforeinput: (e) => {
      if (BLOCKED_INPUT_TYPES.has((e as InputEvent).inputType)) return block(e);
      return false;
    },
  });
}
