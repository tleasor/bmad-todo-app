const UUID_V7_SEQUENCE_MAX = 0xfff;
const UUID_V7_RANDOM_BYTE_COUNT = 8;
const UUID_VARIANT_BASE = 0x8;
const UUID_VARIANT_MASK = 0x3;

let lastTimestampMs = 0;
let sequence = 0;

const hex = (value: number, length: number): string => value.toString(16).padStart(length, "0");

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => hex(byte, 2)).join("");

export const createUuidV7 = (): string => {
  const now = Date.now();
  let timestampMs = now;

  if (now > lastTimestampMs) {
    lastTimestampMs = now;
    sequence = 0;
  } else {
    sequence += 1;
    if (sequence > UUID_V7_SEQUENCE_MAX) {
      lastTimestampMs += 1;
      sequence = 0;
    }
    timestampMs = lastTimestampMs;
  }

  const random = new Uint8Array(UUID_V7_RANDOM_BYTE_COUNT);
  crypto.getRandomValues(random);

  const timestampHex = hex(timestampMs, 12);
  const sequenceHex = hex(sequence, 3);
  const variant = (UUID_VARIANT_BASE + (random[0] & UUID_VARIANT_MASK)).toString(16);
  const tail = bytesToHex(random).slice(0, 15);

  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8)}-7${sequenceHex}-${variant}${tail.slice(0, 3)}-${tail.slice(3)}`;
};

export const __resetUuidV7ForTests = (): void => {
  lastTimestampMs = 0;
  sequence = 0;
};
