interface Utf8Encoder {
  encode(value: string): Uint8Array;
}

type Utf8EncoderConstructor = new () => Utf8Encoder;

const Encoder = (globalThis as unknown as { readonly TextEncoder: Utf8EncoderConstructor })
  .TextEncoder;
const encoder = new Encoder();

export const encodeUtf8 = (value: string): Uint8Array => encoder.encode(value);
