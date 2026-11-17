export interface ValuationImportRow {
  assetId: string;
  date: string;
  price: string;
  source: string;
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') {
        if (
          quoted &&
          i + 1 < text.length &&
          ![',', '\r', '\n'].includes(text[i + 1])
        )
          throw new Error('CSV引号后只能是分隔符或换行');
        quoted = !quoted;
      } else throw new Error('CSV引号格式无效');
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV引号未闭合');
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}
export function parseValuationCsv(text: string): ValuationImportRow[] {
  const rows = parseCsv(text);
  if (
    rows.length < 2 ||
    rows.length > 201 ||
    rows[0].join(',') !== 'assetId,date,price,source'
  )
    throw new Error('CSV须包含assetId,date,price,source表头及1至200行');
  return rows.slice(1).map((r, i) => {
    if (
      r.length !== 4 ||
      !/^\d{1,10}(\.\d{1,8})?$/.test(r[2]) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r[1]) ||
      !r[0].trim() ||
      !r[3].trim()
    )
      throw new Error(`第${i + 2}行格式无效`);
    return { assetId: r[0].trim(), date: r[1], price: r[2], source: r[3] };
  });
}
