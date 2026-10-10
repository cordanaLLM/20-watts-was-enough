import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('generate-mechanism-index --check', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mech-index-test-'));
  
  try {
    const sources = [
      "research/claims.md",
      "research/principle-registry.md",
      "experiments/candidates/README.md",
      "experiments/fixtures/README.md",
      "research/mechanism-index.json"
    ];
    
    for (const file of sources) {
      const dest = path.join(tmpDir, file);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(file, dest);
    }
    
    let { stdout } = await execFileAsync(process.execPath, [
      'scripts/generate-mechanism-index.mjs',
      '--root', tmpDir,
      '--check'
    ]);
    assert.match(stdout, /Verified \d+ claims/);
    
    const indexPath = path.join(tmpDir, "research/mechanism-index.json");
    await fs.rm(indexPath);
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/generate-mechanism-index.mjs', '--root', tmpDir, '--check']),
      (err) => {
        assert.strictEqual(err.code, 1);
        assert.match(err.stderr, /missing generated file research\/mechanism-index.json/);
        return true;
      }
    );
    
    await fs.copyFile("research/mechanism-index.json", indexPath);
    const claimsPath = path.join(tmpDir, "research/claims.md");
    const origClaims = await fs.readFile(claimsPath, 'utf8');
    const staleClaims = origClaims.replace('- **Status:** established', '- **Status:** plausible');
    await fs.writeFile(claimsPath, staleClaims, 'utf8');
    
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/generate-mechanism-index.mjs', '--root', tmpDir, '--check']),
      (err) => {
        assert.strictEqual(err.code, 1);
        assert.match(err.stderr, /generated file is stale: research\/mechanism-index.json/);
        return true;
      }
    );
    
    const invalidClaims = origClaims.replace('- **Status:** established', '- **Status:** maybe');
    await fs.writeFile(claimsPath, invalidClaims, 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/generate-mechanism-index.mjs', '--root', tmpDir, '--check']),
      (err) => {
        assert.strictEqual(err.code, 1);
        assert.match(err.stderr, /Invalid claim status: maybe/);
        return true;
      }
    );
    
    const duplicateClaims = origClaims.replace('### C-002', '### C-001');
    await fs.writeFile(claimsPath, duplicateClaims, 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/generate-mechanism-index.mjs', '--root', tmpDir, '--check']),
      (err) => {
        assert.strictEqual(err.code, 1);
        assert.match(err.stderr, /Duplicate ID: C-001/);
        return true;
      }
    );
    

    await fs.writeFile(claimsPath, 'x'.repeat(8 * 1024 * 1024 + 1), 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/generate-mechanism-index.mjs', '--root', tmpDir, '--check']),
      (err) => {
        assert.strictEqual(err.code, 1);
        assert.match(err.stderr, /8388608-byte limit/);
        return true;
      }
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
