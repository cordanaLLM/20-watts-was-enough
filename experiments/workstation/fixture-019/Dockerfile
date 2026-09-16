FROM node:26.8.1-trixie-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS node-runtime

FROM python:3.14.7-slim-trixie@sha256:cae66f2ef0ec51a9891263eeee7f987dacf0a9879e8aa9353d5606e0530619a5

ARG IMAGE_VERSION=development
ARG IMAGE_NAME=ghcr.io/cordanallm/20-watts-was-enough-fixture-019
ARG SOURCE_REVISION=unknown

LABEL org.opencontainers.image.title="20 Watts Was Enough Fixture 019 runtime" \
      org.opencontainers.image.description="Scoped CPython and NumPy runtime for the bounded Fixture 019 NO_RESULT harness" \
      org.opencontainers.image.source="https://github.com/lusoris/20-watts-was-enough" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      io.github.lusoris.20-watts-was-enough.image-name="${IMAGE_NAME}" \
      io.github.lusoris.20-watts-was-enough.result-authority="NO_RESULT"

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    EXPERIMENT_ARTIFACT="fixture-019" \
    EXPERIMENT_IMAGE_NAME="${IMAGE_NAME}" \
    EXPERIMENT_IMAGE_VERSION="${IMAGE_VERSION}" \
    EXPERIMENT_SOURCE_REVISION="${SOURCE_REVISION}" \
    EXPERIMENT_RESULT_AUTHORITY="NO_RESULT"

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/lib/x86_64-linux-gnu/libatomic.so.1.2.0 /usr/lib/x86_64-linux-gnu/libatomic.so.1.2.0

WORKDIR /workspace
COPY . /workspace/

RUN set -eu; \
    test "$(cat .experiment-artifact)" = "fixture-019"; \
    test "$(cat .experiment-runner)" = "experiments/workstation/fixture-019/runner.mjs"; \
    printf '%s\n' "${IMAGE_NAME}" > /tmp/image-name; \
    grep -Eq '^[a-z0-9][a-z0-9._/-]{0,199}$' /tmp/image-name; \
    printf '%s\n' "${IMAGE_VERSION}" > /tmp/image-version; \
    grep -Eq '^(development|v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$' /tmp/image-version; \
    printf '%s\n' "${SOURCE_REVISION}" > /tmp/source-revision; \
    grep -Eq '^(unknown|[0-9a-f]{40})$' /tmp/source-revision; \
    test -z "$(find /workspace -mindepth 1 ! -type d ! -type f -print -quit)"; \
    sha256sum --check --strict closure.sha256; \
    find . -type f ! -path './.experiment-artifact' ! -path './.experiment-runner' ! -path './closure.sha256' -printf '%P\n' > /tmp/actual-closure; \
    LC_ALL=C sort -o /tmp/actual-closure /tmp/actual-closure; \
    sed -n 's/^[0-9a-f]\{64\}  //p' closure.sha256 > /tmp/expected-closure; \
    LC_ALL=C sort -c /tmp/expected-closure; \
    cmp /tmp/expected-closure /tmp/actual-closure; \
    find . -mindepth 1 -type d -printf '%P\n' > /tmp/actual-directories; \
    LC_ALL=C sort -o /tmp/actual-directories /tmp/actual-directories; \
    printf '%s\n' experiments experiments/workstation experiments/workstation/lib experiments/workstation/fixture-019 experiments/workstation/fixture-019/configs experiments/workstation/fixture-019/seeds > /tmp/expected-directories; \
    LC_ALL=C sort -o /tmp/expected-directories /tmp/expected-directories; \
    cmp /tmp/expected-directories /tmp/actual-directories; \
    python -m pip install --no-deps --require-hashes -r requirements-ci.txt; \
    ln --symbolic libatomic.so.1.2.0 /usr/lib/x86_64-linux-gnu/libatomic.so.1; \
    test "$(node --version)" = "v26.8.1"; \
    test "$(python --version)" = "Python 3.14.7"; \
    python -c 'import numpy; assert numpy.__version__ == "2.5.2"'; \
    groupadd --gid 1000 experiment; \
    useradd --create-home --uid 1000 --gid experiment --shell /usr/sbin/nologin experiment; \
    install --directory --owner=experiment --group=experiment /workspace/results; \
    rm .experiment-artifact .experiment-runner requirements-ci.txt \
      /tmp/image-name /tmp/image-version /tmp/source-revision \
      /tmp/actual-closure /tmp/expected-closure /tmp/actual-directories /tmp/expected-directories; \
    find /workspace -type f -exec chmod 0444 '{}' +; \
    find /workspace -type d -exec chmod 0555 '{}' +; \
    chmod 0755 /workspace/results

USER experiment
VOLUME ["/workspace/results"]
ENTRYPOINT ["node", "experiments/workstation/fixture-019/runner.mjs"]
CMD ["prepare", "--profile", "smoke"]
