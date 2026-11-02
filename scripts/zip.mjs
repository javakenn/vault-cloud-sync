import { deflateRawSync } from "node:zlib";
// ZIP archive using standard CRC-32, local headers and central directory.
export function zipFiles(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const n = Buffer.from(name),
      data = Buffer.from(content),
      packed = deflateRawSync(data);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(n.length, 26);
    local.push(h, n, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += h.length + n.length + packed.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
