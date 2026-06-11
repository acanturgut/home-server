# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /home-server .

FROM alpine:3.19

# Layer 1: system packages. Node/npm are kept around because the generated
# apps need `npm run build` inside their own Dockerfiles, and `unzip` +
# `bash` are needed by the opencode install script. tzdata is required so
# Go's time.LoadLocation("America/New_York") etc. resolves real IANA
# zones — without it everything falls back to UTC and market-hours math
# is silently wrong.
RUN apk add --no-cache ca-certificates curl bash unzip docker-cli nodejs npm git ffmpeg tzdata

# Layer 2: opencode (single prebuilt binary — no pip, no Python toolchain).
# The installer chooses an install path based on its own priority order and
# only adds it to /etc/profile (which non-login shells don't source). After
# install, locate the binary and symlink it into /usr/local/bin so PATH
# resolves it for `exec.Command("opencode", ...)` from the Go server.
ENV OPENCODE_DISABLE_AUTOUPDATE=true
RUN curl -fsSL https://opencode.ai/install | bash \
    && OC_BIN="$(find /root /usr/local /opt -maxdepth 5 -type f -name opencode 2>/dev/null | head -n1)" \
    && test -n "$OC_BIN" && ln -sf "$OC_BIN" /usr/local/bin/opencode \
    && opencode --version

# Layer 3: Go binary (changes on every code change — always last)
COPY --from=builder /home-server /usr/local/bin/home-server
RUN mkdir -p /var/log/home-server
EXPOSE 8080
CMD ["home-server"]
