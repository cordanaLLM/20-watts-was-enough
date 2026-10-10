import test from 'node:test';
import assert from 'node:assert';
import {
  parseClaimLedger,
  parsePrincipleRegistry,
  parseCandidateIndex,
  parseFixtureIndex
} from './research-ledger.mjs';

test('parseClaimLedger', () => {
  const text = `
### C-001
- **Status:** Established
- **Statement:** Line one.
Line two.

- **Another field:** ...

### C-002
- **Statement:** Only statement.
`;
  const claims = parseClaimLedger(text);
  assert.strictEqual(claims.length, 2);
  
  assert.strictEqual(claims[0].id, 'C-001');
  assert.strictEqual(claims[0].status, 'established');
  assert.strictEqual(claims[0].statement, 'Line one. Line two.');
  assert.ok(claims[0].body.includes('Line one'));
  
  assert.strictEqual(claims[1].id, 'C-002');
  assert.strictEqual(claims[1].status, 'unknown');
  assert.strictEqual(claims[1].statement, 'Only statement.');
});

test('parsePrincipleRegistry', () => {
  const text = `
## P-001 — Selective allocation
Some text [C-1](claims.md#c-1).
Range expansion [C-2](claims.md#c-2) - [C-4](claims.md#c-4).
Anchor/label mismatch [C-5](claims.md#c-6).
Reversed range [C-8](claims.md#c-8) - [C-7](claims.md#c-7).
Mismatch range [C-9](claims.md#c-9) - [C-10](claims.md#c-11).
`;
  const principles = parsePrincipleRegistry(text);
  assert.strictEqual(principles.length, 1);
  
  assert.strictEqual(principles[0].id, 'P-001');
  assert.strictEqual(principles[0].title, 'Selective allocation');
  assert.strictEqual(principles[0].anchor, 'p-001--selective-allocation');
  
  assert.deepStrictEqual(principles[0].claims, ['C-001', 'C-002', 'C-003', 'C-004', 'C-007', 'C-008', 'C-009']);
});

test('parseCandidateIndex', () => {
  const text = `
| 001 | [First](001-first.md) | Q1 |
| 002 | [Second](002-second.md) | Q2 |
`;
  const candidates = parseCandidateIndex(text);
  assert.strictEqual(candidates.length, 2);
  assert.strictEqual(candidates[0].id, '001');
  assert.strictEqual(candidates[0].title, 'First');
  assert.strictEqual(candidates[0].question, 'Q1');
  assert.strictEqual(candidates[0].path, 'experiments/candidates/001-first.md');
});

test('parseFixtureIndex', () => {
  const text = `
| F-001 | [First](f001.md) | desc |
`;
  const fixtures = parseFixtureIndex(text);
  assert.strictEqual(fixtures.length, 1);
  assert.strictEqual(fixtures[0].id, 'F-001');
  assert.strictEqual(fixtures[0].title, 'First');
  assert.strictEqual(fixtures[0].path, 'experiments/fixtures/f001.md');
});

test('parseClaimLedger reads a Claim field as the statement', () => {
  const text = '### C-1526\n\n- **Claim:** A projected\n  evolution keeps a history term.\n- **Status:** established as an identity.\n';
  const [claim] = parseClaimLedger(text);
  assert.strictEqual(claim.statement, 'A projected evolution keeps a history term.');
  assert.strictEqual(claim.status, 'established');
});

test('parseClaimLedger leaves an Evidence status field as unknown', () => {
  const text = '### C-1377\n\n- **Statement:** Amount and species are distinct.\n- **Evidence status:** established boundary.\n';
  assert.strictEqual(parseClaimLedger(text)[0].status, 'unknown');
});

test('parsePrincipleRegistry keeps non-ASCII letters in the anchor', () => {
  const text = '## P-014 — Café régime\n\nBody.\n';
  assert.strictEqual(parsePrincipleRegistry(text)[0].anchor, 'p-014--café-régime');
});
