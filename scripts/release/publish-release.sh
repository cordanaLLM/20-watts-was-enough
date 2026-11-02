#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
comparison_root="$(mktemp -d "${RUNNER_TEMP}/20w-release-assets.XXXXXX")"
cleanup() {
  rm -rf -- "$comparison_root"
}
trap cleanup EXIT
expected_inventory="$comparison_root/expected-assets.txt"
remote_inventory="$comparison_root/remote-assets.txt"
tool=build/release-tools/20w
"$tool" release asset-inventory \
  --assets build/release/assets \
  --phase publication > "$expected_inventory"
mapfile -t expected_assets < "$expected_inventory"
assets=()
declare -A remote_by_name=()
for name in "${expected_assets[@]}"; do
  asset="build/release/assets/${name}"
  assets+=("$asset")
done
verify_tag=(
  "$tool" release verify-tag
  --repository "$GITHUB_REPOSITORY"
  --tag "$RELEASE_TAG"
  --commit "$RELEASE_COMMIT"
)

expected_prerelease=false
case "$RELEASE_TAG" in
  *-rc.*) expected_prerelease=true ;;
esac
release_flags=(--prerelease="$expected_prerelease")
if [[ "$expected_prerelease" == "true" ]]; then
  release_flags+=(--latest=false)
fi

load_release_state() {
  local state_row
  local release_presence
  local release_state_tag
  local trailing
  state_row="$(
    "$tool" release state \
      --repository "$GITHUB_REPOSITORY" \
      --tag "$RELEASE_TAG"
  )"
  if [[ "$state_row" == "absent" ]]; then
    release_found=false
    release_id=""
    release_draft=""
    release_prerelease=""
    release_immutable=""
    return 0
  fi
  IFS=$'\t' read -r release_presence release_id release_draft release_prerelease release_immutable release_state_tag trailing \
    <<< "$state_row"
  if [[ "$release_presence" != "present" || -n "${trailing:-}" \
    || "$release_state_tag" != "$RELEASE_TAG" \
    || ! "$release_id" =~ ^[1-9][0-9]*$ \
    || ! "$release_draft" =~ ^(true|false)$ \
    || ! "$release_prerelease" =~ ^(true|false)$ \
    || ! "$release_immutable" =~ ^(true|false)$ ]]; then
    echo "::error::GitHub Release state is malformed"
    exit 1
  fi
  if [[ "$release_prerelease" != "$expected_prerelease" ]]; then
    echo "::error::release prerelease state does not match the tag"
    exit 1
  fi
  release_found=true
}

compare_asset() {
  local name="$1"
  local downloaded="$2"
  local expected="build/release/assets/${name}"
  local expected_sha
  local downloaded_sha
  expected_sha="$(sha256sum "$expected" | awk '{print $1}')"
  downloaded_sha="$(sha256sum "$downloaded" | awk '{print $1}')"
  if [[ "$expected_sha" != "$downloaded_sha" ]] || ! cmp --silent -- "$expected" "$downloaded"; then
    echo "::error::remote release asset differs from the local asset: ${name}"
    exit 1
  fi
}

verify_asset_attestation() {
  local asset="$1"
  gh attestation verify "$asset" \
    --repo "$GITHUB_REPOSITORY" \
    --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/release-build.yml" \
    --source-digest "$RELEASE_COMMIT" \
    --source-ref "refs/tags/$RELEASE_TAG" >/dev/null
}

revalidate_local_assets() {
  local inventory="$comparison_root/local-revalidated.txt"
  "$tool" release asset-inventory \
    --assets build/release/assets \
    --phase publication > "$inventory"
  if ! diff --unified=0 "$expected_inventory" "$inventory"; then
    echo "::error::local release asset authority changed before publication mutation"
    exit 1
  fi
  for asset in "${assets[@]}"; do
    verify_asset_attestation "$asset"
  done
}

load_remote_assets() {
  local download_root="$1"
  "$tool" release fetch-assets \
    --repository "$GITHUB_REPOSITORY" \
    --release-id "$release_id" \
    --expected-assets build/release/assets \
    --phase publication \
    --output "$download_root" > "$remote_inventory"
  mapfile -t remote_assets < "$remote_inventory"
  remote_by_name=()
  for name in "${remote_assets[@]}"; do
    remote_by_name["$name"]=1
    compare_asset "$name" "$download_root/$name"
  done
}

verify_complete_remote_assets() {
  local download_root="$1"
  local verified_inventory="${download_root}.inventory"
  load_remote_assets "$download_root"
  if ! diff --unified=0 "$expected_inventory" "$remote_inventory"; then
    echo "::error::remote release assets do not match the checksum-derived inventory"
    exit 1
  fi
  "$tool" release asset-inventory \
    --assets "$download_root" \
    --phase publication > "$verified_inventory"
  if ! diff --unified=0 "$expected_inventory" "$verified_inventory"; then
    echo "::error::remote release checksum authority changed during verification"
    exit 1
  fi
  for name in "${expected_assets[@]}"; do
    verify_asset_attestation "$download_root/$name"
  done
}

require_draft_state() {
  local expected_id="${1:-$PREFLIGHT_ID}"
  load_release_state
  if [[ "$release_found" != "true" || "$release_id" != "$expected_id" \
    || "$release_draft" != "true" || "$release_immutable" != "false" ]]; then
    echo "::error::draft release state changed after the read-only preflight"
    exit 1
  fi
}

wait_for_immutable_publication() {
  local expected_id="$1"
  local attempt
  for attempt in 1 2 3 4 5; do
    load_release_state
    if [[ "$release_found" == "true" && "$release_id" == "$expected_id" \
      && "$release_draft" == "false" && "$release_immutable" == "true" ]]; then
      return 0
    fi
    if [[ "$attempt" -eq 5 ]]; then
      echo "::error::published release did not become immutable after five checks"
      exit 1
    fi
    sleep "$((attempt * 2))"
  done
}

load_release_state
case "$PREFLIGHT_STATE" in
  absent)
    if [[ "$release_found" != "false" || -n "$PREFLIGHT_ID" ]]; then
      echo "::error::a release appeared after the read-only preflight"
      exit 1
    fi
    ;;
  draft)
    if [[ "$EVENT_NAME" != "workflow_dispatch" || "$release_found" != "true" \
      || "$release_id" != "$PREFLIGHT_ID" || "$release_draft" != "true" \
      || "$release_immutable" != "false" ]]; then
      echo "::error::draft release state changed after the read-only preflight"
      exit 1
    fi
    ;;
  published)
    if [[ "$expected_prerelease" == "true" ]]; then
      echo "::error::rc releases must remain drafts"
      exit 1
    fi
    if [[ "$EVENT_NAME" != "workflow_dispatch" || "$release_found" != "true" \
      || "$release_id" != "$PREFLIGHT_ID" || "$release_draft" != "false" \
      || "$release_immutable" != "true" ]]; then
      echo "::error::immutable release state changed after the read-only preflight"
      exit 1
    fi
    "${verify_tag[@]}"
    verify_complete_remote_assets "$comparison_root/published-recheck"
    load_release_state
    if [[ "$release_found" != "true" || "$release_id" != "$PREFLIGHT_ID" \
      || "$release_draft" != "false" || "$release_immutable" != "true" ]]; then
      echo "::error::immutable release changed during final validation"
      exit 1
    fi
    exit 0
    ;;
  *)
    echo "::error::read-only preflight did not provide a valid release state"
    exit 1
    ;;
esac

if [[ "$PREFLIGHT_STATE" == "draft" ]]; then
  load_remote_assets "$comparison_root/draft-existing"
  missing_assets=()
  for name in "${expected_assets[@]}"; do
    if [[ -z "${remote_by_name[$name]+present}" ]]; then
      missing_assets+=("build/release/assets/${name}")
    fi
  done
  if (( ${#missing_assets[@]} > 0 )); then
    revalidate_local_assets
    gh release upload "$RELEASE_TAG" "${missing_assets[@]}"
  fi
  verify_complete_remote_assets "$comparison_root/draft-complete"
  require_draft_state
  "${verify_tag[@]}"
  if [[ "$expected_prerelease" == "true" ]]; then
    echo "::notice::rc release ${release_id} stays a draft; no DOI is minted"
    exit 0
  fi
  revalidate_local_assets
  gh release edit "$RELEASE_TAG" "${release_flags[@]}" \
    --verify-tag \
    --title "20 Watts Was Enough ${RELEASE_TAG}" \
    --notes-file build/release/published-release-notes.md \
    --draft=false
  published_id="$release_id"
else
  load_release_state
  if [[ "$release_found" != "false" ]]; then
    echo "::error::a release appeared immediately before draft creation"
    exit 1
  fi
  "${verify_tag[@]}"
  revalidate_local_assets
  gh release create "$RELEASE_TAG" "${assets[@]}" "${release_flags[@]}" \
    --draft \
    --verify-tag \
    --title "20 Watts Was Enough ${RELEASE_TAG}" \
    --notes-file build/release/published-release-notes.md
  load_release_state
  if [[ "$release_found" != "true" || "$release_draft" != "true" \
    || "$release_immutable" != "false" ]]; then
    echo "::error::new release was not created as a mutable draft"
    exit 1
  fi
  published_id="$release_id"
  verify_complete_remote_assets "$comparison_root/new-draft-complete"
  load_release_state
  if [[ "$release_found" != "true" || "$release_id" != "$published_id" \
    || "$release_draft" != "true" || "$release_immutable" != "false" ]]; then
    echo "::error::new draft changed before publication"
    exit 1
  fi
  "${verify_tag[@]}"
  if [[ "$expected_prerelease" == "true" ]]; then
    require_draft_state "$published_id"
    "${verify_tag[@]}"
    echo "::notice::rc release ${release_id} stays a draft; no DOI is minted"
    exit 0
  fi
  revalidate_local_assets
  gh release edit "$RELEASE_TAG" "${release_flags[@]}" --verify-tag --draft=false
fi

wait_for_immutable_publication "$published_id"
"${verify_tag[@]}"
verify_complete_remote_assets "$comparison_root/published-final"
