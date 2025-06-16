---
title: "Singleton Pattern в Go: реализация и случаи использования"
date: 2025-06-16T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "singleton", "concurrency"]
categories: ["Patterns"]
---

Singleton — один из самых спорных паттернов. Одни называют его антипаттерном, другие используют повсеместно. Разберём, как правильно реализовать `Singleton` в Go и когда он действительно нужен.

<!--more-->

## Что такое Singleton

Singleton гарантирует, что у класса есть только один экземпляр, и предоставляет глобальную точку доступа к нему.

В Go это означает: один экземпляр структуры на всё приложение.

## Наивная реализация

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

Проблема: не потокобезопасно. Две горутины могут создать два экземпляра.

## Правильная реализация: sync.Once

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

sync.Once гарантирует, что функция выполнится ровно один раз, даже при конкурентном доступе.

## Реализация с инициализацией

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

## Ленивая инициализация с ошибкой

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

## Eager инициализация

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

Инициализируется при старте программы. Проще, но нет контроля над моментом создания.

## Singleton с параметрами

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

## Когда использовать Singleton

### 1. Конфигурация приложения

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

### 2. Пул соединений

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

### 3. Логгер

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

## Когда НЕ использовать Singleton

### 1. Для бизнес-логики

```go
// Плохо
type UserService struct {
    repo UserRepository
}

var userService *UserService

// Хорошо - используйте DI
func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}
```

### 2. Для тестируемого кода

```go
// Плохо - невозможно подменить в тестах
func ProcessUser(id string) {
    db := GetDatabase()
    // ...
}

// Хорошо - явная зависимость
func ProcessUser(db *Database, id string) {
    // ...
}
```

### 3. Для состояния

```go
// Плохо - глобальное состояние
type Counter struct {
    value int
    mu    sync.Mutex
}

var counter *Counter

// Хорошо - локальное состояние
type Handler struct {
    counter *Counter
}
```

## Альтернативы Singleton

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

### 3. Функциональные опции

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

## Тестирование Singleton

```go
// Проблема: нельзя сбросить состояние между тестами
func TestSingleton(t *testing.T) {
    instance := GetInstance()
    // Тест изменяет состояние
}

// Решение: добавить метод для тестов
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
    // Тест
}
```

## Производительность

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

Результаты:

```sh
BenchmarkSingleton-8    1000000000    0.5 ns/op
BenchmarkNew-8          50000000      30 ns/op
```

Singleton быстрее, но разница незначительна для большинства случаев.

## Заключение

Singleton в Go:

- Используйте sync.Once для потокобезопасности
- Применяйте для конфигурации, логгеров, пулов соединений
- Избегайте для бизнес-логики и тестируемого кода
- Рассмотрите альтернативы: DI, context, функциональные опции

Singleton — это инструмент. Используйте его осознанно, а не по умолчанию.

Главное правило: если сомневаетесь — не используйте Singleton.
