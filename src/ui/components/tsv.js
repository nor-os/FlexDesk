/**
 * tsv.js — STORY-0085. Tab-separated text, the format Excel and Google Sheets
 * put on the clipboard as `text/plain` and read back from it. DataTable's
 * cell mode copies a range with it; paste reads the same format.
 *
 * QUOTING. Excel quotes a cell that holds a tab, a newline (LF or CR) or a
 * double quote, and doubles every quote inside it: `say "hi"` is written
 * `"say ""hi"""`. Any other cell is written as it is, so a plain grid stays
 * plain text. A writer that does not quote turns a cell holding a tab into two
 * cells, and every column after it lands one to the right when pasted.
 *
 * LINES. Rows are joined with `\n` and there is no newline after the last
 * row: one cell copied is that cell's text alone.
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
