import { LabelSeededPcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

export function uniformFromUint64(value, events) {
  const uniform = Number(2n * value + 1n) / 2 ** 65;
  if (uniform < 1) return uniform;
  events.uniform_upper_round += 1;
  return 1 - 2 ** -53;
}

export class IcpRandom {
  constructor(label, events) {
    this.raw = new LabelSeededPcg64Dxsm(label);
    this.events = events;
  }

  uniform() {
    return uniformFromUint64(this.raw.nextUint64(), this.events);
  }

  range(a, b) {
    return a + (b - a) * this.uniform();
  }

  integer(a, b) {
    return Math.min(b, a + Math.floor(this.uniform() * (b - a + 1)));
  }

  logRange(a, b) {
    return Math.exp(Math.log(a) + this.uniform() * (Math.log(b) - Math.log(a)));
  }

  gaussian() {
    const first = this.uniform();
    const second = this.uniform();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  }

  dirichlet(count) {
    const gamma = Array.from({ length: count }, () => -Math.log(this.uniform()) - Math.log(this.uniform()));
    const total = gamma.reduce((sum, value) => sum + value, 0);
    return gamma.map((value) => value / total);
  }
}
