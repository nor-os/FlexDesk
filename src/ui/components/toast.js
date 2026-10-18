/**
 * toast.js — thin wrapper around the mounted NotificationCenter for
 * callers that don't already hold an eventBus reference.
 *
 * The NotificationCenter (../notification_center.js) subscribes to
 * `toast:show` on its event bus; these helpers emit the same payload shape
 * on the bus they were given. They read no global: `NotificationCenter.mount()`
 * hands its bus to `setToastBus()`, and `dispose()` takes it back. An embedder
 * that wants toasts on some other bus calls `setToastBus(bus)` itself, and
 * `setToastBus(null)` to stop.
 *
 * Usage:
 *   import { toastError, toastSuccess, toastWarn, toastInfo } from './toast.js';
 *   toastError('Save failed', 'the server refused the change');
 *
 * The 1-arg form treats the string as the message (no title); the
 * 2-arg form is title + message. With no bus (no NotificationCenter mounted
 * yet, isolated test pages) the message goes to the console and nothing throws.
 */

let toastBus = null;

/**
 * Route the toast helpers to `bus` (anything with `emit(name, payload)`), or
 * to the console with `null`. Returns the bus that was set before.
 */
export function setToastBus(bus) {
    const prev = toastBus;
    toastBus = bus && typeof bus.emit === 'function' ? bus : null;
    return prev;
}

/** The bus the toast helpers currently emit on, or null. */
export function getToastBus() {
    return toastBus;
}

function _emit(severity, persistent, titleOrMsg, msg) {
    const bus = toastBus;
    const title = (msg !== undefined) ? titleOrMsg : null;
    const message = (msg !== undefined) ? msg : titleOrMsg;
    if (!bus) {
        // Fall back to console so the message isn't lost if the bus is
        // unavailable (early bootstrap, isolated test pages).
        // eslint-disable-next-line no-console
        (severity === 'error' || severity === 'warn' ? console.warn : console.info)(
            `[toast/${severity}]`, title ? `${title}:` : '', message);
        return;
    }
    bus.emit('toast:show', {
        title, message, severity,
        persistent,
        durationMs: persistent ? 0 : 5000,
    });
}

export function toastError(titleOrMsg, msg)    { _emit('error',   true,  titleOrMsg, msg); }
export function toastWarn(titleOrMsg, msg)     { _emit('warn',    false, titleOrMsg, msg); }
export function toastInfo(titleOrMsg, msg)     { _emit('info',    false, titleOrMsg, msg); }
export function toastSuccess(titleOrMsg, msg)  { _emit('success', false, titleOrMsg, msg); }

/** Coerce a bridge-call result/exception into a user-facing error toast.
 *  Drops the toast only if `res?.ok === false` *or* an exception was caught.
 *  Returns true if the call succeeded (caller can continue), false otherwise. */
export function reportBridgeError(opName, resOrErr) {
    if (!resOrErr) return true;
    if (resOrErr instanceof Error) {
        toastError(opName, resOrErr.message || String(resOrErr));
        return false;
    }
    if (resOrErr && resOrErr.ok === false) {
        toastError(opName, resOrErr.error || 'operation refused');
        return false;
    }
    return true;
}
