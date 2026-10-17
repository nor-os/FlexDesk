/**
 * file_picker.js — let the user choose a file to open, and read it.
 *
 * A native window (pywebview, Photino) offers a real open dialog through the
 * optional `host.dialogs.openFile` capability; a browser tab has none. pickFile()
 * asks the host first and, when the host has no `openFile` or answers null
 * ("no dialog behind it", per host.js), opens the browser's own file chooser
 * through a transient `<input type="file">`. The caller gets ONE result shape
 * either way:
 *
 *   {ok: true, name, path?, text}       encoding 'text' (the default)
 *   {ok: true, name, path?, data}       encoding 'base64': the file's bytes, base64
 *   {ok: false, cancelled: true}        the user closed the chooser: say nothing
 *   {ok: false, error}                  show it to the user
 *
 * `path` comes only from a native host; a browser never reveals one.
 */

const ENCODINGS = new Set(['text', 'base64']);

/** `accept` as the `<input accept>` attribute wants it: comma-separated. */
function acceptAttr(accept) {
    if (Array.isArray(accept)) return accept.map(String).filter(Boolean).join(',');
    return accept ? String(accept) : '';
}

/** Read `file` as text or as base64, with the FileReader of the file's own window. */
function readFile(file, encoding, FileReaderCtor) {
    return new Promise((resolve) => {
        const reader = new FileReaderCtor();
        reader.onload = () => {
            const name = file.name;
            if (encoding === 'base64') {
                const url = String(reader.result ?? '');
                resolve({ ok: true, name, data: url.slice(url.indexOf(',') + 1) });
            } else {
                resolve({ ok: true, name, text: String(reader.result ?? '') });
            }
        };
        reader.onerror = () => resolve({ ok: false, error: String(reader.error?.message || reader.error || 'The file could not be read.') });
        if (encoding === 'base64') reader.readAsDataURL(file);
        else reader.readAsText(file);
    });
}

/**
 * The browser's file chooser: a hidden `<input type="file">`, clicked, removed
 * again once it answers. Cancelling is the input's `cancel` event (every
 * current engine fires it; an engine that does not leaves the promise pending
 * until the user does choose a file).
 */
function browserChooser({ accept, encoding, doc }) {
    const FileReaderCtor = doc?.defaultView?.FileReader ?? globalThis.FileReader;
    if (!doc?.body || typeof FileReaderCtor !== 'function') {
        return Promise.resolve({ ok: false, error: 'No file chooser is available here.' });
    }
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        const a = acceptAttr(accept);
        if (a) input.accept = a;
        input.style.display = 'none';
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            input.removeEventListener('change', onChange);
            input.removeEventListener('cancel', onCancel);
            input.remove();
            resolve(result);
        };
        const onChange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish({ ok: false, cancelled: true }); return; }
            readFile(file, encoding, FileReaderCtor).then(finish);
        };
        const onCancel = () => finish({ ok: false, cancelled: true });
        input.addEventListener('change', onChange);
        input.addEventListener('cancel', onCancel);
        doc.body.appendChild(input);
        input.click();
    });
}

/**
 * Let the user choose one file and read it.
 *
 * @param {object} host  a Host; its optional `dialogs.openFile` is asked first
 * @param {object} [opts]
 * @param {string[]|string} [opts.accept]  extensions or MIME types, e.g. ['.json', '.csv']
 * @param {string|null} [opts.kind]        a label for the native dialog's filter (e.g. 'json')
 * @param {'text'|'base64'} [opts.encoding='text']  text, or the bytes as base64
 * @param {Document} [opts.document]       where the browser chooser goes (default: the page's)
 * @returns {Promise<{ok: true, name: string, path?: string, text?: string, data?: string}
 *                   | {ok: false, cancelled: true} | {ok: false, error: string}>}
 */
export async function pickFile(host, { accept = [], kind = null, encoding = 'text', document: doc } = {}) {
    if (!ENCODINGS.has(encoding)) throw new TypeError(`pickFile: unknown encoding '${encoding}' (use 'text' or 'base64')`);
    const openFile = host?.dialogs?.openFile;
    if (typeof openFile === 'function') {
        let r = null;
        try { r = await openFile({ accept: Array.isArray(accept) ? accept : (accept ? [String(accept)] : []), kind, encoding }); }
        catch { r = null; }                               // a failing host degrades like an absent one
        if (r && typeof r === 'object') return r;
    }
    return browserChooser({ accept, encoding, doc: doc ?? (typeof document !== 'undefined' ? document : null) });
}
