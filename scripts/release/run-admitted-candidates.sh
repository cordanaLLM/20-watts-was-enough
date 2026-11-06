#!/usr/bin/env bash
set -euo pipefail
tooling="ghcr.io/${IMAGE_REPOSITORY}-20w@${TOOLING_DIGEST}"
fixture_007="ghcr.io/${IMAGE_REPOSITORY}-fixture-007@${FIXTURE_007_DIGEST}"
fixture_019="ghcr.io/${IMAGE_REPOSITORY}-fixture-019@${FIXTURE_019_DIGEST}"
docker pull "$tooling"
docker pull "$fixture_007"
docker pull "$fixture_019"
tooling_identity="$(docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  "$tooling" version --json)"
expected_tooling_identity="$(printf '{"version":"%s","revision":"%s","built_at":"%s","go_version":"go1.27.3","os":"linux","architecture":"amd64"}' \
  "$RELEASE_TAG" "$RELEASE_COMMIT" "$RELEASE_TIMESTAMP")"
if [[ "$tooling_identity" != "$expected_tooling_identity" ]]; then
  echo "::error::admitted 20w binary identity does not match the tag, commit, timestamp, Go version, OS, and architecture"
  printf 'actual:   %s\nexpected: %s\n' "$tooling_identity" "$expected_tooling_identity"
  exit 1
fi
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$GITHUB_WORKSPACE,dst=/repo,readonly" \
  "$tooling" validate docs --root /repo
fixture_007_node="$(docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --entrypoint node "$fixture_007" --version)"
if [[ "$fixture_007_node" != "v26.12.0" ]]; then
  echo "::error::admitted Fixture 007 Node.js runtime is $fixture_007_node, want v26.12.0"
  exit 1
fi
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --entrypoint sh "$fixture_019" -c \
  'test "$(node --version)" = "v26.12.0" && test "$(python --version)" = "Python 3.15.0" && python -c "import numpy; assert numpy.__version__ == \"2.5.4\""'
volume_007="20w-release-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-007"
volume_019="20w-release-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-019"
docker volume create "$volume_007"
docker volume create "$volume_019"
cleanup() {
  docker volume rm "$volume_007" "$volume_019" >/dev/null
}
trap cleanup EXIT
for action in smoke analyze validate; do
  if [[ "$action" == "smoke" ]]; then
    arguments=(smoke --profile smoke --output /workspace/results/smoke)
  else
    arguments=("$action" --output /workspace/results/smoke)
  fi
  docker run --rm --pull never --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges \
    --env "EXPERIMENT_IMAGE_DIGEST=$FIXTURE_007_DIGEST" \
    --mount "type=volume,src=$volume_007,dst=/results" \
    "$fixture_007" "${arguments[@]}"
done
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$FIXTURE_019_DIGEST" \
  --mount "type=volume,src=$volume_019,dst=/workspace/results" \
  "$fixture_019" smoke --profile smoke --output /workspace/results/smoke --resume false
for action in analyze validate; do
  docker run --rm --pull never --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges \
    --env "EXPERIMENT_IMAGE_DIGEST=$FIXTURE_019_DIGEST" \
    --mount "type=volume,src=$volume_019,dst=/workspace/results" \
    "$fixture_019" "$action" --output /workspace/results/smoke
done
