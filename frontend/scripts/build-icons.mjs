import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
for (const size of [180, 192, 512]) {
  const image = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * (size * 4 + 1) + 1 + x * 4;
      const gx = Math.floor((x / size - 0.3) * 10),
        gy = Math.floor((y / size - 0.27) * 14);
      const glyph = [
        '11110',
        '11011',
        '11011',
        '11110',
        '11000',
        '11000',
        '11000',
      ];
      const mark =
        (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyph[gy][gx] === '1') ||
        (x / size - 0.72) ** 2 + (y / size - 0.69) ** 2 < 0.0016;
      image[p] = mark ? 245 : 69;
      image[p + 1] = mark ? 247 : 100;
      image[p + 2] = mark ? 255 : 237;
      image[p + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(image)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
