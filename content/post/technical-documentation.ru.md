---
title: "Техническая документация: писать так, чтобы читали"
date: 2025-11-12T10:00:00+03:00
draft: false
tags: ["documentation", "writing", "best-practices", "team"]
categories: ["Communication"]
---

Документация - это код, который читают люди. Но большинство документации никто не читает. Почему? Потому что она написана для галочки, а не для пользы.

Хорошая документация экономит часы объяснений. Плохая - создаёт больше вопросов, чем ответов.

<!--more-->

## Проблема

Типичная документация:

```markdown
# API Documentation

## Overview
This API provides functionality for user management.

## Endpoints
POST /api/users - Creates user
GET /api/users - Gets users
```

Что не так:

- Нет примеров
- Нет контекста
- Нет объяснения, зачем это нужно
- Непонятно, как использовать

## Принципы хорошей документации

### 1. Начинайте с "зачем"

Плохо:

```markdown
# Redis Cache Implementation
```

Хорошо:

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

### 2. Показывайте примеры

Плохо:

```go
// GetUser retrieves user by ID
func GetUser(id string) (*User, error)
```

Хорошо:

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

### 3. Структурируйте информацию

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

## README структура

### Минимальный README

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

```md

### Полный README

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

```sh
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

## Разработка

### Running Tests

```bash
make test
```

### Code Style

```bash
make lint
make fmt
```

## Деплой

```bash
docker build -t app .
docker push registry/app
kubectl apply -f k8s/
```

## Решение проблем

### Database connection fails

Check DATABASE_URL format:

```txt
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

```md

## Документирование кода

### Комментарии к функциям

Плохо:
```go
// Process processes data
func Process(data []byte) error
```

Хорошо:

```go
// Process validates and transforms incoming webhook data.
// Returns ErrInvalidFormat if data is malformed.
// Returns ErrDuplicate if webhook already processed.
//
// Process is idempotent - safe to call multiple times
// with same data.
func Process(data []byte) error
```

### Комментарии к пакетам

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

### Комментарии к типам

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

## API документация

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

### Примеры запросов

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

```md

## Runbook для операций

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

## Deployment

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

```md

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

## Автоматизация

### Генерация документации

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

### Проверка документации

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

## Заключение

Хорошая документация:

- Начинается с "зачем"
- Содержит примеры
- Структурирована логично
- Актуальна
- Легко найти нужное

Плохая документация хуже, чем её отсутствие. Лучше написать 10 строк полезного текста, чем 100 строк воды.

Документация - это инвестиция. Час на написание экономит десятки часов объяснений.

Пишите документацию так, как хотели бы её читать сами.

### Дополнительная информация

- [Write the Docs](https://www.writethedocs.org/) - Сообщество технических писателей и документации
- [Google Developer Documentation Style Guide](https://developers.google.com/style) - Руководство по стилю документации от Google
- [Microsoft Docs Contributor Guide](https://docs.microsoft.com/contribute/) - Как писать документацию в стиле Microsoft
- [The Documentation System](https://documentation.divio.com/) - Фреймворк для структурирования документации
