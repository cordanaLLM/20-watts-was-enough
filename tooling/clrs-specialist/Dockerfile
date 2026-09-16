FROM golang:1.27.1-trixie@sha256:9baa6b4187bbb98d240372a8a235ac0bb6b5ddd52bba1431dc2f7c0705862728 AS builder

ARG TARGETARCH=amd64
ARG TARGETOS=linux
ARG IMAGE_VERSION=development
ARG SOURCE_REVISION=unknown
ARG SOURCE_TIMESTAMP=unknown

ENV CGO_ENABLED=0 \
    GOENV=off \
    GOEXPERIMENT= \
    GOFLAGS= \
    GOPROXY=off \
    GOSUMDB=off \
    GOTOOLCHAIN=local

WORKDIR /source/tooling
COPY tooling/go.mod tooling/go.sum ./
COPY tooling/cmd/clrs-specialist ./cmd/clrs-specialist
COPY tooling/internal/buildinfo ./internal/buildinfo
COPY tooling/internal/clrsbellmanford ./internal/clrsbellmanford
COPY tooling/internal/clrsbinary ./internal/clrsbinary
COPY tooling/internal/clrsfixture ./internal/clrsfixture
COPY tooling/internal/clrsinsertion ./internal/clrsinsertion
COPY tooling/internal/clrskmp ./internal/clrskmp
COPY tooling/internal/clrsmatrixchain ./internal/clrsmatrixchain
COPY tooling/internal/clrsrunner ./internal/clrsrunner
COPY tooling/internal/clrssegments ./internal/clrssegments
COPY tooling/internal/pdfrenderlock ./internal/pdfrenderlock
COPY tooling/internal/specialistcontrol ./internal/specialistcontrol
COPY tooling/internal/strictjson ./internal/strictjson
RUN test "${TARGETOS}/${TARGETARCH}" = "linux/amd64" \
    && GOARCH="${TARGETARCH}" GOOS="${TARGETOS}" go build \
      -trimpath \
      -buildvcs=false \
      -ldflags="-s -w -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.version=${IMAGE_VERSION} -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.revision=${SOURCE_REVISION} -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.builtAt=${SOURCE_TIMESTAMP}" \
      -o /out/clrs-specialist \
      ./cmd/clrs-specialist

FROM scratch

ARG IMAGE_VERSION=development
ARG IMAGE_NAME=ghcr.io/lusoris/20-watts-was-enough-clrs-shakedown
ARG SOURCE_REVISION=unknown

LABEL org.opencontainers.image.title="20 Watts Was Enough CLRS shakedown specialists" \
      org.opencontainers.image.description="Six bounded exact-program CLRS specialist candidates; no dataset or scientific-result authority" \
      org.opencontainers.image.source="https://github.com/lusoris/20-watts-was-enough" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      io.github.lusoris.20-watts-was-enough.image-name="${IMAGE_NAME}" \
      io.github.lusoris.20-watts-was-enough.result-authority="NO_RESULT" \
      io.github.lusoris.20-watts-was-enough.clrs-source-id="sha256:7ec3b6b7528d04f517c4e9b7c3e0cd0f7034a775d225d469d1aca5c00fec10d1" \
      io.github.lusoris.20-watts-was-enough.clrs-generation-contract-id="sha256:cc14fce405e8fa7d4719f1fc906e28d5e4b73235085c8f0722795efded2891a8"

COPY --from=builder /out/clrs-specialist /clrs-specialist

USER 65532:65532
ENTRYPOINT ["/clrs-specialist"]
