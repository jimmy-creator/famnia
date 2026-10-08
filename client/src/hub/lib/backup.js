/**
 * Admin data backup — EXPORT ONLY. The server assembles the sheets
 * (GET /api/hub/backup reads, never writes); this writes them into one
 * timestamped Excel workbook. Nothing is created, updated or deleted.
 */
import { fetchBackup } from '@/hub/lib/api';
import { downloadWorkbook } from '@/hub/lib/spreadsheet';

/** Turns records into a heading row + value rows, keeping column order stable. */
function toGrid(rows, columns) {
  const keys = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (!rows.length) return [keys.length ? keys : ['No records']];
  return [
    keys,
    ...rows.map((row) =>
      keys.map((key) => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
      }),
    ),
  ];
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Resolves { filename, counts: [{ sheet, rows }] }. */
export async function exportFullBackup() {
  const { sheets } = await fetchBackup();
  const filename = `FEMNIA_Backup_${stamp()}.xlsx`;
  downloadWorkbook(
    filename,
    sheets.map((s) => ({ name: s.name, rows: toGrid(s.rows) })),
  );
  return { filename, counts: sheets.map((s) => ({ sheet: s.name, rows: s.rows.length })) };
}
