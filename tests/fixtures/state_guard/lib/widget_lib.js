/** A stand-in for a library module (a FlexDesk widget, a dist chunk) that writes attributes for its caller. */
export function writeBar(el) {
    el.setAttribute('data-bar', 'x');
}
