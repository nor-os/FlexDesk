/**
 * C25. WHERE A DIALOG OR A FLOATING PANEL OPENS, when the application spans more
 * than one window.
 *
 * Every modal is a `ManagedWindow` with no `container`, so it mounts into
 * `document.body` — and "document" is the document the MODULE was loaded in. A
 * consumer that opens a second browser window with `window.open` and builds its
 * DOM from the opener's realm (which is how a pop-out grid works: same modules,
 * same JS context, a different document) therefore gets its dialogs in the
 * window it popped OUT of. The user presses "Add column" on their second monitor
 * and a dialog appears on the first, behind whatever is there.
 *
 * Passing a container at each call site was the other option and it is worse:
 * twenty-one of them across eleven files, every one of which would have to be
 * given a document it has no other reason to know about, and any one missed is
 * this bug again with no way to see it from here.
 *
 * So the HOST is ambient and the consumer sets it when its focus moves. Null —
 * every consumer today — means `document.body`, exactly as before.
 *
 * A module of its own because modals and the anchored layers both ask it, and
 * `openForm` draws its combobox on an anchored layer. `modal.js` re-exports both
 * names: that is where they are public.
 */
let host = null;
export function setModalHost(el) { host = el || null; }
export function modalHost() { return host; }
