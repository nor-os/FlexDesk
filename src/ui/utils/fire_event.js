/**
 * Fire a DOM event on `target`, built by `target`'s own window.
 *
 * `dispatchEvent` takes only an event from the target's realm. A bare
 * `new Event(...)` reads whatever global the running code sees, and that is a
 * different realm from the element's in an iframe, and under jsdom on any Node
 * with a global `Event` of its own: there it throws "parameter 1 is not of type
 * 'Event'" in the middle of whatever fired it.
 *
 * @param {EventTarget & Node} target  an element
 * @param {string} type
 * @param {CustomEventInit} [init]
 */
export function fireEvent(target, type, init) {
    const view = target.ownerDocument.defaultView;
    target.dispatchEvent(new view.CustomEvent(type, init));
}
