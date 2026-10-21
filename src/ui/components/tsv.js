/**
 * tsv.js — STORY-0085 (writing), STORY-0090 (reading). Tab-separated text,
 * the format Excel and Google Sheets put on the clipboard as `text/plain` and
 * read back from it. DataTable's cell mode copies a range with `toTSV` and
 * pastes a block read with `fromTSV`.
 *
 * QUOTING. Excel quotes a cell that holds a tab, a newline (LF or CR) or a
 * double quote, and doubles every quote inside it: `say "hi"` is written
 * `"say ""hi"""`. Any other cell is written as it is, so a plain grid stays
 * plain text. A writer that does not quote turns a cell holding a tab into two
 * cells, and every column after it lands one to the right when pasted.
 *
 * LINES. Rows are joined with `\n` and there is no newline after the last
 * row: one cell copied is that cell's text alone.
 *
 * READING. Character by character, never by splitting: a quoted cell may hold
 * tabs and newlines, and a split that cannot know it shifts every column after
 * such a cell into the wrong place, silently. A quote opens a quoted cell only
 * at the start of a cell; inside one a doubled quote is a quote. A CR outside
 * a quoted cell is dropped, so CRLF lines read as LF ones. Excel ends its text
 * with a newline: the empty line that leaves (and any further empty lines at
 * the end) is dropped, so a paste never carries a row nobody copied.
 */

/** One cell's text: `null` and `undefined` are empty, anything else is
 *  `String(value)`, quoted the way Excel quotes it when it has to be. */
export function tsvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[\t\n\r"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

/** A matrix (an array of rows, each an array of cells) as TSV. */
export function toTSV(matrix) {
    if (!Array.isArray(matrix)) return '';
    return matrix
        .map((row) => (Array.isArray(row) ? row : [row]).map(tsvCell).join('\t'))
        .join('\n');
}

/**
 * Tab-separated text as a matrix of strings, one array per line. Empty text
 * is `[]`; a line with no tab is one cell; empty cells are kept (`'a\t\tb'`
 * is three cells). Lines may differ in length: each is as long as it is.
 */
export function fromTSV(text) {
    if (text === null || text === undefined || text === '') return [];
    const src = String(text);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\r') { /* CRLF reads as LF */ }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    row.push(cell);
    rows.push(row);
    // Excel's closing newline leaves an empty line behind: it is no row.
    while (rows.length > 1) {
        const last = rows[rows.length - 1];
        if (last.length === 1 && last[0] === '') rows.pop();
        else break;
    }
    return rows;
}
