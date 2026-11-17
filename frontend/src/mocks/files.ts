/** Mock 服务端文件工具。生产导入/导出由后端解析与生成。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.length) throw new Error('CSV 引号位置不正确');
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合');
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function makeCsv(rows: string[][]): string {
  return (
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              (/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll(
                '"',
                '""',
              ) +
              '"',
          )
          .join(','),
      )
      .join('\r\n')
  );
}
const encoder = new TextEncoder();
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipStored(
  files: Record<string, string>,
): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [],
    centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = encoder.encode(name),
      data = encoder.encode(text),
      checksum = crc32(data);
    const local = new Uint8Array(30 + n.length + data.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, checksum, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(data, 30 + n.length);
    locals.push(local);
    const central = new Uint8Array(46 + n.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.set(n, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, locals.length, true);
  e.setUint16(10, locals.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const block of [...locals, ...centrals, end]) {
    result.set(block, position);
    position += block.length;
  }
  return result;
}
export async function unzip(data: Uint8Array): Promise<Map<string, string>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Excel 文件不是有效的 XLSX');
  const count = view.getUint16(end + 10, true);
  if (count > 100) throw new Error('Excel 文件内容过多');
  let position = view.getUint32(end + 16, true),
    total = 0;
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (
      position + 46 > data.length ||
      view.getUint32(position, true) !== 0x02014b50
    )
      throw new Error('Excel 目录损坏');
    const flags = view.getUint16(position + 8, true),
      method = view.getUint16(position + 10, true),
      compressed = view.getUint32(position + 20, true),
      size = view.getUint32(position + 24, true),
      nameLength = view.getUint16(position + 28, true),
      extra = view.getUint16(position + 30, true),
      comment = view.getUint16(position + 32, true),
      local = view.getUint32(position + 42, true);
    total += size;
    if (
      flags & 1 ||
      size > 5 * 1024 * 1024 ||
      total > 20 * 1024 * 1024 ||
      local + 30 > data.length
    )
      throw new Error('加密或过大的 Excel 不受支持');
    const name = new TextDecoder().decode(
      data.slice(position + 46, position + 46 + nameLength),
    );
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (start + compressed > data.length) throw new Error('Excel 数据损坏');
    const payload = data.slice(start, start + compressed);
    let bytes: Uint8Array = payload;
    if (method === 8) {
      const stream = new Blob([new Uint8Array(payload).buffer])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const blocks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        length += r.value.length;
        if (length > size || length > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Excel 解压超限');
        }
        blocks.push(r.value);
      }
      bytes = new Uint8Array(length);
      let off = 0;
      for (const b of blocks) {
        bytes.set(b, off);
        off += b.length;
      }
    } else if (method !== 0) throw new Error('Excel 压缩格式不受支持');
    if (
      bytes.length !== size ||
      crc32(bytes) !== view.getUint32(position + 16, true)
    )
      throw new Error('Excel 校验失败');
    if (name.endsWith('.xml') || name.endsWith('.rels'))
      files.set(name, new TextDecoder().decode(bytes));
    position += 46 + nameLength + extra + comment;
  }
  return files;
}
const xml = (s: string) => {
  if (s.includes('<!DOCTYPE')) throw new Error('Excel 不支持外部文档类型');
  const doc = new DOMParser().parseFromString(s, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new Error('Excel XML 损坏');
  return doc;
};
export async function parseXlsx(data: Uint8Array): Promise<string[][]> {
  const files = await unzip(data);
  const shared = files.get('xl/sharedStrings.xml');
  const strings = shared
    ? Array.from(xml(shared).getElementsByTagName('si')).map((si) =>
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent || '')
          .join(''),
      )
    : [];
  const workbook = files.get('xl/workbook.xml');
  if (
    workbook &&
    xml(workbook)
      .getElementsByTagName('workbookPr')[0]
      ?.getAttribute('date1904') === '1'
  )
    throw new Error('请将1904日期系统工作簿另存为 CSV');
  const firstId = workbook
    ? xml(workbook).getElementsByTagName('sheet')[0]?.getAttribute('r:id')
    : undefined;
  const relationships = files.get('xl/_rels/workbook.xml.rels');
  const target =
    relationships && firstId
      ? Array.from(xml(relationships).getElementsByTagName('Relationship'))
          .find((r) => r.getAttribute('Id') === firstId)
          ?.getAttribute('Target')
      : undefined;
  const resolved = target
    ? new URL(target, 'https://xlsx.local/xl/workbook.xml').pathname.slice(1)
    : undefined;
  const sheetName =
    resolved ||
    Array.from(files.keys())
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort()[0];
  if (!sheetName) throw new Error('Excel 未找到工作表');
  const sheet = xml(files.get(sheetName)!);
  const rows: string[][] = [];
  for (const r of Array.from(sheet.getElementsByTagName('row'))) {
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const column = (c.getAttribute('r') || 'A').match(/^[A-Z]+/)?.[0] || 'A';
      let index = 0;
      for (const char of column) index = index * 26 + char.charCodeAt(0) - 64;
      if (index > 100) throw new Error('Excel 列数超限');
      const type = c.getAttribute('t'),
        raw = c.getElementsByTagName('v')[0]?.textContent || '';
      row[index - 1] =
        type === 's'
          ? strings[Number(raw)] || ''
          : type === 'inlineStr'
            ? Array.from(c.getElementsByTagName('t'))
                .map((t) => t.textContent || '')
                .join('')
            : raw;
    }
    if (row.some(Boolean))
      rows.push(Array.from({ length: row.length }, (_, i) => row[i] || ''));
    if (rows.length > 2100) throw new Error('演示导入最多 2000 笔');
  }
  return rows;
}
const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .split('')
    .filter(
      (char) =>
        char.charCodeAt(0) > 31 || [9, 10, 13].includes(char.charCodeAt(0)),
    )
    .join('');
export function makeXlsx(rows: string[][]): Uint8Array<ArrayBuffer> {
  const column = (i: number) => {
    let s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26))
      s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  return zipStored({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="交易" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      rows
        .map(
          (row, i) =>
            `<row r="${i + 1}">${row.map((value, j) => `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join('')}</row>`,
        )
        .join('') +
      '</sheetData></worksheet>',
  });
}
