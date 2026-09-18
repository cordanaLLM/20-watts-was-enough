import { spawnSync } from "node:child_process";

// Git documents the literal `/dev/null` as the value that skips a configuration
// level, and Git for Windows maps that literal to the NUL device itself. The
// platform spelling from `os.devNull` (`\\.\nul` on Windows) is not a path Git
// can open: `git init` then fails with "unable to access '\\.\nul'".
const gitConfigNone = "/dev/null";

const gitEnvironment = Object.freeze({
  GIT_AUTHOR_DATE: "2026-09-05T00:00:00Z",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_NAME: "Translation fixture",
  GIT_COMMITTER_DATE: "2026-09-05T00:00:00Z",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Translation fixture",
  GIT_CONFIG_GLOBAL: gitConfigNone,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  LANG: "C",
  LC_ALL: "C",
  PATH: process.env.PATH ?? "",
});

function fixtureFailureDetail(result) {
  if (result.error) {
    return result.error.message ?? "";
  }
  const stderr = (result.stderr ?? "").trim();
  return stderr === "" ? (result.stdout ?? "").trim() : stderr;
}

export function runFixtureGit(root, arguments_, input = undefined) {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8",
    env: gitEnvironment,
    input,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error || result.signal !== null || result.status !== 0) {
    const detail = fixtureFailureDetail(result);
    throw new Error(
      `Fixture Git command failed: git ${arguments_.join(" ")}${detail === "" ? "" : `: ${detail}`}`,
    );
  }
  return result.stdout.trim();
}

export function initialiseFixtureGitRepository(root, paths) {
  runFixtureGit(root, ["init", "--quiet"]);
  return commitFixturePaths(root, paths, "reviewed source fixture");
}

export function commitFixturePaths(root, paths, message = "publication fixture") {
  runFixtureGit(root, ["add", "--", ...paths]);
  runFixtureGit(root, ["commit", "--quiet", "-m", message]);
  return runFixtureGit(root, ["rev-parse", "HEAD"]);
}

export function createUnrelatedFixtureCommit(root) {
  const tree = runFixtureGit(root, ["write-tree"]);
  return runFixtureGit(root, ["commit-tree", tree, "-m", "unrelated source fixture"]);
}
