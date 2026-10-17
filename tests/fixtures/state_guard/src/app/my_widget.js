/** A stand-in for an application module under src/app/ (BUG-0005's steps to reproduce). */
import { writeBar } from '../../lib/widget_lib.js';

export function setFoo(el) {
    el.setAttribute('data-foo', 'x');
}

export function removeFoo(el) {
    el.removeAttribute('data-foo');
}

export function setFooDataset(el) {
    el.dataset.foo = 'x';
}

export function deleteFooDataset(el) {
    delete el.dataset.foo;
}

export function setBarThroughLibrary(el) {
    writeBar(el);
}
