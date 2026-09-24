// Parsed separately: a syntax error here must not break spike.js.
async function probe() {
  await null;
}
window.__spikeEs2017 = typeof probe === 'function';
