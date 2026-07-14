/**
 * toast.js — thin wrapper around the global NotificationCenter for
 * callers that don't already hold an eventBus reference.
 *
 * The NotificationCenter (../notification_center.js) subscribes to
 * `toast:show` on the global event bus; we re-export tiny helpers
 * that emit the same payload shape.
 *
 * Usage:
 *   import { toastError, toastSuccess, toastWarn, toastInfo } from './toast.js';
 *   toastError('Save failed', 'sector_update refused: …');
 *
 * The 1-arg form treats the string as the message (no title); the
 * 2-arg form is title + message.
 */

function _bus() {
    return window.__ecoagent?.eventBus ?? null;
}

function _emit(severity, persistent, titleOrMsg, msg) {
    const bus = _bus();
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
