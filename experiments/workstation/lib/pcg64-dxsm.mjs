import { createHash } from "node:crypto";

const MASK_64 = (1n << 64n) - 1n;
const MASK_128 = (1n << 128n) - 1n;
const MULTIPLIER = 0x2360ed051fc65da44385df649fccf645n;
const DXSM_MULTIPLIER = 0xda942042e4dd58b5n;
const TWO_POW_53 = 9007199254740992;
const TWO_POW_64 = 1n << 64n;

export function littleEndianBigInt(bytes) {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  return value;
}

export class Pcg64Dxsm {
  constructor(literalSeed) {
    const digest = createHash("sha256").update(String(literalSeed), "utf8").digest();
    const initialState = littleEndianBigInt(digest.subarray(0, 16));
    const selector = littleEndianBigInt(digest.subarray(16, 32));
    this.increment = ((selector << 1n) | 1n) & MASK_128;
    this.state = 0n;
    this.advance();
    this.state = (this.state + initialState) & MASK_128;
    this.advance();
  }

  advance() {
    this.state = (this.state * MULTIPLIER + this.increment) & MASK_128;
  }

  nextUint64() {
    const old = this.state;
    this.advance();
    let high = (old >> 64n) & MASK_64;
    const low = (old & MASK_64) | 1n;
    high ^= high >> 32n;
    high = (high * DXSM_MULTIPLIER) & MASK_64;
    high ^= high >> 48n;
    return (high * low) & MASK_64;
  }

  uniform() {
    return Number(this.nextUint64() >> 11n) / TWO_POW_53;
  }

  openUniform() {
    let value = this.uniform();
    while (value === 0) value = this.uniform();
    return value;
  }

  range(minimum, maximum) {
    return minimum + (maximum - minimum) * this.uniform();
  }

  logRange(minimum, maximum) {
    return Math.exp(this.range(Math.log(minimum), Math.log(maximum)));
  }

  gaussian() {
    const radius = Math.sqrt(-2 * Math.log(this.openUniform()));
    const angle = 2 * Math.PI * this.openUniform();
    return radius * Math.cos(angle);
  }

  normal() {
    return this.gaussian();
  }

  integer(minimum, maximum) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
      throw new TypeError("PCG integer bounds must be ordered safe integers.");
    }
    const span = BigInt(maximum - minimum + 1);
    const limit = TWO_POW_64 - (TWO_POW_64 % span);
    let draw;
    do {
      draw = this.nextUint64();
    } while (draw >= limit);
    return minimum + Number(draw % span);
  }

  boundedInteger(bound) {
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > 0x1_0000_0000) {
      throw new TypeError("PCG bound must be an integer in [1, 2^32].");
    }
    const span = BigInt(bound);
    const limit = (1n << 64n) - ((1n << 64n) % span);
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const draw = this.nextUint64();
      if (draw < limit) return Number(draw % span);
    }
    throw new Error("PCG bounded-integer rejection cap exhausted.");
  }
}
