function firstNonEmpty(values: Array<string | undefined | null>) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return null;
}

export function getCommitSha() {
  return firstNonEmpty([
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_SHA,
    process.env.COMMIT_SHA
  ]);
}

export function getOpsStatusSnapshot({ now = new Date() }: any = {}) {
  return {
    now: now.toISOString(),
    env: process.env.NODE_ENV || null,
    commit_sha: getCommitSha()
  };
}

