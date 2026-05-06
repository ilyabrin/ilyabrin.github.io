---
title: "Technical Documentation: Writing So People Actually Read It"
date: 2025-11-12T10:00:00+03:00
draft: false
tags: ["documentation", "writing", "best-practices", "team"]
categories: ["Communication"]
---

Documentation is code that people read. But most documentation goes unread. Why? Because it's written for compliance, not for usefulness.

Good documentation saves hours of explanations. Bad documentation creates more questions than answers.
<!--more-->
## The Problem

Typical documentation:

```markdown
# API Documentation

## Overview
This API provides functionality for user management.

## Endpoints
POST /api/users - Creates user
GET /api/users - Gets users
```

What's wrong:

- No examples
- No context
- No explanation of why it's needed
- Unclear how to use

## Principles of Good Documentation

### 1. Start with "Why"

Bad:

```markdown
# Redis Cache Implementation
```

Good:

```markdown
# Redis Cache Implementation

## Why
Database queries take 500ms. Users wait. We lose conversions.
Cache reduces this to 50ms.

## When to use
- Frequently accessed data
- Data that changes rarely
- Read-heavy workloads
```

### 2. Show Examples

Bad:

```go
// GetUser retrieves user by ID
func GetUser(id string) (*User, error)
```

Good:

```go
// GetUser retrieves user by ID from cache or database.
// Returns ErrNotFound if user doesn't exist.
//
// Example:
//   user, err := GetUser("user-123")
//   if err == ErrNotFound {
//       return nil, fmt.Errorf("user not found")
//   }
func GetUser(id string) (*User, error)
```

### 3. Structure Information

```markdown
# Feature Name

## Quick Start
Minimum code to get started (copy-paste ready)

## How It Works
High-level explanation

## API Reference
Detailed function descriptions

## Examples
Real-world scenarios

## Troubleshooting
Common problems and solutions
```

## README Structure

### Minimal README

```markdown
# Project Name

One sentence: what this does.

## Quick Start

```bash
git clone repo
make run
```

## What's Inside

- `cmd/` - entry points
- `internal/` - business logic
- `pkg/` - reusable packages

## Configuration

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```

## Development

```bash
make test
make lint
```

### Complete README

```markdown
# Project Name

## What & Why

Problem: Users wait 5 seconds for page load
Solution: This service caches responses
Result: 100ms response time

## Quick Start

```bash
docker-compose up
curl http://localhost:8080/health
```

## Architecture

```
Client → API Gateway → Service → Database
              ↓
            Cache
```

## Installation

### Prerequisites

- Go 1.21+
- PostgreSQL 15+
- Redis 7+

### Steps

```bash
git clone repo
cp .env.example .env
make install
make migrate
make run
```

## Configuration

| Variable | Description  | Default |
| -------- | ------------ | ------- |
| PORT     | Server port  | 8080    |
| DB_URL   | Database URL | -       |

## API

### Create User

```bash
POST /api/users
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John"
}
```

Response:

```json
{
  "id": "user-123",
  "email": "user@example.com"
}
```

## Development

### Running Tests

```bash
make test
```

### Code Style

```bash
make lint
make fmt
```

## Deployment

```bash
docker build -t app .
docker push registry/app
kubectl apply -f k8s/
```

## Common Problems

### Database connection fails

Check DATABASE_URL format:

```
postgres://user:pass@host:5432/db?sslmode=disable
```

### High memory usage

Increase cache TTL or reduce cache size in config.

## Contributing

1. Fork repo
2. Create branch
3. Make changes
4. Run tests
5. Submit PR

## License

MIT

## Code Documentation

### Function Comments

Bad:

```go
// Process processes data
func Process(data []byte) error
```

Good:

```go
// Process validates and transforms incoming webhook data.
// Returns ErrInvalidFormat if data is malformed.
// Returns ErrDuplicate if webhook already processed.
//
// Process is idempotent - safe to call multiple times
// with same data.
func Process(data []byte) error
```

### Package Comments

```go
// Package cache provides Redis-based caching with automatic
// serialization and TTL management.
//
// Basic usage:
//
//   c := cache.New(redisClient)
//   c.Set(ctx, "key", value, 1*time.Hour)
//   var result MyType
//   c.Get(ctx, "key", &result)
//
// Cache handles serialization automatically using JSON.
// For custom serialization, implement cache.Marshaler.
package cache
```

### Type Comments

```go
// User represents authenticated user in the system.
// User data is cached for 1 hour after authentication.
type User struct {
    ID    string    // Unique identifier
    Email string    // Must be valid email
    Role  UserRole  // One of: admin, user, guest
}

// UserRole defines user permission level.
type UserRole string

const (
    RoleAdmin UserRole = "admin" // Full access
    RoleUser  UserRole = "user"  // Standard access
    RoleGuest UserRole = "guest" // Read-only
)
```

## ADR (Architecture Decision Records)

```markdown
# ADR-001: Use Redis for Caching

## Status
Accepted

## Context
Database queries take 500ms average.
95% of queries are reads.
Data changes infrequently (hourly).

## Decision
Use Redis as cache layer between API and database.

## Consequences

### Positive
- 10x faster response time
- Reduced database load
- Better user experience

### Negative
- Additional infrastructure
- Cache invalidation complexity
- Potential stale data

## Alternatives Considered

### In-memory cache
- Pros: No external dependency
- Cons: Lost on restart, no sharing between instances

### Memcached
- Pros: Simple, fast
- Cons: No persistence, limited data structures

## Implementation
- Cache-aside pattern
- TTL: 1 hour
- Invalidation: on write operations
```

## API Documentation

### OpenAPI/Swagger

```yaml
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0

paths:
  /users:
    post:
      summary: Create user
      description: |
        Creates new user account.
        Email must be unique.
        Password must be 8+ characters.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                  example: user@example.com
                password:
                  type: string
                  minLength: 8
                  example: SecurePass123
      responses:
        201:
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        400:
          description: Invalid input
        409:
          description: Email already exists
```

### Request Examples

```markdown
## Create User

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

Success response (201):

```json
{
  "id": "user-123",
  "email": "user@example.com",
  "created_at": "2024-01-22T10:00:00Z"
}
```

Error response (400):

```json
{
  "error": "invalid_email",
  "message": "Email format is invalid"
}
```

## Operations Runbook

```markdown
# Service Runbook

## Health Checks

### Application
```bash
curl http://localhost:8080/health
```

Expected: `{"status": "ok"}`

### Database

```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Redis

```bash
redis-cli -u $REDIS_URL ping
```

## Common Issues

### High CPU Usage

**Symptoms:**

- CPU > 80%
- Slow response times

**Diagnosis:**

```bash
go tool pprof http://localhost:8080/debug/pprof/profile
```

**Solution:**

1. Check for infinite loops
2. Review recent deployments
3. Scale horizontally if needed

### Memory Leak

**Symptoms:**

- Memory grows continuously
- OOM kills

**Diagnosis:**

```bash
go tool pprof http://localhost:8080/debug/pprof/heap
```

**Solution:**

1. Check goroutine leaks
2. Review cache size
3. Restart service if critical

## Deployment Procedures

### Rolling Update

```bash
kubectl set image deployment/app app=registry/app:v1.2.3
kubectl rollout status deployment/app
```

### Rollback

```bash
kubectl rollout undo deployment/app
```

## Monitoring

### Key Metrics

- Request rate: < 1000 req/s
- Error rate: < 1%
- Response time: p95 < 200ms
- Memory: < 512MB

### Alerts

- High error rate → Check logs
- High latency → Check database
- High memory → Check for leaks

## Changelog

```markdown
# Changelog

## [1.2.0] - 2024-01-22

### Added
- User authentication with JWT
- Rate limiting per user
- Metrics endpoint

### Changed
- Improved error messages
- Updated dependencies

### Fixed
- Race condition in cache
- Memory leak in websocket handler

### Security
- Fixed SQL injection in search
- Updated crypto library

## [1.1.0] - 2024-01-15

...
```

## Automation

### Generate Documentation

```go
//go:generate go run github.com/swaggo/swag/cmd/swag init

// @title User API
// @version 1.0
// @description User management service
// @host localhost:8080
// @BasePath /api
func main() {
    // ...
}
```

### Check Documentation

```bash
#!/bin/bash
# check-docs.sh

# Check README exists
if [ ! -f README.md ]; then
    echo "README.md missing"
    exit 1
fi

# Check all public functions documented
undocumented=$(go doc -all | grep "^func" | grep -v "//")
if [ -n "$undocumented" ]; then
    echo "Undocumented functions:"
    echo "$undocumented"
    exit 1
fi

# Check links in markdown
markdown-link-check README.md
```

## Conclusion

Good documentation:

- Starts with "why"
- Contains examples
- Structured logically
- Kept up to date
- Easy to find what you need

Bad documentation is worse than no documentation. Better to write 10 lines of useful text than 100 lines of fluff.

Documentation is an investment. One hour writing saves dozens of hours explaining.

Write documentation the way you'd want to read it yourself.

### Additional information

- [Write the Docs](https://www.writethedocs.org/) - Documentation writers and documentation community
- [Google Developer Documentation Style Guide](https://developers.google.com/style) - Documentation style guide from Google
- [Microsoft Docs Contributor Guide](https://docs.microsoft.com/contribute/) - How to write documentation Microsoft style
- [The Documentation System](https://documentation.divio.com/) - Framework for structuring documentation
