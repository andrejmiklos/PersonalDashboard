// Parsed separately: a syntax error here must not break spike.js.
class Probe {
  constructor(value) {
    this.value = value;
  }
}
const make = (v) => new Probe(v);
let label = `${make(true).value}`;
window.__spikeEs2015 = label === 'true';
