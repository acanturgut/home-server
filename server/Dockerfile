FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /home-server .

FROM alpine:3.19

# Layer 1: system packages (cached unless base image changes)
RUN apk add --no-cache ca-certificates curl docker-cli nodejs npm python3 py3-pip git \
    build-base python3-dev

# Layer 2: aider install (cached unless aider version changes — this is the slow one)
# --no-cache-dir + MAX_JOBS=1 to prevent OOM on low-memory devices (Pi 5 has 8GB)
RUN MAX_JOBS=1 pip3 install --no-cache-dir --break-system-packages aider-chat \
    && apk del build-base python3-dev

# Layer 3: Go binary (changes on every code change — always last)
COPY --from=builder /home-server /usr/local/bin/home-server
RUN mkdir -p /var/log/home-server
EXPOSE 8080
CMD ["home-server"]
