---
title: "GitHub Actions: продвинутые workflows для Go проектов"
date: 2025-10-11T11:00:00+01:00

author: "Ilya Brin"
categories: ['devops', 'golang', 'ci-cd']
tags: ['github-actions', 'golang', 'ci-cd', 'automation', 'testing', 'deployment', 'workflows']
---

Привет, бро! 👋

Ты всё ещё **вручную** запускаешь тесты перед каждым коммитом? Деплоишь в продакшн **через SSH** и молишься, чтобы ничего не сломалось?

**GitHub Actions** превращает репозиторий в **автоматизированную машину**: тесты, линтеры, сборка, деплой - всё **без твоего участия**.

Но большинство используют только базовые возможности. А ведь можно настроить **матричные тесты**, **кеширование зависимостей**, **условные деплои** и даже **автоматические релизы**.

Разбираем **продвинутые паттерны** GitHub Actions для Go проектов 🚀

<!--more-->

## 1. Базовый workflow (быстрый старт)

### Минимальная конфигурация

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
    - run: go test ./...
```

**Проблемы базового подхода:**

- Нет кеширования (медленно)
- Тестируется только одна версия Go
- Нет проверки форматирования
- Нет сборки бинарников

## 2. Продвинутый CI workflow

### Полная конфигурация с оптимизациями

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        go-version: ['1.20', '1.21']
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
    - name: Checkout
      uses: actions/checkout@v5
      
    - name: Setup Go
      uses: actions/setup-go@v6
      with:
        go-version: ${{ matrix.go-version }}
        
    - name: Cache dependencies
      uses: actions/cache@v4
      with:
        path: |
          ~/.cache/go-build
          ~/go/pkg/mod
        key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
        
    - name: Download dependencies
      run: go mod download
      
    - name: Run tests
      run: go test -race -coverprofile=coverage.out ./...
      
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.out
```

### Ключевые улучшения

**✅ Матричное тестирование:** разные версии Go и ОС  
**✅ Кеширование:** ускорение на 2-3x  
**✅ Race detector:** поиск data races  
**✅ Coverage:** отслеживание покрытия тестами  

## 3. Линтинг и качество кода

### Интеграция с golangci-lint

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
        
    - name: golangci-lint
      uses: golangci/golangci-lint-action@v3
      with:
        version: latest
        args: --timeout=5m
        
    - name: Check formatting
      run: |
        if [ "$(gofmt -s -l . | wc -l)" -gt 0 ]; then
          echo "Code is not formatted:"
          gofmt -s -l .
          exit 1
        fi
```

### Конфигурация линтера

```yaml
# .golangci.yml
linters:
  enable:
    - gofmt
    - goimports
    - govet
    - ineffassign
    - misspell
    - revive
    - staticcheck
    - unused
    
linters-settings:
  revive:
    rules:
      - name: exported
        disabled: true
```

## 4. Сборка и релизы

### Автоматическая сборка бинарников

```yaml
  build:
    needs: [test, lint]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        goos: [linux, windows, darwin]
        goarch: [amd64, arm64]
        
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
        
    - name: Build binary
      env:
        GOOS: ${{ matrix.goos }}
        GOARCH: ${{ matrix.goarch }}
      run: |
        go build -ldflags="-s -w" -o myapp-${{ matrix.goos }}-${{ matrix.goarch }} ./cmd/myapp
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v5
      with:
        name: binaries
        path: myapp-*
```

### Автоматические релизы по тегам

```yaml
  release:
    if: startsWith(github.ref, 'refs/tags/')
    needs: build
    runs-on: ubuntu-latest
    
    steps:
    - name: Download artifacts
      uses: actions/download-artifact@v5
      with:
        name: binaries
        
    - name: Create Release
      uses: softprops/action-gh-release@v2
      with:
        files: myapp-*
        generate_release_notes: true
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 5. Docker интеграция

### Multi-stage build с кешированием

```yaml
  docker:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
      
    - name: Login to registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
        
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### Оптимизированный Dockerfile

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o main ./cmd/app

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
```

## 6. Условные деплои и окружения

### Деплой по веткам

```yaml
  deploy:
    needs: [test, lint]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    environment:
      name: production
      url: https://myapp.com
      
    steps:
    - name: Deploy to production
      run: |
        echo "Deploying to production..."
        # Здесь ваш деплой скрипт
```

### Staging окружение для PR

```yaml
  deploy-staging:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    
    environment:
      name: staging-pr-${{ github.event.number }}
      url: https://pr-${{ github.event.number }}.staging.myapp.com
      
    steps:
    - name: Deploy PR to staging
      run: |
        echo "Deploying PR #${{ github.event.number }} to staging"
```

## 7. Безопасность и секреты

### Сканирование уязвимостей

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
        
    - name: Run Gosec Security Scanner
      uses: securecodewarrior/github-action-gosec@master
      with:
        args: './...'
        
    - name: Scan dependencies
      run: go list -json -deps ./... | nancy sleuth
```

### Работа с секретами

```yaml
    - name: Deploy with secrets
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
        API_KEY: ${{ secrets.API_KEY }}
      run: |
        echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"
        ./deploy.sh
```

## 8. Оптимизация производительности

### Параллельные джобы

```yaml
jobs:
  test:
    # Быстрые тесты
  lint:
    # Параллельно с тестами
  build:
    needs: [test, lint]  # Только после успешных тестов
  deploy:
    needs: build         # Последовательно
```

### Условное выполнение

```yaml
  test:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    
  deploy:
    if: |
      github.ref == 'refs/heads/main' && 
      !contains(github.event.head_commit.message, '[skip deploy]')
```

## 9. Мониторинг и уведомления

### Telegram уведомления

```yaml
  notify:
    if: always()
    needs: [test, lint, build]
    runs-on: ubuntu-latest
    
    steps:
    - name: Telegram notification
      uses: appleboy/telegram-action@master
      with:
        to: ${{ secrets.TELEGRAM_CHAT_ID }}
        token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
        message: |
          🚀 Деплой: ${{ job.status }}
          📦 Репозиторий: ${{ github.repository }}
          🌿 Ветка: ${{ github.ref_name }}
          👤 Автор: ${{ github.actor }}
          📝 Коммит: ${{ github.event.head_commit.message }}
```

### Метрики производительности

```yaml
    - name: Benchmark
      run: |
        go test -bench=. -benchmem ./... | tee benchmark.txt
        
    - name: Store benchmark
      uses: benchmark-action/github-action-benchmark@v1
      with:
        tool: 'go'
        output-file-path: benchmark.txt
```

## 10. Полный пример workflow

```yaml
name: Complete CI/CD
on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        go-version: ['1.20', '1.21']
        os: [ubuntu-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: ${{ matrix.go-version }}
    - uses: actions/cache@v4
      with:
        path: |
          ~/.cache/go-build
          ~/go/pkg/mod
        key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
    - run: go mod download
    - run: go test -race -coverprofile=coverage.out ./...
    - uses: codecov/codecov-action@v5

  lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
    - uses: golangci/golangci-lint-action@v3

  build:
    needs: [test, lint]
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-go@v6
      with:
        go-version: '1.21'
    - run: go build -ldflags="-s -w" ./cmd/app

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
    - run: echo "Deploying to production"
```

## Вывод: Автоматизация = свобода

**Правильно настроенный CI/CD:**
🚀 **Экономит часы** ручной работы  
🛡️ **Предотвращает баги** в продакшне  
📈 **Ускоряет разработку** за счёт быстрой обратной связи  
🔄 **Стандартизирует процессы** в команде  

**Главное правило:**  
> Если делаешь что-то больше 2 раз - автоматизируй!

**P.S. Какие workflow используешь ты? Делись в комментах!** 🚀

```yaml
# Дополнительные ресурсы:
# - GitHub Actions Documentation - https://docs.github.com/ru/actions
# - golangci-lint configuration - https://docs.codecov.com/docs
# - Codecov Go setup - https://docs.codecov.com/docs/go
# - Docker best practices for Go - https://docs.docker.com/develop/develop-images/dockerfile_best-practices/
```
