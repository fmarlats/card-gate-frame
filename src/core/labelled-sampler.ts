import type { GateSeed } from "./types.js";
import { encodeUtf8 } from "./utf8.js";

export interface LabelledSampler {
  sampleKeyBytes(seed: GateSeed, label: string, index?: number): Uint8Array;
  sampleUint32(seed: GateSeed, label: string, index?: number): number;
  sampleScalar(seed: GateSeed, label: string, index?: number): number;
  sampleIndex(seed: GateSeed, label: string, count: number, index?: number): number;
}

export function createLabelledSampler(version: 2 | 3): LabelledSampler {
  const UINT32_RANGE = 4_294_967_296;
  const SAMPLE_DOMAIN = `gate-frame/v${version}/sample\0`;
  const LABEL_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;

  const pushUint32Le = (bytes: number[], value: number): void => {
    bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24);
  };

  function sampleKeyBytes(seed: GateSeed, label: string, index?: number): Uint8Array {
    if (typeof seed === "number" && !Number.isFinite(seed)) {
      throw new TypeError("Sample seed numbers must be finite");
    }
    if (typeof seed !== "string" && typeof seed !== "number") {
      throw new TypeError("Sample seeds must be strings or finite numbers");
    }
    if (!LABEL_PATTERN.test(label)) {
      throw new TypeError(`Sample labels must use the generation-v${version} labelled domain`);
    }
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff)) {
      throw new RangeError("Sample indices must be unsigned 32-bit integers");
    }

    const normalizedSeed = typeof seed === "number" && Object.is(seed, -0) ? 0 : seed;
    const seedBytes = encodeUtf8(String(normalizedSeed));
    const labelBytes = encodeUtf8(label);
    const bytes = Array.from(encodeUtf8(SAMPLE_DOMAIN));
    bytes.push(typeof normalizedSeed === "number" ? 0x6e : 0x73);
    pushUint32Le(bytes, seedBytes.length);
    bytes.push(...seedBytes);
    pushUint32Le(bytes, labelBytes.length);
    bytes.push(...labelBytes);
    bytes.push(index === undefined ? 0 : 1);
    if (index !== undefined) {
      pushUint32Le(bytes, index);
    }
    return Uint8Array.from(bytes);
  }

  function sampleUint32(seed: GateSeed, label: string, index?: number): number {
    let hash = 0x811c9dc5;
    for (const byte of sampleKeyBytes(seed, label, index)) {
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  function sampleScalar(seed: GateSeed, label: string, index?: number): number {
    return sampleUint32(seed, label, index) / UINT32_RANGE;
  }

  function sampleIndex(seed: GateSeed, label: string, count: number, index?: number): number {
    if (!Number.isInteger(count) || count < 1 || count > 65_536) {
      throw new RangeError("Sample counts must be integers from 1 through 65536");
    }
    return Math.floor((sampleUint32(seed, label, index) * count) / UINT32_RANGE);
  }

  return { sampleKeyBytes, sampleUint32, sampleScalar, sampleIndex };
}
