---
title: "Singleton Pattern in Go: Implementation and Use Cases"
date: 2025-06-16T10:00:00+03:00
draft: false
tags: ["golang", "patterns", "design-patterns", "singleton", "concurrency"]
categories: ["Patterns"]
---

Singleton is one of the most controversial patterns. Some call it an anti-pattern, others use it everywhere. Let's explore how to properly implement `Singleton` in Go and when it's actually needed.

<!--more-->

## What is Singleton

Singleton ensures a class has only one instance and provides a global point of access to it.

In Go, this means: one instance of a struct for the entire application.

## Naive Implementation

```go
type Database struct {
    connection string
}

var instance *Database

func GetInstance() *Database {
    if instance == nil {
        instance = &Database{
            connection: "postgres://...",
        }
    }
    return instance
}
```

> Problem: not thread-safe. Two goroutines can create two instances.

## Correct Implementation: sync.Once

```go
type Database struct {
    connection string
}

var (
    instance *Database
    once     sync.Once
)

func GetInstance() *Database {
    once.Do(func() {
        instance = &Database{
            connection: "postgres://...",
        }
    })
    return instance
}
```

> sync.Once guarantees the function executes exactly once, even with concurrent access.

## Implementation with Initialization

```go
type Config struct {
    DBHost string
    DBPort int
}

var (
    config *Config
    once   sync.Once
)

func GetConfig() *Config {
    once.Do(func() {
        config = &Config{
            DBHost: os.Getenv("DB_HOST"),
            DBPort: 5432,
        }
    })
    return config
}
```

## Lazy Initialization with Error

```go
type Database struct {
    conn *sql.DB
}

var (
    instance *Database
    once     sync.Once
    initErr  error
)

func GetInstance() (*Database, error) {
    once.Do(func() {
        conn, err := sql.Open("postgres", "...")
        if err != nil {
            initErr = err
            return
        }
        instance = &Database{conn: conn}
    })
    
    if initErr != nil {
        return nil, initErr
    }
    return instance, nil
}
```

## Eager Initialization

```go
type Logger struct {
    level string
}

var instance = &Logger{
    level: "info",
}

func GetLogger() *Logger {
    return instance
}
```

Initialized at program start. Simpler, but no control over creation timing.

## Singleton with Parameters

```go
type Cache struct {
    data map[string]interface{}
    mu   sync.RWMutex
}

var (
    cache *Cache
    once  sync.Once
)

func InitCache(size int) {
    once.Do(func() {
        cache = &Cache{
            data: make(map[string]interface{}, size),
        }
    })
}

func GetCache() *Cache {
    if cache == nil {
        panic("cache not initialized")
    }
    return cache
}
```

## When to Use Singleton

### 1. Application Configuration

```go
type AppConfig struct {
    Port     int
    LogLevel string
    DBUrl    string
}

var (
    config *AppConfig
    once   sync.Once
)

func GetConfig() *AppConfig {
    once.Do(func() {
        config = &AppConfig{
            Port:     getEnvInt("PORT", 8080),
            LogLevel: getEnv("LOG_LEVEL", "info"),
            DBUrl:    getEnv("DB_URL", ""),
        }
    })
    return config
}
```

### 2. Connection Pool

```go
type ConnectionPool struct {
    db *sql.DB
}

var (
    pool *ConnectionPool
    once sync.Once
)

func GetPool() *ConnectionPool {
    once.Do(func() {
        db, err := sql.Open("postgres", GetConfig().DBUrl)
        if err != nil {
            panic(err)
        }
        db.SetMaxOpenConns(25)
        pool = &ConnectionPool{db: db}
    })
    return pool
}
```

### 3. Logger

```go
type Logger struct {
    *log.Logger
}

var (
    logger *Logger
    once   sync.Once
)

func GetLogger() *Logger {
    once.Do(func() {
        logger = &Logger{
            Logger: log.New(os.Stdout, "", log.LstdFlags),
        }
    })
    return logger
}
```

## When NOT to Use Singleton

### 1. For Business Logic

```go
// Bad
type UserService struct {
    repo UserRepository
}

var userService *UserService

// Good - use DI
func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}
```

### 2. For Testable Code

```go
// Bad - impossible to mock in tests
func ProcessUser(id string) {
    db := GetDatabase()
    // ...
}

// Good - explicit dependency
func ProcessUser(db *Database, id string) {
    // ...
}
```

### 3. For State

```go
// Bad - global state
type Counter struct {
    value int
    mu    sync.Mutex
}

var counter *Counter

// Good - local state
type Handler struct {
    counter *Counter
}
```

## Alternatives to Singleton

### 1. Dependency Injection

```go
type App struct {
    config *Config
    db     *Database
    logger *Logger
}

func NewApp() *App {
    config := LoadConfig()
    db := ConnectDB(config)
    logger := NewLogger(config)
    
    return &App{
        config: config,
        db:     db,
        logger: logger,
    }
}
```

### 2. Context

```go
type contextKey string

const configKey contextKey = "config"

func WithConfig(ctx context.Context, cfg *Config) context.Context {
    return context.WithValue(ctx, configKey, cfg)
}

func GetConfig(ctx context.Context) *Config {
    return ctx.Value(configKey).(*Config)
}
```

### 3. Functional Options

```go
type Server struct {
    config *Config
    logger *Logger
}

type Option func(*Server)

func WithConfig(cfg *Config) Option {
    return func(s *Server) {
        s.config = cfg
    }
}

func NewServer(opts ...Option) *Server {
    s := &Server{}
    for _, opt := range opts {
        opt(s)
    }
    return s
}
```

## Testing Singleton

```go
// Problem: can't reset state between tests
func TestSingleton(t *testing.T) {
    instance := GetInstance()
    // Test modifies state
}

// Solution: add method for tests
var (
    instance *Database
    once     sync.Once
)

func GetInstance() *Database {
    once.Do(func() {
        instance = &Database{}
    })
    return instance
}

func ResetForTest() {
    instance = nil
    once = sync.Once{}
}

func TestWithReset(t *testing.T) {
    defer ResetForTest()
    instance := GetInstance()
    // Test
}
```

## Performance

```go
func BenchmarkSingleton(b *testing.B) {
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            _ = GetInstance()
        }
    })
}

func BenchmarkNew(b *testing.B) {
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            _ = &Database{}
        }
    })
}
```

Results:

```sh
BenchmarkSingleton-8    1000000000    0.5 ns/op
BenchmarkNew-8          50000000      30 ns/op
```

Singleton is faster, but the difference is negligible for most cases.

## Conclusion

Singleton in Go:

- Use sync.Once for thread-safety
- Apply for configuration, loggers, connection pools
- Avoid for business logic and testable code
- Consider alternatives: DI, context, functional options

Singleton is a tool. Use it consciously, not by default.

Main rule: when in doubt — don't use Singleton.
