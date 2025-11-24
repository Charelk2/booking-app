// Lightweight MessagePack decoder (subset sufficient for our API payloads).
// Supports: nil, bool, positive/negative fixint, uint8/16/32, int8/16/32,
// fixmap/map16/map32, fixarray/array16/array32, fixstr/str8/str16/str32,
// float32/float64. Big ints >32 bits are parsed as Number and may lose precision.

const hasTextDecoder = typeof TextDecoder !== 'undefined';
const TD: any = hasTextDecoder ? TextDecoder : require('util').TextDecoder;
const decoder = new TD('utf-8');

export function decodeMsgpack(input: ArrayBuffer | Uint8Array): any {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const readU8 = () => bytes[offset++];
  const read = (): any => {
    const byte = readU8();

    // Positive fixint
    if (byte <= 0x7f) return byte;
    // Fixmap
    if (byte >= 0x80 && byte <= 0x8f) return readMap(byte & 0x0f);
    // Fixarray
    if (byte >= 0x90 && byte <= 0x9f) return readArray(byte & 0x0f);
    // Fixstr
    if (byte >= 0xa0 && byte <= 0xbf) return readStr(byte & 0x1f);

    switch (byte) {
      case 0xc0: return null; // nil
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xca: { const v = view.getFloat32(offset, false); offset += 4; return v; }
      case 0xcb: { const v = view.getFloat64(offset, false); offset += 8; return v; }
      case 0xcc: { const v = view.getUint8(offset); offset += 1; return v; }
      case 0xcd: { const v = view.getUint16(offset, false); offset += 2; return v; }
      case 0xce: { const v = view.getUint32(offset, false); offset += 4; return v; }
      case 0xd0: { const v = view.getInt8(offset); offset += 1; return v; }
      case 0xd1: { const v = view.getInt16(offset, false); offset += 2; return v; }
      case 0xd2: { const v = view.getInt32(offset, false); offset += 4; return v; }
      case 0xd9: { const len = view.getUint8(offset); offset += 1; return readStr(len); }
      case 0xda: { const len = view.getUint16(offset, false); offset += 2; return readStr(len); }
      case 0xdb: { const len = view.getUint32(offset, false); offset += 4; return readStr(len); }
      case 0xdc: { const len = view.getUint16(offset, false); offset += 2; return readArray(len); }
      case 0xdd: { const len = view.getUint32(offset, false); offset += 4; return readArray(len); }
      case 0xde: { const len = view.getUint16(offset, false); offset += 2; return readMap(len); }
      case 0xdf: { const len = view.getUint32(offset, false); offset += 4; return readMap(len); }
      default:
        // Negative fixint (0xe0 - 0xff)
        if (byte >= 0xe0) return byte - 256;
        throw new Error(`Unsupported msgpack byte: 0x${byte.toString(16)}`);
    }
  };

  const readStr = (len: number): string => {
    const end = offset + len;
    const slice = bytes.subarray(offset, end);
    offset = end;
    return decoder.decode(slice);
  };

  const readArray = (len: number): any[] => {
    const arr = new Array(len);
    for (let i = 0; i < len; i += 1) arr[i] = read();
    return arr;
  };

  const readMap = (len: number): Record<string, any> => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < len; i += 1) {
      const k = read();
      obj[String(k)] = read();
    }
    return obj;
  };

  return read();
}
