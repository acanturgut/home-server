# syntax=docker/dockerfile:1.7
FROM golang:1.27-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /home-server .

FROM alpine:3.24

# Layer 1: system packages. ca-certificates for outbound HTTPS (weather,
# web search, router/bridge APIs); tzdata so Go's time.LoadLocation resolves
# real IANA zones instead of falling back to UTC.
RUN apk add --no-cache ca-certificates tzdata

# Layer 2: Go binary (changes on every code change — always last)
COPY --from=builder /home-server /usr/local/bin/home-server
RUN mkdir -p /var/log/home-server
EXPOSE 8080
CMD ["home-server"]
