#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
comparison_root="$(mktemp -d "${RUNNER_TEMP}/20w-release-preflight.XXXXXX")"
cleanup() {
  rm -rf -- "$comparison_root"
}
trap cleanup EXIT
expected_inventory="$comparison_root/expected-assets.txt"
remote_inventory="$comparison_root/remote-assets.txt"
published_inventory="$comparison_root/published-assets.txt"
checksum_manifest="build/release/assets/SHA256SUMS"
go -C tooling run ./cmd/20w release asset-inventory \
  --assets ../build/release/assets \
  --phase source > "$expected_inventory"
cp "$expected_inventory" "$published_inventory"
printf '%s\n' "oci-images.json" "SHA256SUMS.sigstore.json" >> "$published_inventory"
sort --output="$published_inventory" "$published_inventory"

compare_asset() {
  local name="$1"
  local downloaded="$2"
  local expected="build/release/assets/${name}"
  local expected_sha
  local downloaded_sha
  expected_sha="$(sha256sum "$expected" | awk '{print $1}')"
  downloaded_sha="$(sha256sum "$downloaded" | awk '{print $1}')"
  if [[ "$expected_sha" != "$downloaded_sha" ]] || ! cmp --silent -- "$expected" "$downloaded"; then
    echo "::error::existing release asset differs from the local asset: ${name}"
    exit 1
  fi
}

go -C tooling run ./cmd/20w release verify-tag \
  --repository "$GITHUB_REPOSITORY" \
  --tag "$RELEASE_TAG" \
  --commit "$RELEASE_COMMIT"
release_state_row="$(
  go -C tooling run ./cmd/20w release state \
    --repository "$GITHUB_REPOSITORY" \
    --tag "$RELEASE_TAG"
)"
if [[ "$release_state_row" == "absent" ]]; then
  printf '%s\n' \
    "release_state=absent" \
    "release_id=" \
    "oci_manifest=absent" \
    "remote_checksum=absent" >> "$GITHUB_OUTPUT"
  exit 0
fi
if [[ "$EVENT_NAME" != "workflow_dispatch" ]]; then
  echo "::error::an existing release may be checked or repaired only by an explicit manual dispatch"
  exit 1
fi

expected_prerelease=false
case "$RELEASE_TAG" in
  *-rc.*) expected_prerelease=true ;;
esac
IFS=$'\t' read -r release_presence release_id release_draft release_prerelease release_immutable release_state_tag trailing \
  <<< "$release_state_row"
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
if [[ "$expected_prerelease" == "true" && "$release_draft" != "true" ]]; then
  echo "::error::rc releases must remain drafts"
  exit 1
fi

existing_root="$comparison_root/existing"
go -C tooling run ./cmd/20w release fetch-assets \
  --repository "$GITHUB_REPOSITORY" \
  --release-id "$release_id" \
  --expected-assets ../build/release/assets \
  --phase source \
  --output "$existing_root" \
  --tag "$RELEASE_TAG" \
  --revision "$RELEASE_COMMIT" > "$remote_inventory"
mapfile -t remote_assets < "$remote_inventory"
declare -A remote_by_name=()
for name in "${remote_assets[@]}"; do
  remote_by_name["$name"]=1
  if [[ "$name" != "SHA256SUMS" && "$name" != "oci-images.json" && "$name" != "SHA256SUMS.sigstore.json" ]]; then
    compare_asset "$name" "$existing_root/$name"
  fi
done

oci_manifest=absent
remote_checksum=absent
if [[ -n "${remote_by_name[oci-images.json]+present}" ]]; then
  go -C tooling run ./cmd/20w release validate-oci-images \
    --input "$existing_root/oci-images.json" \
    --repository "$IMAGE_REPOSITORY" \
    --tag "$RELEASE_TAG" \
    --revision "$RELEASE_COMMIT"
  cp "$existing_root/oci-images.json" build/release/assets/oci-images.json
  oci_manifest=present
fi
if [[ -n "${remote_by_name[SHA256SUMS]+present}" ]]; then
  remote_checksum=present
  remote_checksum_manifest="$existing_root/SHA256SUMS"
  oci_argument=()
  if [[ "$oci_manifest" == "present" ]]; then
    oci_argument=(--oci "$existing_root/oci-images.json")
  fi
  go -C tooling run ./cmd/20w release compare-publication-manifest \
    --source "../$checksum_manifest" \
    --publication "$remote_checksum_manifest" \
    "${oci_argument[@]}"
  if [[ "$oci_manifest" == "present" ]]; then
    cp "$remote_checksum_manifest" "$checksum_manifest"
  else
    cp "$remote_checksum_manifest" build/release/existing-draft-SHA256SUMS
  fi
fi

if [[ -n "${remote_by_name[SHA256SUMS.sigstore.json]+present}" ]]; then
  if [[ "$oci_manifest" != "present" || "$remote_checksum" != "present" ]]; then
    echo "::error::a persisted checksum signature requires the final checksum and OCI authority"
    exit 1
  fi
  cosign verify-blob --timeout 3m --bundle "$existing_root/SHA256SUMS.sigstore.json" \
    --certificate-identity "https://github.com/${GITHUB_REPOSITORY}/.github/workflows/release-build.yml@refs/tags/${RELEASE_TAG}" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    "$checksum_manifest"
  cp "$existing_root/SHA256SUMS.sigstore.json" build/release/assets/SHA256SUMS.sigstore.json
fi

case "$release_draft:$release_immutable" in
  true:false)
    release_state=draft
    ;;
  false:true)
    if [[ "$oci_manifest" != "present" || "$remote_checksum" != "present" ]] \
      || ! diff --unified=0 "$published_inventory" "$remote_inventory"; then
      echo "::error::published immutable release assets are incomplete"
      exit 1
    fi
    release_state=published
    ;;
  *)
    echo "::error::release is neither a mutable draft nor an immutable publication"
    exit 1
    ;;
esac
printf '%s\n' \
  "release_state=${release_state}" \
  "release_id=${release_id}" \
  "oci_manifest=${oci_manifest}" \
  "remote_checksum=${remote_checksum}" >> "$GITHUB_OUTPUT"
