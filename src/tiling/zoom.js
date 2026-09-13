/**
 * zoom.js — the shell's content zoom: a − / track / + / readout control, and
 * the one place that decides what "zoom the workspace" is allowed to touch.
 *
 * Opt-in, like every shell feature that changes what the user sees: an embedder
 * that passes no `chrome.zoom` element gets no control and no scaling, so no
 * existing consumer changes by upgrading. The control is Excel's — a continuous
 * track with a detent-free middle, buttons either side that move in tens, and a
 * readout that is itself the reset — because that is the shape people already
 * know, and it is the one Tables shipped in its own status bar before this was
 * lifted into the framework.
 *
 * ── WHAT IT SCALES, AND WHAT IT MUST NOT ───────────────────────────────────
 *
 * It scales CONTENT SURFACES and nothing a window is dragged across:
 *
 *     .twm-leaf__body          what a tile's content factory mounted into
 *     .twm-window-content      what a promoted window's content mounted into
 *
 * and it does NOT scale the root, a leaf wrap, tile chrome, tab bars, or a
 * window frame. That line is load-bearing rather than a matter of taste. CSS
 * `zoom` establishes a scaled coordinate space, and FlexDesk's window drag,
 * resize and snap all do arithmetic between the pointer (viewport pixels) and a
 * window's `left`/`top` (the pixels of whatever contains it). A contained window
 * (C21) lives in a LEAF WRAP and is re-parented to the ROOT for the length of a
 * drag (R1); zoom either of those and every drag drifts by the zoom factor, and
 * every C15 snap probe measures a tile in units the pointer is not in. Tile
 * bodies and window content sit BELOW all of that geometry, so scaling them
 * changes the text and none of the maths.
 *
 * ── HOW IT IS APPLIED ─────────────────────────────────────────────────────
 *
 * A CSS variable and a class, both on `root` — the element the embedder handed
 * the shell. Never `document.body`, never a selector the framework did not
 * author (the doctrine at the top of shell.js). Tiles and windows are created
 * and destroyed long after any given change, so anything written element by
 * element would have to be re-applied on every mount; a variable on the root is
 * read by whatever exists at the time.
 *
 * The class is what keeps 100% free of any declaration. A rule that always said
 * `zoom: var(--twm-zoom, 1)` would establish a scaled coordinate space even at
 * 1, so at the default the class comes off and no `zoom` applies anywhere — an
 * unzoomed shell lays out byte-for-byte as it did before this existed.
 *
 * A window an embedder mounts on `document.body` itself is outside the shell's
 * root and therefore outside this: it is not the shell's to scale. Every window
 * the WM promotes under `promoteInPlace` (C21) is inside the root, and so is
 * every window for the duration of a drag.
 *
 * ── `zoom`, NOT `transform: scale()` ──────────────────────────────────────
 *
 * `zoom` reflows: text stays on the pixel grid, and a scroll container still
 * measures the content it is scrolling. A transform would blur the text and
 * leave the layout box at its old size, so a zoomed-in table would overflow a
 * pane that did not know it had grown.
 */

/** The range. Below 50% a data row stops being readable; above 200% a typical
 *  row no longer fits its own columns. */
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;

/** The track's granularity — fine, because a control you have to aim is one
 *  people stop using. */
export const ZOOM_STEP = 5;

/** The BUTTONS' step: Excel's split, where the track is continuous and the − / +
 *  cover ground. Commensurate with ZOOM_STEP by construction, so a button press
 *  always lands on a notch and repeated presses cannot drift. */
export const ZOOM_NUDGE = 10;

/**
 * Where the shell opens, and where a reset returns. Load-bearing: `applyZoom`
 * removes the class at exactly this value, and that is what makes "unzoomed"
 * mean "no declaration at all". Only true while the default IS 100.
 */
export const ZOOM_DEFAULT = 100;

/** The logical key under the host's `state` capability. A per-person display
 *  preference, persisted the same way the desktops are. */
export const ZOOM_STATE_KEY = 'zoom';

/**
 * A number from anywhere — a slider, a stored preference, a caller — as a zoom
 * the shell will accept.
 *
 * `null`, `undefined` and `''` are "no value" and read as the default. They are
 * checked BEFORE the cast because `Number()` turns both `null` and `''` into 0 —
 * a perfectly finite number that would then clamp to the floor, so a host with
 * no saved zoom, or a read that failed, would silently open the shell at 50%.
 *
 * It QUANTISES, which is what makes 100% reachable: the track is stepped, so a
 * stored 97 has to land on a notch rather than sit between two where neither the
 * track nor the buttons can leave it.
 */
export function clampZoom(value) {
    if (value == null || value === '') return ZOOM_DEFAULT;
    const n = Number(value);
    if (!Number.isFinite(n)) return ZOOM_DEFAULT;
    const stepped = Math.round(n / ZOOM_STEP) * ZOOM_STEP;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped));
}

/**
 * Apply one zoom to a shell root. Idempotent. Takes the ELEMENT, never finds it.
 *
 * @param {Element} root     the shell's root
 * @param {number}  percent  already clamped
 */
export function applyZoom(root, percent) {
    if (!root?.style) return;
    root.style.setProperty('--twm-zoom', String(percent / 100));
    root.classList.toggle('twm-zoomed', percent !== ZOOM_DEFAULT);
}

/**
 * Paint the control into the element the embedder handed over, restore the saved
 * zoom, and keep the root in step.
 *
 * @param {Element|null} hostEl       where the control goes; absent → no control
 * @param {object}       opts
 * @param {Element}      opts.root    the shell root the zoom applies to
 * @param {object}      [opts.host]   the host port; its `state` persists the zoom
 * @param {string}      [opts.stateKey]
 * @param {Function}    [opts.onChange] `(percent) => void`, after every change
 * @returns {{el: Element, get: () => number, set: (percent: number) => void,
 *            ready: Promise<number>, dispose: () => void} | null}
 */
export function mountZoomControl(hostEl, { root, host = null, stateKey = ZOOM_STATE_KEY, onChange } = {}) {
    if (!hostEl || !root) return null;

    const doc = hostEl.ownerDocument;
    let current = ZOOM_DEFAULT;
    let disposed = false;

    const el = doc.createElement('div');
    el.className = 'twm-zoom';

    const stepButton = (label, title, delta) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'twm-zoom__step';
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', () => commit(clampZoom(current + delta)));
        return b;
    };

    const slider = doc.createElement('input');
    slider.type = 'range';
    slider.className = 'twm-zoom__slider';
    slider.min = String(ZOOM_MIN);
    slider.max = String(ZOOM_MAX);
    slider.step = String(ZOOM_STEP);
    slider.value = String(ZOOM_DEFAULT);
    slider.title = `Zoom the workspace, ${ZOOM_MIN}–${ZOOM_MAX}% — double-click to reset.`;
    slider.setAttribute('aria-label', 'Zoom the workspace');
    // `input`, NOT `change`: the readout has to follow the thumb while it is
    // being dragged, or the number under the mouse is the number you left.
    slider.addEventListener('input', () => commit(clampZoom(slider.value)));
    // A double-click on the track resets. It arrives after two mousedowns that
    // each set the value and fire `input`, so the honest description is "one real
    // write, then the reset", and a brief jump to wherever you clicked is visible
    // before it snaps back. Excel's track does exactly that. It must not be
    // "fixed" by swallowing `input` — that is the event the drag is made of.
    slider.addEventListener('dblclick', () => commit(ZOOM_DEFAULT));

    // The readout IS the reset, where Excel puts it and where a hand already is.
    // A separate "100%" button would be a fourth control in a bar 20px tall, and a
    // percentage nobody can click answers the question while refusing the obvious
    // next request.
    const readout = doc.createElement('button');
    readout.type = 'button';
    readout.className = 'twm-zoom__value';
    readout.title = `Back to ${ZOOM_DEFAULT}%`;
    readout.addEventListener('click', () => commit(ZOOM_DEFAULT));

    el.append(
        stepButton('−', `Zoom out ${ZOOM_NUDGE}%`, -ZOOM_NUDGE),
        slider,
        stepButton('+', `Zoom in ${ZOOM_NUDGE}%`, ZOOM_NUDGE),
        readout,
    );
    hostEl.appendChild(el);

    /** Paint the control and the root. No persistence — used by the restore,
     *  where writing back what was just read would be a pointless round trip. */
    const paint = (percent) => {
        current = percent;
        slider.value = String(percent);
        readout.textContent = `${percent}%`;
        applyZoom(root, percent);
    };

    // Debounced, because a drag fires `input` per pixel and each one would
    // otherwise be a write through the host. A host without `state` is legal,
    // exactly as it is for the desktops: the control still works, the zoom just
    // does not survive a reload.
    let saveTimer = 0;
    const persist = (percent) => {
        const state = host?.state;
        if (!state) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            Promise.resolve()
                .then(() => state.write(stateKey, percent))
                .catch((err) => console.warn('[zoom] save failed', err));
        }, 400);
    };

    const commit = (percent) => {
        if (disposed || percent === current) return;
        paint(percent);
        persist(percent);
        try { onChange?.(percent); } catch (err) { console.warn('[zoom] onChange threw', err); }
    };

    paint(ZOOM_DEFAULT);

    // Restored after the control is already on screen and usable: a zoom is not
    // worth blocking a first paint on, and a failed read costs the default. The
    // promise is returned so an embedder that DOES want to wait before mounting —
    // to avoid content painting at 100% and then jumping — can.
    const ready = Promise.resolve()
        .then(() => host?.state?.read?.(stateKey))
        .then((saved) => {
            if (!disposed && saved != null) paint(clampZoom(saved));
            return current;
        })
        .catch((err) => {
            console.warn('[zoom] load failed', err);
            return current;
        });

    return {
        el,
        get: () => current,
        set: (percent) => commit(clampZoom(percent)),
        ready,
        dispose: () => {
            disposed = true;
            clearTimeout(saveTimer);
            el.remove();
            applyZoom(root, ZOOM_DEFAULT);
        },
    };
}
