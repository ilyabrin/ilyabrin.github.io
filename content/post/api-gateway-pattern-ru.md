---
title: "API Gateway Pattern: управление API на Go"
date: 2025-06-10T10:30:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "microservices", "api", "architecture", "gateway"]
categories: ["architecture"]
---

API Gateway - это единая точка входа для всех клиентов. Он маршрутизирует запросы к нужным микросервисам, обрабатывает аутентификацию, rate limiting и агрегирует ответы. Давайте построим его на Go.

<!--more-->

## Зачем нужен API Gateway

Без `gateway` клиенты должны знать обо всех микросервисах:

```sh
Mobile App → User Service
          → Order Service
          → Payment Service
          → Notification Service
```

С gateway:

```sh
Mobile App → API Gateway → User Service
                        → Order Service
                        → Payment Service
                        → Notification Service
```

Преимущества:

- Единая точка входа
- Централизованная аутентификация
- Агрегация запросов
- Трансляция протоколов (REST → gRPC)
- Rate limiting и кеширование

## Базовая реализация

```go
package main

import (
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
)

type Gateway struct {
    routes map[string]*httputil.ReverseProxy
}

func NewGateway() *Gateway {
    return &Gateway{
        routes: make(map[string]*httputil.ReverseProxy),
    }
}

func (g *Gateway) AddRoute(path string, target string) error {
    url, err := url.Parse(target)
    if err != nil {
        return err
    }
    g.routes[path] = httputil.NewSingleHostReverseProxy(url)
    return nil
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    for path, proxy := range g.routes {
        if len(r.URL.Path) >= len(path) && r.URL.Path[:len(path)] == path {
            proxy.ServeHTTP(w, r)
            return
        }
    }
    http.Error(w, "Service not found", http.StatusNotFound)
}

func main() {
    gateway := NewGateway()
    gateway.AddRoute("/users", "http://localhost:8001")
    gateway.AddRoute("/orders", "http://localhost:8002")
    gateway.AddRoute("/payments", "http://localhost:8003")

    log.Fatal(http.ListenAndServe(":8080", gateway))
}
```

## Middleware аутентификации

Например, JWT:

```go
func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        userID, err := validateToken(token)
        if err != nil {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }

        r.Header.Set("X-User-ID", userID)
        next.ServeHTTP(w, r)
    })
}

func validateToken(token string) (string, error) {
    // Логика валидации JWT
    return "user123", nil
}
```

## Rate Limiting

Когда нужно ограничить количество запросов от клиента:

```go
type RateLimiter struct {
    requests map[string]*rate.Limiter
    mu       sync.RWMutex
    rate     rate.Limit
    burst    int
}

func NewRateLimiter(r rate.Limit, b int) *RateLimiter {
    return &RateLimiter{
        requests: make(map[string]*rate.Limiter),
        rate:     r,
        burst:    b,
    }
}

func (rl *RateLimiter) getLimiter(key string) *rate.Limiter {
    rl.mu.Lock()
    defer rl.mu.Unlock()

    limiter, exists := rl.requests[key]
    if !exists {
        limiter = rate.NewLimiter(rl.rate, rl.burst)
        rl.requests[key] = limiter
    }
    return limiter
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userID := r.Header.Get("X-User-ID")
        limiter := rl.getLimiter(userID)

        if !limiter.Allow() {
            http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

## Агрегация запросов

Для сложных запросов, требующих данные из нескольких сервисов:

```go
type AggregatedResponse struct {
    User    json.RawMessage `json:"user"`
    Orders  json.RawMessage `json:"orders"`
    Profile json.RawMessage `json:"profile"`
}

func (g *Gateway) handleAggregated(w http.ResponseWriter, r *http.Request) {
    userID := r.Header.Get("X-User-ID")

    var wg sync.WaitGroup
    var mu sync.Mutex
    result := &AggregatedResponse{}

    wg.Add(3)

    go func() {
        defer wg.Done()
        data := g.fetchUser(userID)
        mu.Lock()
        result.User = data
        mu.Unlock()
    }()

    go func() {
        defer wg.Done()
        data := g.fetchOrders(userID)
        mu.Lock()
        result.Orders = data
        mu.Unlock()
    }()

    go func() {
        defer wg.Done()
        data := g.fetchProfile(userID)
        mu.Lock()
        result.Profile = data
        mu.Unlock()
    }()

    wg.Wait()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}
```

## Circuit Breaker

```go
type CircuitBreaker struct {
    maxFailures int
    timeout     time.Duration
    failures    int
    lastFail    time.Time
    state       string
    mu          sync.RWMutex
}

func (cb *CircuitBreaker) Call(fn func() error) error {
    cb.mu.Lock()
    defer cb.mu.Unlock()

    if cb.state == "open" {
        if time.Since(cb.lastFail) > cb.timeout {
            cb.state = "half-open"
        } else {
            return fmt.Errorf("circuit breaker is open")
        }
    }

    err := fn()
    if err != nil {
        cb.failures++
        cb.lastFail = time.Now()
        if cb.failures >= cb.maxFailures {
            cb.state = "open"
        }
        return err
    }

    cb.failures = 0
    cb.state = "closed"
    return nil
}
```

## Load Balancing

```go
type LoadBalancer struct {
    backends []*url.URL
    current  uint32
}

func (lb *LoadBalancer) NextBackend() *url.URL {
    n := atomic.AddUint32(&lb.current, 1)
    return lb.backends[n%uint32(len(lb.backends))]
}

func (g *Gateway) AddLoadBalancedRoute(path string, backends []string) error {
    lb := &LoadBalancer{backends: make([]*url.URL, len(backends))}
    
    for i, backend := range backends {
        u, err := url.Parse(backend)
        if err != nil {
            return err
        }
        lb.backends[i] = u
    }

    proxy := &httputil.ReverseProxy{
        Director: func(req *http.Request) {
            target := lb.NextBackend()
            req.URL.Scheme = target.Scheme
            req.URL.Host = target.Host
        },
    }

    g.routes[path] = proxy
    return nil
}
```

## Полный Gateway

```go
type Gateway struct {
    routes       map[string]*httputil.ReverseProxy
    rateLimiter  *RateLimiter
    breakers     map[string]*CircuitBreaker
    mu           sync.RWMutex
}

func NewGateway() *Gateway {
    return &Gateway{
        routes:      make(map[string]*httputil.ReverseProxy),
        rateLimiter: NewRateLimiter(10, 20),
        breakers:    make(map[string]*CircuitBreaker),
    }
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    handler := http.Handler(http.HandlerFunc(g.route))
    handler = g.rateLimiter.Middleware(handler)
    handler = authMiddleware(handler)
    handler = loggingMiddleware(handler)
    handler.ServeHTTP(w, r)
}

func (g *Gateway) route(w http.ResponseWriter, r *http.Request) {
    for path, proxy := range g.routes {
        if strings.HasPrefix(r.URL.Path, path) {
            breaker := g.getBreaker(path)
            err := breaker.Call(func() error {
                proxy.ServeHTTP(w, r)
                return nil
            })
            if err != nil {
                http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
            }
            return
        }
    }
    http.Error(w, "Not found", http.StatusNotFound)
}

func main() {
    gateway := NewGateway()
    
    gateway.AddLoadBalancedRoute("/users", []string{
        "http://localhost:8001",
        "http://localhost:8002",
    })
    
    gateway.AddRoute("/orders", "http://localhost:8003")
    gateway.AddRoute("/payments", "http://localhost:8004")

    log.Fatal(http.ListenAndServe(":8080", gateway))
}
```

## Мониторинг

```go
func metricsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        recorder := &responseRecorder{ResponseWriter: w, statusCode: http.StatusOK}
        next.ServeHTTP(recorder, r)
        
        duration := time.Since(start)
        
        log.Printf("method=%s path=%s status=%d duration=%v",
            r.Method, r.URL.Path, recorder.statusCode, duration)
    })
}

type responseRecorder struct {
    http.ResponseWriter
    statusCode int
}

func (r *responseRecorder) WriteHeader(code int) {
    r.statusCode = code
    r.ResponseWriter.WriteHeader(code)
}
```

## Заключение

API Gateway централизует сквозную функциональность:

- Аутентификация и авторизация
- Rate limiting
- Load balancing
- Circuit breaking
- Агрегация запросов
- Мониторинг

В продакшене рассмотрите Kong, Traefik или AWS API Gateway. Для кастомных нужд Go позволяет легко построить свой.

Дополнительные ресурсы:

- [Building an API Gateway in Go](https://medium.com/swlh/building-an-api-gateway-in-go-1e3f2f4f4f4b)
- [Go Reverse Proxy Example](https://golang.org/pkg/net/http/httputil/#NewSingleHostReverseProxy)
- [Microservices Patterns by Chris Richardson](https://microservices.io/patterns/apigateway.html)
