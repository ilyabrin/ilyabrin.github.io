---
title: "Graceful Shutdown в Go: корректная остановка сервиса под нагрузкой"
date: 2025-12-23T10:00:00Z
draft: false
tags: ["golang", "graceful-shutdown", "kubernetes", "production", "reliability"]
categories: ["Go", "Production"]
description: "Практическое руководство по реализации graceful shutdown в Go приложениях с примерами для PostgreSQL, Redis, HTTP серверов и Kubernetes окружения."
---

В production окружении, особенно в Kubernetes, сервисы постоянно останавливаются и запускаются: деплой новых версий, масштабирование, переключение нод. Некорректная остановка приводит к потерянным запросам, неотправленным данным и рассинхронизированному состоянию.

Graceful shutdown - это не просто обработка SIGTERM. Это комплексная стратегия завершения работы, которая гарантирует:

- Завершение обработки активных запросов
- Корректное закрытие соединений с БД и кэшами
- Сохранение промежуточных результатов
- Отправку всех метрик и логов

Давайте разберем, как реализовать это правильно.

<!--more-->

## Базовая концепция

**Жизненный цикл graceful shutdown:**

```sh
SIGTERM получен -> Прекратить прием новых запросов ->
Завершить активные запросы -> Закрыть соединения ->
Сбросить буферы -> Выход
```

**Ключевые принципы:**

- **Не принимать новые запросы** после получения сигнала
- **Дождаться завершения** активных операций (с таймаутом)
- **Закрыть ресурсы** в правильном порядке
- **Не потерять данные** в буферах или очередях

## Проблема: наивная остановка

### Что обычно делают неправильно

```go
func main() {
    http.HandleFunc("/api", handleRequest)

    // Наивный подход - просто запустить сервер
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

**Что происходит при SIGTERM:**

1. Процесс немедленно завершается
2. Активные HTTP запросы обрываются на середине
3. Соединения с PostgreSQL закрываются грязно
4. Транзакции могут остаться незакоммиченными
5. Клиенты получают connection reset by peer

**В production это означает:**

- 500 ошибки для пользователей
- Потерянные данные
- Необходимость ручного восстановления состояния
- Проблемы с идемпотентностью операций

## Решение 1: Базовый HTTP сервер

### Минимальная реализация graceful shutdown

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
    // Создать HTTP сервер
    srv := &http.Server{
        Addr:    ":8080",
        Handler: setupRoutes(),
    }

    // Канал для сигналов остановки
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    // Запустить сервер в отдельной горутине
    go func() {
        log.Println("Сервер запущен на :8080")
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Ошибка сервера: %v", err)
        }
    }()

    // Ждать сигнал остановки
    <-stop
    log.Println("Получен сигнал остановки, завершаем работу...")

    // Создать контекст с таймаутом для shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Graceful shutdown
    if err := srv.Shutdown(ctx); err != nil {
        log.Printf("Ошибка при остановке сервера: %v", err)
    }

    log.Println("Сервер остановлен")
}

func setupRoutes() http.Handler {
    mux := http.NewServeMux()

    mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
        // Имитация долгой обработки
        time.Sleep(5 * time.Second)
        w.Write([]byte(`{"status":"ok"}`))
    })

    return mux
}
```

**Что происходит при SIGTERM:**

1. Сервер прекращает принимать новые соединения
2. Ждет завершения активных запросов (до 30 секунд)
3. Закрывает все idle соединения
4. Корректно завершает работу

## Решение 2: HTTP сервер + PostgreSQL + Redis

### Production-ready реализация

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
    // Инициализация PostgreSQL пула
    dbPool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
    if err != nil {
        return nil, fmt.Errorf("не удалось подключиться к БД: %w", err)
    }

    // Инициализация Redis клиента
    redisClient := redis.NewClient(&redis.Options{
        Addr: os.Getenv("REDIS_ADDR"),
    })

    app := &Application{
        db:       dbPool,
        cache:    redisClient,
        shutdown: make(chan struct{}),
    }

    // Настройка HTTP сервера
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
    // Проверить, не начался ли shutdown
    select {
    case <-app.shutdown:
        http.Error(w, "Service is shutting down", http.StatusServiceUnavailable)
        return
    default:
    }

    // Увеличить счетчик активных запросов
    app.wg.Add(1)
    defer app.wg.Done()

    ctx := r.Context()
    userID := r.URL.Query().Get("id")

    // Попробовать получить из кэша
    cacheKey := fmt.Sprintf("user:%s", userID)
    cached, err := app.cache.Get(ctx, cacheKey).Result()
    if err == nil {
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(cached))
        return
    }

    // Получить из базы данных
    var userData string
    query := "SELECT data FROM users WHERE id = $1"
    err = app.db.QueryRow(ctx, query, userID).Scan(&userData)
    if err != nil {
        http.Error(w, "User not found", http.StatusNotFound)
        return
    }

    // Сохранить в кэш
    app.cache.Set(ctx, cacheKey, userData, 5*time.Minute)

    w.Header().Set("Content-Type", "application/json")
    w.Write([]byte(userData))
}

func (app *Application) handleHealth(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func (app *Application) handleReady(w http.ResponseWriter, r *http.Request) {
    // Проверить готовность компонентов
    select {
    case <-app.shutdown:
        // Сервис в процессе остановки - не готов
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    default:
    }

    // Проверить подключение к БД
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    if err := app.db.Ping(ctx); err != nil {
        http.Error(w, "Database not ready", http.StatusServiceUnavailable)
        return
    }

    // Проверить Redis
    if err := app.cache.Ping(ctx).Err(); err != nil {
        http.Error(w, "Cache not ready", http.StatusServiceUnavailable)
        return
    }

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Ready"))
}

func (app *Application) Run() error {
    // Канал для сигналов остановки
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    // Запустить HTTP сервер
    go func() {
        log.Println("Сервер запущен на :8080")
        if err := app.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Ошибка сервера: %v", err)
        }
    }()

    // Ждать сигнал остановки
    <-stop
    log.Println("Получен SIGTERM, начинаем graceful shutdown...")

    return app.Shutdown()
}

func (app *Application) Shutdown() error {
    // Закрыть канал shutdown чтобы новые запросы не принимались
    close(app.shutdown)

    // Создать контекст с таймаутом для всего процесса shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Канал для отслеживания ошибок
    errChan := make(chan error, 3)

    // 1. Остановить HTTP сервер (прекратить прием новых запросов)
    go func() {
        log.Println("Останавливаем HTTP сервер...")
        errChan <- app.server.Shutdown(ctx)
    }()

    // 2. Дождаться завершения активных запросов
    done := make(chan struct{})
    go func() {
        app.wg.Wait()
        close(done)
    }()

    select {
    case <-done:
        log.Println("Все активные запросы завершены")
    case <-ctx.Done():
        log.Println("Таймаут ожидания активных запросов")
    }

    // 3. Закрыть соединения с PostgreSQL
    log.Println("Закрываем соединения с PostgreSQL...")
    app.db.Close()

    // 4. Закрыть соединения с Redis
    log.Println("Закрываем соединения с Redis...")
    if err := app.cache.Close(); err != nil {
        log.Printf("Ошибка при закрытии Redis: %v", err)
    }

    // Проверить ошибки
    select {
    case err := <-errChan:
        if err != nil {
            return fmt.Errorf("ошибка при shutdown: %w", err)
        }
    default:
    }

    log.Println("Graceful shutdown завершен")
    return nil
}

func main() {
    app, err := NewApplication()
    if err != nil {
        log.Fatalf("Не удалось создать приложение: %v", err)
    }

    if err := app.Run(); err != nil {
        log.Fatalf("Ошибка приложения: %v", err)
    }
}
```

**Ключевые моменты реализации:**

- **sync.WaitGroup** отслеживает активные запросы
- **shutdown канал** сигнализирует о начале остановки
- **Readiness probe** возвращает 503 во время shutdown
- **Последовательное закрытие** ресурсов
- **Таймауты** предотвращают бесконечное ожидание

## Решение 3: Background Workers + Job Queue

### Остановка фоновых воркеров

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
        jobs:     make(chan Job, 100), // Буферизованный канал
    }
}

func (wp *WorkerPool) Start(ctx context.Context) {
    log.Printf("Запускаем %d воркеров", wp.workers)

    // Запустить воркеры
    for i := 0; i < wp.workers; i++ {
        wp.wg.Add(1)
        go wp.worker(i)
    }

    // Запустить fetcher задач
    wp.wg.Add(1)
    go wp.fetchJobs(ctx)
}

func (wp *WorkerPool) worker(id int) {
    defer wp.wg.Done()

    log.Printf("Воркер %d запущен", id)

    for {
        select {
        case <-wp.shutdown:
            log.Printf("Воркер %d: получен сигнал остановки", id)
            return

        case job, ok := <-wp.jobs:
            if !ok {
                log.Printf("Воркер %d: канал задач закрыт", id)
                return
            }

            wp.processJob(id, job)
        }
    }
}

func (wp *WorkerPool) processJob(workerID int, job Job) {
    log.Printf("Воркер %d обрабатывает задачу %d", workerID, job.ID)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Начать транзакцию
    tx, err := wp.db.Begin(ctx)
    if err != nil {
        log.Printf("Ошибка начала транзакции: %v", err)
        return
    }
    defer tx.Rollback(ctx)

    // Обработать задачу
    err = wp.executeJob(ctx, job)

    // Обновить статус в БД
    if err != nil {
        _, err = tx.Exec(ctx, `
            UPDATE jobs
            SET status = 'failed', error = $1, completed_at = now()
            WHERE id = $2
        `, err.Error(), job.ID)

        log.Printf("Воркер %d: задача %d завершилась с ошибкой: %v", workerID, job.ID, err)
    } else {
        _, err = tx.Exec(ctx, `
            UPDATE jobs
            SET status = 'completed', completed_at = now()
            WHERE id = $1
        `, job.ID)

        log.Printf("Воркер %d: задача %d успешно завершена", workerID, job.ID)
    }

    // Закоммитить транзакцию
    if err := tx.Commit(ctx); err != nil {
        log.Printf("Ошибка коммита транзакции: %v", err)
    }
}

func (wp *WorkerPool) executeJob(ctx context.Context, job Job) error {
    // Имитация обработки задачи
    select {
    case <-time.After(5 * time.Second):
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

func (wp *WorkerPool) fetchJobs(ctx context.Context) {
    defer wp.wg.Done()
    defer close(wp.jobs) // Закрыть канал при выходе

    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-wp.shutdown:
            log.Println("Fetcher: получен сигнал остановки, прекращаем получение задач")
            return

        case <-ticker.C:
            wp.pollPendingJobs(ctx)
        }
    }
}

func (wp *WorkerPool) pollPendingJobs(ctx context.Context) {
    // Получить pending задачи
    rows, err := wp.db.Query(ctx, `
        SELECT id, job_type, payload
        FROM jobs
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    `)
    if err != nil {
        log.Printf("Ошибка при получении задач: %v", err)
        return
    }
    defer rows.Close()

    for rows.Next() {
        var job Job
        if err := rows.Scan(&job.ID, &job.Type, &job.Payload); err != nil {
            log.Printf("Ошибка сканирования задачи: %v", err)
            continue
        }

        // Попробовать отправить задачу в канал (неблокирующая отправка)
        select {
        case wp.jobs <- job:
            // Успешно отправлено
        case <-wp.shutdown:
            // Shutdown начался, прекратить
            return
        default:
            // Канал полон, пропустить эту итерацию
            log.Println("Канал задач полон, пропускаем...")
            return
        }
    }
}

func (wp *WorkerPool) Shutdown(timeout time.Duration) error {
    log.Println("Останавливаем worker pool...")

    // Сигнализировать о shutdown
    close(wp.shutdown)

    // Создать канал для результата
    done := make(chan struct{})
    go func() {
        wp.wg.Wait()
        close(done)
    }()

    // Ждать завершения с таймаутом
    select {
    case <-done:
        log.Println("Все воркеры завершены gracefully")
        return nil
    case <-time.After(timeout):
        return fmt.Errorf("таймаут ожидания завершения воркеров")
    }
}
```

**Ключевые моменты:**

- **Буферизованный канал задач** предотвращает потерю задач
- **FOR UPDATE SKIP LOCKED** для атомарного захвата задач
- **Неблокирующая отправка** в канал через select
- **Graceful завершение** незаконченных задач с таймаутом

## Kubernetes Integration

### Правильная конфигурация Deployment

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

        # Liveness probe - перезапустить если не отвечает
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 2
          failureThreshold: 3

        # Readiness probe - убрать из балансировки если не готов
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
              # Подождать перед отправкой SIGTERM
              # Дать время kube-proxy обновить iptables
              command: ["/bin/sh", "-c", "sleep 5"]

        # Ресурсы
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

      # Graceful shutdown period
      # Должен быть больше чем таймаут в приложении
      terminationGracePeriodSeconds: 60
```

**Sequence диаграмма Kubernetes shutdown:**

```sh
1. kubectl delete pod/rolling update
   ↓
2. Pod переходит в Terminating
   ↓
3. Endpoints удаляются из Service
   ↓
4. preStop hook выполняется (sleep 5)
   ↓
5. SIGTERM отправляется в контейнер
   ↓
6. Приложение начинает graceful shutdown
   ↓
7. /ready возвращает 503 (readiness probe fails)
   ↓
8. Активные запросы завершаются
   ↓
9. Соединения закрываются
   ↓
10. Процесс завершается
   ↓
11. Если не завершился за terminationGracePeriodSeconds
    -> SIGKILL (force kill)
```

## Решение 4: Комплексное приложение

### Production-ready шаблон

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
    // Инициализация компонентов
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

    // Инициализация worker pool
    svc.workerPool = NewWorkerPool(dbPool, 5)

    // Настройка HTTP сервера
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

    // Обернуть все handlers в middleware
    mux.HandleFunc("/api/", s.middleware(s.handleAPI))
    mux.HandleFunc("/health", s.handleHealth)
    mux.HandleFunc("/ready", s.handleReady)

    return mux
}

func (s *Service) middleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Проверить shutdown
        s.shutdownMu.RLock()
        if s.isShutdown {
            s.shutdownMu.RUnlock()
            http.Error(w, "Service is shutting down", http.StatusServiceUnavailable)
            return
        }
        s.shutdownMu.RUnlock()

        // Увеличить счетчик активных запросов
        s.activeReqs.Add(1)
        defer s.activeReqs.Done()

        next(w, r)
    }
}

func (s *Service) handleAPI(w http.ResponseWriter, r *http.Request) {
    // Бизнес-логика
    time.Sleep(2 * time.Second) // Имитация работы
    w.Write([]byte(`{"status":"ok"}`))
}

func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
    // Health check - всегда OK если процесс жив
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    // Readiness check - проверить компоненты
    s.shutdownMu.RLock()
    shuttingDown := s.isShutdown
    s.shutdownMu.RUnlock()

    if shuttingDown {
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    }

    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    // Проверить БД
    if err := s.db.Ping(ctx); err != nil {
        http.Error(w, "Database unhealthy", http.StatusServiceUnavailable)
        return
    }

    // Проверить Redis
    if err := s.cache.Ping(ctx).Err(); err != nil {
        http.Error(w, "Cache unhealthy", http.StatusServiceUnavailable)
        return
    }

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Ready"))
}

func (s *Service) Run() error {
    // Запустить worker pool
    s.workerPool.Start(context.Background())

    // Запустить HTTP сервер
    go func() {
        log.Printf("Сервер запущен на %s", s.server.Addr)
        if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("HTTP сервер ошибка: %v", err)
        }
    }()

    // Ждать сигнал остановки
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

    sig := <-stop
    log.Printf("Получен сигнал %v, начинаем graceful shutdown", sig)

    return s.Shutdown()
}

func (s *Service) Shutdown() error {
    // Отметить, что начался shutdown
    s.shutdownMu.Lock()
    s.isShutdown = true
    close(s.shutdownCh)
    s.shutdownMu.Unlock()

    // Общий таймаут для shutdown (должен быть меньше terminationGracePeriodSeconds)
    ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
    defer cancel()

    var wg sync.WaitGroup
    errChan := make(chan error, 3)

    // 1. Остановить HTTP сервер (прекратить прием новых запросов)
    wg.Add(1)
    go func() {
        defer wg.Done()
        log.Println("Останавливаем HTTP сервер...")

        shutdownCtx, shutdownCancel := context.WithTimeout(ctx, 30*time.Second)
        defer shutdownCancel()

        if err := s.server.Shutdown(shutdownCtx); err != nil {
            errChan <- fmt.Errorf("HTTP shutdown: %w", err)
        } else {
            log.Println("HTTP сервер остановлен")
        }
    }()

    // 2. Дождаться завершения активных HTTP запросов
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
            log.Println("Все HTTP запросы завершены")
        case <-ctx.Done():
            log.Println("Таймаут ожидания HTTP запросов")
        }
    }()

    // 3. Остановить worker pool
    wg.Add(1)
    go func() {
        defer wg.Done()
        if err := s.workerPool.Shutdown(30 * time.Second); err != nil {
            errChan <- fmt.Errorf("worker pool shutdown: %w", err)
        }
    }()

    // Ждать завершения всех операций shutdown
    shutdownDone := make(chan struct{})
    go func() {
        wg.Wait()
        close(shutdownDone)
    }()

    select {
    case <-shutdownDone:
        log.Println("Все компоненты остановлены")
    case <-ctx.Done():
        log.Println("Таймаут общего shutdown")
    }

    // 4. Закрыть соединения с БД
    log.Println("Закрываем соединения с PostgreSQL...")
    s.db.Close()

    // 5. Закрыть Redis
    log.Println("Закрываем соединения с Redis...")
    if err := s.cache.Close(); err != nil {
        log.Printf("Ошибка закрытия Redis: %v", err)
    }

    // Проверить ошибки
    close(errChan)
    for err := range errChan {
        if err != nil {
            log.Printf("Ошибка при shutdown: %v", err)
        }
    }

    log.Println("Graceful shutdown завершен успешно")
    return nil
}

func initDatabase() (*pgxpool.Pool, error) {
    config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
    if err != nil {
        return nil, err
    }

    // Настройки пула
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
        log.Fatalf("Не удалось создать сервис: %v", err)
    }

    if err := service.Run(); err != nil {
        log.Fatalf("Ошибка запуска сервиса: %v", err)
    }
}
```

## Лучшие практики

### 1. Таймауты

```go
const (
    // HTTP shutdown timeout
    HTTPShutdownTimeout = 30 * time.Second

    // Worker completion timeout
    WorkerShutdownTimeout = 30 * time.Second

    // Overall shutdown timeout (должен быть < terminationGracePeriodSeconds)
    OverallShutdownTimeout = 50 * time.Second
)
```

### 2. Логирование

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

### 3. Метрики

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

    // ... shutdown логика
}
```

### 4. Тестирование Graceful Shutdown

```go
func TestGracefulShutdown(t *testing.T) {
    svc, err := NewService()
    require.NoError(t, err)

    // Запустить сервис
    go svc.Run()

    // Подождать старта
    time.Sleep(100 * time.Millisecond)

    // Начать долгий запрос
    reqDone := make(chan bool)
    go func() {
        resp, err := http.Get("http://localhost:8080/api/slow")
        require.NoError(t, err)
        require.Equal(t, http.StatusOK, resp.StatusCode)
        close(reqDone)
    }()

    // Подождать начала обработки
    time.Sleep(50 * time.Millisecond)

    // Инициировать shutdown
    shutdownDone := make(chan bool)
    go func() {
        svc.Shutdown()
        close(shutdownDone)
    }()

    // Убедиться, что запрос завершился корректно
    select {
    case <-reqDone:
        t.Log("Запрос завершился успешно")
    case <-time.After(35 * time.Second):
        t.Fatal("Запрос не завершился вовремя")
    }

    // Убедиться, что shutdown завершился
    select {
    case <-shutdownDone:
        t.Log("Shutdown завершился успешно")
    case <-time.After(60 * time.Second):
        t.Fatal("Shutdown не завершился вовремя")
    }
}
```

## Распространенные ошибки

### Ошибка 1: Забыть про active connections

```go
// ПЛОХО: просто закрыть сервер
srv.Close() // Обрывает активные соединения

// ХОРОШО: graceful shutdown
srv.Shutdown(ctx) // Ждет завершения активных запросов
```

### Ошибка 2: Слишком короткий таймаут

```go
// ПЛОХО: слишком короткий таймаут
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)

// ХОРОШО: достаточный таймаут
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
```

### Ошибка 3: Не обновить readiness probe

```go
// ПЛОХО: readiness всегда возвращает OK
func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
}

// ХОРОШО: проверить shutdown state
func (s *Service) handleReady(w http.ResponseWriter, r *http.Request) {
    if s.isShutdown {
        http.Error(w, "Shutting down", http.StatusServiceUnavailable)
        return
    }
    w.WriteHeader(http.StatusOK)
}
```

### Ошибка 4: Игнорировать order of shutdown

```go
// ПЛОХО: закрыть БД до завершения запросов
db.Close()
server.Shutdown(ctx) // Запросы получат ошибки БД

// ХОРОШО: правильный порядок
server.Shutdown(ctx)  // Сначала остановить прием запросов
activeReqs.Wait()     // Дождаться завершения
db.Close()            // Потом закрыть ресурсы
```

## Заключение

Graceful shutdown - критически важная часть production-ready Go приложения. Правильная реализация обеспечивает:

- **Нулевой downtime** при деплоях
- **Отсутствие потерянных запросов**
- **Корректное завершение транзакций**
- **Надежное закрытие соединений**

**Ключевые принципы:**

1. Прекратить прием новых запросов сразу
2. Дождаться завершения активных операций
3. Закрыть ресурсы в правильном порядке
4. Использовать таймауты везде
5. Обновлять readiness probe
6. Логировать все фазы shutdown
7. Тестировать graceful shutdown

**В Kubernetes:**

- Установить правильный `terminationGracePeriodSeconds`
- Использовать `preStop` hook для задержки
- Реализовать `/ready` endpoint корректно
- Учитывать время обновления endpoints

Начните с базовой реализации и постепенно добавляйте сложность. Graceful shutdown - это инвестиция в надежность вашего сервиса!

## Дополнительные ресурсы

- [Go net/http Shutdown Documentation](https://pkg.go.dev/net/http#Server.Shutdown)
- [Kubernetes Graceful Termination](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#hook-details)
- [PostgreSQL Connection Pooling in Go](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool)
- [Redis Client for Go](https://pkg.go.dev/github.com/redis/go-redis/v9)
- [Prometheus Client for Go](https://pkg.go.dev/github.com/prometheus/client_golang/prometheus)

---

*Реализовали graceful shutdown в production? Поделитесь своим опытом и кейсами!*
