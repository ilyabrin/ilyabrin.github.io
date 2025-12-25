---
title: "Graceful Shutdown in Go: Properly Stopping Services Under Load"
date: 2025-12-23T10:00:00Z
draft: false
tags: ["golang", "graceful-shutdown", "kubernetes", "production", "reliability"]
categories: ["Go", "Production"]
description: "Practical guide to implementing graceful shutdown in Go applications with examples for PostgreSQL, Redis, HTTP servers, and Kubernetes environments."
---

In production environments, especially in Kubernetes, services are constantly being stopped and started: deploying new versions, scaling, node switching. Improper shutdown leads to lost requests, unsent data, and desynchronized state.

Graceful shutdown is not just handling SIGTERM. It's a comprehensive termination strategy that guarantees:

- Completion of active request processing
- Proper closure of database and cache connections
- Saving intermediate results
- Sending all metrics and logs

Let's explore how to implement this correctly.

<!--more-->

## Basic Concept

**Graceful shutdown lifecycle:**

```sh
SIGTERM received -> Stop accepting new requests ->
Complete active requests -> Close connections ->
Flush buffers -> Exit
```

**Key principles:**

- **Don't accept new requests** after receiving signal
- **Wait for completion** of active operations (with timeout)
- **Close resources** in the correct order
- **Don't lose data** in buffers or queues

## The Problem: Naive Shutdown

### What's Usually Done Wrong

```go
func main() {
    http.HandleFunc("/api", handleRequest)

    // Naive approach - just start the server
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

**What happens on SIGTERM:**

1. Process terminates immediately
2. Active HTTP requests are cut off mid-processing
3. PostgreSQL connections are closed dirty
4. Transactions may remain uncommitted
5. Clients receive connection reset by peer

**In production this means:**

- 500 errors for users
- Lost data
- Need for manual state recovery
- Idempotency issues

## Solution 1: Basic HTTP Server

### Minimal Graceful Shutdown Implementation

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    // Create HTTP server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: setupRoutes(),
    }

    // Channel for shutdown signals
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    // Start server in separate goroutine
    go func() {
        log.Println("Server started on :8080")
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Server error: %v", err)
        }
    }()

    // Wait for shutdown signal
    <-stop
    log.Println("Shutdown signal received, gracefully shutting down...")

    // Create context with timeout for shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Graceful shutdown
    if err := srv.Shutdown(ctx); err != nil {
        log.Printf("Server shutdown error: %v", err)
    }

    log.Println("Server stopped")
}

func setupRoutes() http.Handler {
    mux := http.NewServeMux()

    mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
        // Simulate long processing
        time.Sleep(5 * time.Second)
        w.Write([]byte(`{"status":"ok"}`))
    })

    return mux
}
```

**What happens on SIGTERM:**

1. Server stops accepting new connections
2. Waits for active requests to complete (up to 30 seconds)
3. Closes all idle connections
4. Terminates gracefully

## Solution 2: HTTP Server + PostgreSQL + Redis

### Production-Ready Implementation

```go
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"
    "sync"
    "syscall"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/redis/go-redis/v9"
)

type Application struct {
    server   *http.Server
    db       *pgxpool.Pool
    cache    *redis.Client
    wg       sync.WaitGroup
    shutdown chan struct{}
}

func NewApplication() (*Application, error) {
    // Initialize PostgreSQL pool
    dbPool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
    if err != nil {
        return nil, fmt.Errorf("failed to connect to database: %w", err)
    }

    // Initialize Redis client
    redisClient := redis.NewClient(&redis.Options{
        Addr: os.Getenv("REDIS_ADDR"),
    })

    app := &Application{
        db:       dbPool,
        cache:    redisClient,
        shutdown: make(chan struct{}),
    }

    // Setup HTTP server
    app.server = &http.Server{
        Addr:         ":8080",
        Handler:      app.setupRoutes(),
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    return app, nil
}

func (app *Application) setupRoutes() http.Handler {
    mux := http.NewServeMux()

    mux.HandleFunc("/api/user", app.handleGetUser)
    mux.HandleFunc("/health", app.handleHealth)
    mux.HandleFunc("/ready", app.handleReady)

    return mux
}

func (app *Application) handleGetUser(w http.ResponseWriter, r *http.Request) {
    // Check if shutdown has started
    select {
    case <-app.shutdown:
        http.Error(w, "Service is shutting down", http.StatusServiceUnavailable)
        return
    default:
    }

    // Increment active request counter
    app.wg.Add(1)
    defer app.wg.Done()

    ctx := r.Context()
    userID := r.URL.Query().Get("id")

    // Try to get from cache
    cacheKey := fmt.Sprintf("user:%s", userID)
    cached, err := app.cache.Get(ctx, cacheKey).Result()
    if err == nil {
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(cached))
        return
    }

    // Get from database
    var userData string
    query := "SELECT data FROM users WHERE id = $1"
    err = app.db.QueryRow(ctx, query, userID).Scan(&userData)
    if err != nil {
        http.Error(w, "User not found", http.StatusNotFound)
        return
    }

    // Save to cache
    app.cache.Set(ctx, cacheKey, userData, 5*time.Minute)

    w.Header().Set("Content-Type", "application/json")
    w.Write([]byte(userData))
}

func (app *Application) handleHealth(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func (app *Application) handleReady(w http.ResponseWriter, r *http.Request) {
    // Check component readiness
    select {
    case <-app.shutdown:
        // Service is shutting down - not ready
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    default:
    }

    // Check database connection
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    if err := app.db.Ping(ctx); err != nil {
        http.Error(w, "Database not ready", http.StatusServiceUnavailable)
        return
    }

    // Check Redis
    if err := app.cache.Ping(ctx).Err(); err != nil {
        http.Error(w, "Cache not ready", http.StatusServiceUnavailable)
        return
    }

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Ready"))
}

func (app *Application) Run() error {
    // Channel for shutdown signals
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    // Start HTTP server
    go func() {
        log.Println("Server started on :8080")
        if err := app.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Server error: %v", err)
        }
    }()

    // Wait for shutdown signal
    <-stop
    log.Println("SIGTERM received, starting graceful shutdown...")

    return app.Shutdown()
}

func (app *Application) Shutdown() error {
    // Close shutdown channel so new requests are rejected
    close(app.shutdown)

    // Create context with timeout for entire shutdown process
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Channel for tracking errors
    errChan := make(chan error, 3)

    // 1. Stop HTTP server (stop accepting new requests)
    go func() {
        log.Println("Stopping HTTP server...")
        errChan <- app.server.Shutdown(ctx)
    }()

    // 2. Wait for active requests to complete
    done := make(chan struct{})
    go func() {
        app.wg.Wait()
        close(done)
    }()

    select {
    case <-done:
        log.Println("All active requests completed")
    case <-ctx.Done():
        log.Println("Active requests wait timeout")
    }

    // 3. Close PostgreSQL connections
    log.Println("Closing PostgreSQL connections...")
    app.db.Close()

    // 4. Close Redis connections
    log.Println("Closing Redis connections...")
    if err := app.cache.Close(); err != nil {
        log.Printf("Redis close error: %v", err)
    }

    // Check errors
    select {
    case err := <-errChan:
        if err != nil {
            return fmt.Errorf("shutdown error: %w", err)
        }
    default:
    }

    log.Println("Graceful shutdown completed")
    return nil
}

func main() {
    app, err := NewApplication()
    if err != nil {
        log.Fatalf("Failed to create application: %v", err)
    }

    if err := app.Run(); err != nil {
        log.Fatalf("Application error: %v", err)
    }
}
```

**Key implementation points:**

- **sync.WaitGroup** tracks active requests
- **shutdown channel** signals shutdown start
- **Readiness probe** returns 503 during shutdown
- **Sequential resource closure**
- **Timeouts** prevent infinite waiting

## Solution 3: Background Workers + Job Queue

### Stopping Background Workers

```go
type WorkerPool struct {
    db       *pgxpool.Pool
    workers  int
    wg       sync.WaitGroup
    shutdown chan struct{}
    jobs     chan Job
}

type Job struct {
    ID      int
    Type    string
    Payload []byte
}

func NewWorkerPool(db *pgxpool.Pool, workerCount int) *WorkerPool {
    return &WorkerPool{
        db:       db,
        workers:  workerCount,
        shutdown: make(chan struct{}),
        jobs:     make(chan Job, 100), // Buffered channel
    }
}

func (wp *WorkerPool) Start(ctx context.Context) {
    log.Printf("Starting %d workers", wp.workers)

    // Start workers
    for i := 0; i < wp.workers; i++ {
        wp.wg.Add(1)
        go wp.worker(i)
    }

    // Start job fetcher
    wp.wg.Add(1)
    go wp.fetchJobs(ctx)
}

func (wp *WorkerPool) worker(id int) {
    defer wp.wg.Done()

    log.Printf("Worker %d started", id)

    for {
        select {
        case <-wp.shutdown:
            log.Printf("Worker %d: shutdown signal received", id)
            return

        case job, ok := <-wp.jobs:
            if !ok {
                log.Printf("Worker %d: jobs channel closed", id)
                return
            }

            wp.processJob(id, job)
        }
    }
}

func (wp *WorkerPool) processJob(workerID int, job Job) {
    log.Printf("Worker %d processing job %d", workerID, job.ID)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Begin transaction
    tx, err := wp.db.Begin(ctx)
    if err != nil {
        log.Printf("Transaction start error: %v", err)
        return
    }
    defer tx.Rollback(ctx)

    // Process job
    err = wp.executeJob(ctx, job)

    // Update status in DB
    if err != nil {
        _, err = tx.Exec(ctx, `
            UPDATE jobs
            SET status = 'failed', error = $1, completed_at = now()
            WHERE id = $2
        `, err.Error(), job.ID)

        log.Printf("Worker %d: job %d failed with error: %v", workerID, job.ID, err)
    } else {
        _, err = tx.Exec(ctx, `
            UPDATE jobs
            SET status = 'completed', completed_at = now()
            WHERE id = $1
        `, job.ID)

        log.Printf("Worker %d: job %d completed successfully", workerID, job.ID)
    }

    // Commit transaction
    if err := tx.Commit(ctx); err != nil {
        log.Printf("Transaction commit error: %v", err)
    }
}

func (wp *WorkerPool) executeJob(ctx context.Context, job Job) error {
    // Simulate job processing
    select {
    case <-time.After(5 * time.Second):
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

func (wp *WorkerPool) fetchJobs(ctx context.Context) {
    defer wp.wg.Done()
    defer close(wp.jobs) // Close channel on exit

    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-wp.shutdown:
            log.Println("Fetcher: shutdown signal received, stopping job fetch")
            return

        case <-ticker.C:
            wp.pollPendingJobs(ctx)
        }
    }
}

func (wp *WorkerPool) pollPendingJobs(ctx context.Context) {
    // Get pending jobs
    rows, err := wp.db.Query(ctx, `
        SELECT id, job_type, payload
        FROM jobs
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    `)
    if err != nil {
        log.Printf("Error fetching jobs: %v", err)
        return
    }
    defer rows.Close()

    for rows.Next() {
        var job Job
        if err := rows.Scan(&job.ID, &job.Type, &job.Payload); err != nil {
            log.Printf("Job scan error: %v", err)
            continue
        }

        // Try to send job to channel (non-blocking send)
        select {
        case wp.jobs <- job:
            // Successfully sent
        case <-wp.shutdown:
            // Shutdown started, stop
            return
        default:
            // Channel full, skip this iteration
            log.Println("Jobs channel full, skipping...")
            return
        }
    }
}

func (wp *WorkerPool) Shutdown(timeout time.Duration) error {
    log.Println("Stopping worker pool...")

    // Signal shutdown
    close(wp.shutdown)

    // Create channel for result
    done := make(chan struct{})
    go func() {
        wp.wg.Wait()
        close(done)
    }()

    // Wait for completion with timeout
    select {
    case <-done:
        log.Println("All workers terminated gracefully")
        return nil
    case <-time.After(timeout):
        return fmt.Errorf("worker termination timeout")
    }
}
```

**Key points:**

- **Buffered job channel** prevents job loss
- **FOR UPDATE SKIP LOCKED** for atomic job claiming
- **Non-blocking send** to channel via select
- **Graceful completion** of unfinished jobs with timeout

## Kubernetes Integration

### Proper Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: my-service:latest
        ports:
        - containerPort: 8080

        # Liveness probe - restart if not responding
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 2
          failureThreshold: 3

        # Readiness probe - remove from load balancing if not ready
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 2
          failureThreshold: 2

        # Lifecycle hooks
        lifecycle:
          preStop:
            exec:
              # Wait before sending SIGTERM
              # Give kube-proxy time to update iptables
              command: ["/bin/sh", "-c", "sleep 5"]

        # Resources
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

      # Graceful shutdown period
      # Should be larger than application timeout
      terminationGracePeriodSeconds: 60
```

**Kubernetes shutdown sequence diagram:**

```sh
1. kubectl delete pod/rolling update
   ↓
2. Pod enters Terminating state
   ↓
3. Endpoints removed from Service
   ↓
4. preStop hook executes (sleep 5)
   ↓
5. SIGTERM sent to container
   ↓
6. Application starts graceful shutdown
   ↓
7. /ready returns 503 (readiness probe fails)
   ↓
8. Active requests complete
   ↓
9. Connections close
   ↓
10. Process terminates
   ↓
11. If not terminated within terminationGracePeriodSeconds
    -> SIGKILL (force kill)
```

## Solution 4: Comprehensive Application

### Production-Ready Template

```go
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"
    "sync"
    "syscall"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/redis/go-redis/v9"
)

type Service struct {
    server      *http.Server
    db          *pgxpool.Pool
    cache       *redis.Client
    workerPool  *WorkerPool

    shutdownCh  chan struct{}
    shutdownMu  sync.RWMutex
    isShutdown  bool

    activeReqs  sync.WaitGroup
}

func NewService() (*Service, error) {
    // Initialize components
    dbPool, err := initDatabase()
    if err != nil {
        return nil, err
    }

    redisClient := initRedis()

    svc := &Service{
        db:         dbPool,
        cache:      redisClient,
        shutdownCh: make(chan struct{}),
    }

    // Initialize worker pool
    svc.workerPool = NewWorkerPool(dbPool, 5)

    // Setup HTTP server
    svc.server = &http.Server{
        Addr:              ":8080",
        Handler:           svc.routes(),
        ReadTimeout:       10 * time.Second,
        WriteTimeout:      30 * time.Second,
        IdleTimeout:       120 * time.Second,
        ReadHeaderTimeout: 5 * time.Second,
    }

    return svc, nil
}

func (s *Service) routes() http.Handler {
    mux := http.NewServeMux()

    // Wrap all handlers in middleware
    mux.HandleFunc("/api/", s.middleware(s.handleAPI))
    mux.HandleFunc("/health", s.handleHealth)
    mux.HandleFunc("/ready", s.handleReady)

    return mux
}

func (s *Service) middleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Check shutdown
        s.shutdownMu.RLock()
        if s.isShutdown {
            s.shutdownMu.RUnlock()
            http.Error(w, "Service is shutting down", http.StatusServiceUnavailable)
            return
        }
        s.shutdownMu.RUnlock()

        // Increment active request counter
        s.activeReqs.Add(1)
        defer s.activeReqs.Done()

        next(w, r)
    }
}

func (s *Service) handleAPI(w http.ResponseWriter, r *http.Request) {
    // Business logic
    time.Sleep(2 * time.Second) // Simulate work
    w.Write([]byte(`{"status":"ok"}`))
}

func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
    // Health check - always OK if process is alive
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    // Readiness check - check components
    s.shutdownMu.RLock()
    shuttingDown := s.isShutdown
    s.shutdownMu.RUnlock()

    if shuttingDown {
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    }

    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    // Check DB
    if err := s.db.Ping(ctx); err != nil {
        http.Error(w, "Database unhealthy", http.StatusServiceUnavailable)
        return
    }

    // Check Redis
    if err := s.cache.Ping(ctx).Err(); err != nil {
        http.Error(w, "Cache unhealthy", http.StatusServiceUnavailable)
        return
    }

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Ready"))
}

func (s *Service) Run() error {
    // Start worker pool
    s.workerPool.Start(context.Background())

    // Start HTTP server
    go func() {
        log.Printf("Server started on %s", s.server.Addr)
        if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("HTTP server error: %v", err)
        }
    }()

    // Wait for shutdown signal
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

    sig := <-stop
    log.Printf("Signal %v received, starting graceful shutdown", sig)

    return s.Shutdown()
}

func (s *Service) Shutdown() error {
    // Mark shutdown as started
    s.shutdownMu.Lock()
    s.isShutdown = true
    close(s.shutdownCh)
    s.shutdownMu.Unlock()

    // Overall timeout for shutdown (should be less than terminationGracePeriodSeconds)
    ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
    defer cancel()

    var wg sync.WaitGroup
    errChan := make(chan error, 3)

    // 1. Stop HTTP server (stop accepting new requests)
    wg.Add(1)
    go func() {
        defer wg.Done()
        log.Println("Stopping HTTP server...")

        shutdownCtx, shutdownCancel := context.WithTimeout(ctx, 30*time.Second)
        defer shutdownCancel()

        if err := s.server.Shutdown(shutdownCtx); err != nil {
            errChan <- fmt.Errorf("HTTP shutdown: %w", err)
        } else {
            log.Println("HTTP server stopped")
        }
    }()

    // 2. Wait for active HTTP requests to complete
    wg.Add(1)
    go func() {
        defer wg.Done()

        done := make(chan struct{})
        go func() {
            s.activeReqs.Wait()
            close(done)
        }()

        select {
        case <-done:
            log.Println("All HTTP requests completed")
        case <-ctx.Done():
            log.Println("HTTP requests wait timeout")
        }
    }()

    // 3. Stop worker pool
    wg.Add(1)
    go func() {
        defer wg.Done()
        if err := s.workerPool.Shutdown(30 * time.Second); err != nil {
            errChan <- fmt.Errorf("worker pool shutdown: %w", err)
        }
    }()

    // Wait for all shutdown operations to complete
    shutdownDone := make(chan struct{})
    go func() {
        wg.Wait()
        close(shutdownDone)
    }()

    select {
    case <-shutdownDone:
        log.Println("All components stopped")
    case <-ctx.Done():
        log.Println("Overall shutdown timeout")
    }

    // 4. Close DB connections
    log.Println("Closing PostgreSQL connections...")
    s.db.Close()

    // 5. Close Redis
    log.Println("Closing Redis connections...")
    if err := s.cache.Close(); err != nil {
        log.Printf("Redis close error: %v", err)
    }

    // Check errors
    close(errChan)
    for err := range errChan {
        if err != nil {
            log.Printf("Shutdown error: %v", err)
        }
    }

    log.Println("Graceful shutdown completed successfully")
    return nil
}

func initDatabase() (*pgxpool.Pool, error) {
    config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
    if err != nil {
        return nil, err
    }

    // Pool settings
    config.MaxConns = 25
    config.MinConns = 5
    config.MaxConnLifetime = time.Hour
    config.MaxConnIdleTime = 30 * time.Minute

    return pgxpool.NewWithConfig(context.Background(), config)
}

func initRedis() *redis.Client {
    return redis.NewClient(&redis.Options{
        Addr:         os.Getenv("REDIS_ADDR"),
        PoolSize:     10,
        MinIdleConns: 5,
        MaxRetries:   3,
    })
}

func main() {
    service, err := NewService()
    if err != nil {
        log.Fatalf("Failed to create service: %v", err)
    }

    if err := service.Run(); err != nil {
        log.Fatalf("Service error: %v", err)
    }
}
```

## Best Practices

### 1. Timeouts

```go
const (
    // HTTP shutdown timeout
    HTTPShutdownTimeout = 30 * time.Second

    // Worker completion timeout
    WorkerShutdownTimeout = 30 * time.Second

    // Overall shutdown timeout (should be < terminationGracePeriodSeconds)
    OverallShutdownTimeout = 50 * time.Second
)
```

### 2. Logging

```go
type ShutdownLogger struct {
    startTime time.Time
}

func NewShutdownLogger() *ShutdownLogger {
    return &ShutdownLogger{startTime: time.Now()}
}

func (sl *ShutdownLogger) LogPhase(phase string) {
    elapsed := time.Since(sl.startTime)
    log.Printf("[SHUTDOWN +%v] %s", elapsed.Round(time.Millisecond), phase)
}
```

### 3. Metrics

```go
import "github.com/prometheus/client_golang/prometheus"

var (
    shutdownDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
        Name: "app_shutdown_duration_seconds",
        Help: "Time taken for graceful shutdown",
    })

    activeRequests = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "app_active_requests",
        Help: "Number of active HTTP requests",
    })
)

func (s *Service) Shutdown() error {
    start := time.Now()
    defer func() {
        shutdownDuration.Observe(time.Since(start).Seconds())
    }()

    // ... shutdown logic
}
```

### 4. Testing Graceful Shutdown

```go
func TestGracefulShutdown(t *testing.T) {
    svc, err := NewService()
    require.NoError(t, err)

    // Start service
    go svc.Run()

    // Wait for startup
    time.Sleep(100 * time.Millisecond)

    // Start long request
    reqDone := make(chan bool)
    go func() {
        resp, err := http.Get("http://localhost:8080/api/slow")
        require.NoError(t, err)
        require.Equal(t, http.StatusOK, resp.StatusCode)
        close(reqDone)
    }()

    // Wait for processing to start
    time.Sleep(50 * time.Millisecond)

    // Initiate shutdown
    shutdownDone := make(chan bool)
    go func() {
        svc.Shutdown()
        close(shutdownDone)
    }()

    // Ensure request completed successfully
    select {
    case <-reqDone:
        t.Log("Request completed successfully")
    case <-time.After(35 * time.Second):
        t.Fatal("Request did not complete in time")
    }

    // Ensure shutdown completed
    select {
    case <-shutdownDone:
        t.Log("Shutdown completed successfully")
    case <-time.After(60 * time.Second):
        t.Fatal("Shutdown did not complete in time")
    }
}
```

## Common Mistakes

### Mistake 1: Forgetting About Active Connections

```go
// BAD: just close server
srv.Close() // Aborts active connections

// GOOD: graceful shutdown
srv.Shutdown(ctx) // Waits for active requests to complete
```

### Mistake 2: Too Short Timeout

```go
// BAD: timeout too short
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)

// GOOD: sufficient timeout
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
```

### Mistake 3: Not Updating Readiness Probe

```go
// BAD: readiness always returns OK
func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
}

// GOOD: check shutdown state
func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    if s.isShutdown {
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

### Mistake 4: Ignoring Order of Shutdown

```go
// BAD: close DB before completing requests
db.Close()
server.Shutdown(ctx) // Requests will get DB errors

// GOOD: correct order
server.Shutdown(ctx)  // First stop accepting requests
activeReqs.Wait()     // Wait for completion
db.Close()            // Then close resources
```

## Conclusion

Graceful shutdown is a critically important part of production-ready Go applications. Proper implementation ensures:

- **Zero downtime** during deployments
- **No lost requests**
- **Correct transaction completion**
- **Reliable connection closure**

**Key principles:**

1. Stop accepting new requests immediately
2. Wait for active operations to complete
3. Close resources in the correct order
4. Use timeouts everywhere
5. Update readiness probe
6. Log all shutdown phases
7. Test graceful shutdown

**In Kubernetes:**

- Set correct `terminationGracePeriodSeconds`
- Use `preStop` hook for delay
- Implement `/ready` endpoint correctly
- Account for endpoint update time

Start with a basic implementation and gradually add complexity. Graceful shutdown is an investment in your service's reliability!

## Additional Resources

- [Go net/http Shutdown Documentation](https://pkg.go.dev/net/http#Server.Shutdown)
- [Kubernetes Graceful Termination](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#hook-details)
- [PostgreSQL Connection Pooling with pgx](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool)
- [Redis Go Client Documentation](https://pkg.go.dev/github.com/redis/go-redis/v9)
- [Prometheus Go Client](https://pkg.go.dev/github.com/prometheus/client_golang/prometheus)

---

*Implemented graceful shutdown in production? Share your experience and use cases!*
