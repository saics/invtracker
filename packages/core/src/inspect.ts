/**
 * Decoder for CS2 inspect certificates — the hex string Steam puts in an item's
 * "Item Certificate" asset property (and in `csgo_econ_action_preview` links).
 *
 * Layout: byte 0 is an XOR key applied to every byte; after unmasking, byte 0 is 0,
 * then a `CEconItemPreviewDataBlock` protobuf, then a 4-byte checksum.
 */

export type InspectSticker = { slot: number | null; id: number; wear: number | null };
export type InspectCharm = { slot: number | null; id: number; pattern: number | null };
export type InspectData = {
  paintWear: number | null;
  paintSeed: number | null;
  stickers: InspectSticker[];
  charms: InspectCharm[];
};

type Field = { no: number; varint?: bigint; fixed32?: number; bytes?: Uint8Array };

function readVarint(b: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (pos >= b.length) throw new Error("Truncated varint");
    const byte = b[pos++]!;
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [result, pos];
    shift += 7n;
  }
}

function readFields(b: Uint8Array): Field[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Field[] = [];
  let pos = 0;
  while (pos < b.length) {
    const [key, next] = readVarint(b, pos);
    pos = next;
    const no = Number(key >> 3n);
    switch (Number(key & 7n)) {
      case 0: {
        const [v, p] = readVarint(b, pos);
        out.push({ no, varint: v });
        pos = p;
        break;
      }
      case 1:
        pos += 8;
        break;
      case 2: {
        const [len, p] = readVarint(b, pos);
        out.push({ no, bytes: b.subarray(p, p + Number(len)) });
        pos = p + Number(len);
        break;
      }
      case 5:
        out.push({ no, fixed32: view.getFloat32(pos, true) });
        pos += 4;
        break;
      default:
        throw new Error("Unsupported wire type");
    }
  }
  return out;
}

const int = (fields: Field[], no: number) => {
  const v = fields.find((f) => f.no === no)?.varint;
  return v == null ? null : Number(BigInt.asIntN(32, v));
};
const float = (fields: Field[], no: number) => fields.find((f) => f.no === no)?.fixed32 ?? null;

/** Reinterprets the uint32 `paintwear` field as the float32 it encodes. */
function bitsToFloat(bits: number) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits >>> 0);
  return view.getFloat32(0);
}

export function decodeInspectCertificate(hex: string): InspectData | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 || hex.length < 12) return null;
  const raw = Uint8Array.from(hex.match(/../g)!, (h) => Number.parseInt(h, 16));
  const key = raw[0]!;
  const bytes = raw.map((x) => x ^ key);
  try {
    const fields = readFields(bytes.subarray(1, bytes.length - 4));
    const wearBits = int(fields, 7);
    return {
      paintWear: wearBits ? bitsToFloat(wearBits) : null,
      paintSeed: int(fields, 8),
      stickers: fields
        .filter((f) => f.no === 12 && f.bytes)
        .map((f) => readFields(f.bytes!))
        .map((s) => ({ slot: int(s, 1), id: int(s, 2) ?? 0, wear: float(s, 3) })),
      charms: fields
        .filter((f) => f.no === 20 && f.bytes)
        .map((f) => readFields(f.bytes!))
        .map((s) => ({ slot: int(s, 1), id: int(s, 2) ?? 0, pattern: int(s, 10) })),
    };
  } catch {
    return null;
  }
}
