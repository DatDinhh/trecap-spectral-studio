const test = require('node:test');
const assert = require('node:assert/strict');
const { sumBits, contextKey, escapeHTML } = require('./hardware-explorer.js');

test('four-bit carry chains reproduce every pair of unsigned four-bit inputs', () => {
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      const rows = sumBits(a, b, 4);
      let result = 0;
      rows.forEach((row, i) => {
        result |= row.sum << i;
        assert.equal(row.carryIn, i ? rows[i - 1].carryOut : 0);
        assert.equal(row.a + row.b + row.carryIn, row.sum + 2 * row.carryOut);
      });
      assert.equal(result + (rows[3].carryOut << 4), a + b);
    }
  }
});

test('7 plus 5 visibly propagates a carry through three bit positions', () => {
  const rows = sumBits(7, 5, 4);
  assert.deepEqual(rows.map(row => row.sum), [0, 0, 1, 1]);
  assert.deepEqual(rows.map(row => row.carryOut), [1, 1, 1, 0]);
});

test('context cache refreshes when decoded audio arrives or initial preview becomes current', () => {
  const capture = { captureId: 'test-capture', frameIndex: 0, threshold: 25, audioAvailable: false, preview: true };
  assert.notEqual(contextKey(capture), contextKey({ ...capture, audioAvailable: true }));
  assert.notEqual(contextKey(capture), contextKey({ ...capture, preview: false }));
  assert.notEqual(contextKey(capture), contextKey({ ...capture, frameIndex: 1 }));
  assert.notEqual(contextKey(capture), contextKey({ ...capture, captureId: 'new-capture' }));
  assert.notEqual(contextKey(capture), contextKey({ ...capture, threshold: 26 }));
  assert.equal(contextKey(capture), contextKey({ ...capture, position: 0.001 }));
});

test('source text is escaped before being placed in the code panel', () => {
  assert.equal(escapeHTML('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
});
