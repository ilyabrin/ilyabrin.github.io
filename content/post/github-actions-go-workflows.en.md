---
title: "GitHub Actions: Advanced Workflows for Go Projects"
date: 2025-01-15T11:00:00+01:00

author: "Ilya Brin"
categories: ['devops', 'golang', 'ci-cd']
tags: ['github-actions', 'golang', 'ci-cd', 'automation', 'testing', 'deployment', 'workflows']
---

Hey there! 👋

Are you still **manually** running tests before every commit? Deploying to production **via SSH** and praying nothing breaks?

**GitHub Actions** turns your repository into an **automated machine**: tests, linters, builds, deployments - all **without your intervention**.

But most people only use basic features. You can set up **matrix testing**, **dependency caching**, **conditional deployments**, and even **automatic releases**.

Let's explore **advanced patterns** for GitHub Actions in Go projects 🚀

<!--more-->

## 1. Basic Workflow (Quick Start)

### Minimal Configuration

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v4
      with:
        go-version: '1.21'
    - run: go test ./...
```

**Problems with basic approach:**

- No caching (slow)
- Tests only one Go version
- No formatting checks
- No binary builds

## 2. Advanced CI Workflow

### Full Configuration with Optimizations

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
      uses: actions/checkout@v4
      
    - name: Setup Go
      uses: actions/setup-go@v4
      with:
        go-version: ${{ matrix.go-version }}
        
    - name: Cache dependencies
      uses: actions/cache@v3
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

### Key Improvements

**✅ Matrix testing:** different Go versions and OS  
**✅ Caching:** 2-3x speedup  
**✅ Race detector:** find data races  
**✅ Coverage:** track test coverage  

## 3. Linting and Code Quality

### golangci-lint Integration

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v4
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

### Linter Configuration

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

## 4. Building and Releases

### Automatic Binary Builds

```yaml
  build:
    needs: [test, lint]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        goos: [linux, windows, darwin]
        goarch: [amd64, arm64]
        
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v4
      with:
        go-version: '1.21'
        
    - name: Build binary
      env:
        GOOS: ${{ matrix.goos }}
        GOARCH: ${{ matrix.goarch }}
      run: |
        go build -ldflags="-s -w" -o myapp-${{ matrix.goos }}-${{ matrix.goarch }} ./cmd/myapp
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: binaries
        path: myapp-*
```

### Automatic Releases on Tags

```yaml
  release:
    if: startsWith(github.ref, 'refs/tags/')
    needs: build
    runs-on: ubuntu-latest
    
    steps:
    - name: Download artifacts
      uses: actions/download-artifact@v3
      with:
        name: binaries
        
    - name: Create Release
      uses: softprops/action-gh-release@v1
      with:
        files: myapp-*
        generate_release_notes: true
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 5. Docker Integration

### Multi-stage Build with Caching

```yaml
  docker:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
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

### Optimized Dockerfile

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

## 6. Conditional Deployments and Environments

### Branch-based Deployment

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
        # Your deployment script here
```

### Staging Environment for PRs

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

## 7. Security and Secrets

### Vulnerability Scanning

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v4
      with:
        go-version: '1.21'
        
    - name: Run Gosec Security Scanner
      uses: securecodewarrior/github-action-gosec@master
      with:
        args: './...'
        
    - name: Scan dependencies
      run: go list -json -deps ./... | nancy sleuth
```

### Working with Secrets

```yaml
    - name: Deploy with secrets
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
        API_KEY: ${{ secrets.API_KEY }}
      run: |
        echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"
        ./deploy.sh
```

## 8. Performance Optimization

### Parallel Jobs

```yaml
jobs:
  test:
    # Fast tests
  lint:
    # Parallel with tests
  build:
    needs: [test, lint]  # Only after successful tests
  deploy:
    needs: build         # Sequential
```

### Conditional Execution

```yaml
  test:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    
  deploy:
    if: |
      github.ref == 'refs/heads/main' && 
      !contains(github.event.head_commit.message, '[skip deploy]')
```

## 9. Monitoring and Notifications

### Telegram Notifications

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
          🚀 Deploy: ${{ job.status }}
          📦 Repository: ${{ github.repository }}
          🌿 Branch: ${{ github.ref_name }}
          👤 Author: ${{ github.actor }}
          📝 Commit: ${{ github.event.head_commit.message }}
```

### Performance Metrics

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

## 10. Complete Workflow Example

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
    - uses: actions/cache@v3
      with:
        path: |
          ~/.cache/go-build
          ~/go/pkg/mod
        key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
    - run: go mod download
    - run: go test -race -coverprofile=coverage.out ./...
    - uses: codecov/codecov-action@v3

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

## Conclusion: Automation = Freedom

**Properly configured CI/CD:**
🚀 **Saves hours** of manual work  
🛡️ **Prevents bugs** in production  
📈 **Accelerates development** with fast feedback  
🔄 **Standardizes processes** across team  

**Golden rule:**  
> If you do something more than twice - automate it!

**P.S. What workflows do you use? Share in comments!** 🚀

```yaml
# Additional resources:
# - GitHub Actions Documentation - https://docs.github.com/en/actions
# - golangci-lint configuration - https://docs.codecov.com/docs
# - Codecov Go setup - https://docs.codecov.com/docs/go
# - Docker best practices for Go - https://docs.docker.com/develop/develop-images/dockerfile_best-practices/
```
