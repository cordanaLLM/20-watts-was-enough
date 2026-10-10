export function parseClaimLedger(text) {
  const matches = [...text.matchAll(/^### (C-\d{3,4})\s*\r?\n([\s\S]*?)(?=^### C-|(?![\s\S]))/gm)];
  return matches.map(match => {
    const id = match[1];
    const body = match[2];
    const statusMatch = body.match(/^- \*\*Status:\*\*\s*([^\s,.;]+)/m);
    const status = statusMatch ? statusMatch[1].toLowerCase() : "unknown";
    const statementMatch = body.match(/^- \*\*(?:Statement|Claim):\*\*\s*([\s\S]*?)(?=^- \*\*|^\s*$)/m);
    let statement = null;
    if (statementMatch) {
      statement = statementMatch[1].replace(/\s+/g, ' ').trim();
    }
    return { id, status, statement, body };
  });
}

export function parsePrincipleRegistry(text) {
  const matches = [...text.matchAll(/^## (P-\d{3})\s*—\s*(.+)(?:\r?\n([\s\S]*?))?(?=^## |(?![\s\S]))/gm)];
  return matches.map(match => {
    const id = match[1];
    const title = match[2].trim();
    const body = match[3] || "";
    
    const rawHeading = `${id} — ${title}`;
    const anchor = rawHeading
      .toLowerCase()
      .replace(/[^\p{L}\p{N} -]/gu, '')
      .replace(/ /g, '-');
      
    const claims = new Set();
    const singleRe = /\[C-(\d{1,4})\]\(claims\.md#c-(\d{1,4})\)/g;
    for (const link of body.matchAll(singleRe)) {
      if (Number(link[1]) === Number(link[2])) {
        claims.add(`C-${String(Number(link[1])).padStart(3, '0')}`);
      }
    }
    
    const rangeRe = /\[C-(\d{1,4})\]\(claims\.md#c-(\d{1,4})\)\s*[–-]\s*\[C-(\d{1,4})\]\(claims\.md#c-(\d{1,4})\)/g;
    for (const link of body.matchAll(rangeRe)) {
      if (Number(link[1]) === Number(link[2]) && Number(link[3]) === Number(link[4])) {
        const start = Number(link[1]);
        const end = Number(link[3]);
        if (start <= end) {
          for (let i = start; i <= end; i++) {
            claims.add(`C-${String(i).padStart(3, '0')}`);
          }
        }
      }
    }
    
    return { id, title, anchor, claims: Array.from(claims).sort() };
  });
}

export function parseCandidateIndex(text) {
  const matches = [...text.matchAll(/^\|\s*(\d{3,4})\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+)\s*\|/gm)];
  return matches.map(m => ({
    id: m[1],
    title: m[2].trim(),
    question: m[4].trim(),
    path: `experiments/candidates/${m[3]}`
  }));
}

export function parseFixtureIndex(text) {
  const matches = [...text.matchAll(/^\|\s*(F-\d{3,4})\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/gm)];
  return matches.map(m => ({
    id: m[1],
    title: m[2].trim(),
    path: `experiments/fixtures/${m[3]}`
  }));
}
