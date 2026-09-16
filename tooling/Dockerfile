FROM golang:1.27.1-trixie@sha256:9baa6b4187bbb98d240372a8a235ac0bb6b5ddd52bba1431dc2f7c0705862728 AS builder

ARG TARGETARCH
ARG TARGETOS
ARG IMAGE_VERSION=development
ARG IMAGE_NAME=ghcr.io/lusoris/20-watts-was-enough-20w
ARG SOURCE_REVISION=unknown
ARG SOURCE_TIMESTAMP=unknown

ENV CGO_ENABLED=0 \
    GOENV=off \
    GOEXPERIMENT= \
    GOFLAGS= \
    GOTOOLCHAIN=local

WORKDIR /source/tooling
COPY tooling/go.mod tooling/go.sum ./
RUN go mod download \
    && go mod verify
COPY tooling/cmd ./cmd
COPY tooling/internal ./internal
RUN GOARCH="${TARGETARCH}" GOOS="${TARGETOS}" go build \
    -trimpath \
    -buildvcs=false \
    -ldflags="-s -w -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.version=${IMAGE_VERSION} -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.revision=${SOURCE_REVISION} -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.builtAt=${SOURCE_TIMESTAMP}" \
    -o /out/20w \
    ./cmd/20w

FROM scratch

ARG IMAGE_VERSION=development
ARG IMAGE_NAME=ghcr.io/lusoris/20-watts-was-enough-20w
ARG SOURCE_REVISION=unknown

LABEL org.opencontainers.image.title="20 Watts Was Enough command" \
      org.opencontainers.image.description="Static repository validation and experiment catalogue command" \
      org.opencontainers.image.source="https://github.com/lusoris/20-watts-was-enough" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      io.github.lusoris.20-watts-was-enough.image-name="${IMAGE_NAME}"

COPY --from=builder /out/20w /20w

USER 65532:65532
ENTRYPOINT ["/20w"]
CMD ["help"]
