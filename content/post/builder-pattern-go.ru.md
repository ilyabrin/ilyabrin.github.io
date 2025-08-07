---
title: "Builder Pattern в Go: Пошаговое создание сложных объектов"
date: 2025-08-07T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "паттерны-проектирования", "builder", "конструирование", "архитектура"]
categories: ["Разработка"]
---

`Builder pattern` отделяет конструирование объекта от его представления. Он позволяет создавать разные представления объекта, используя один и тот же процесс конструирования.

Вот как правильно реализовать его в Go с реальными примерами.

<!--more-->

## Проблема

Представьте: вы разрабатываете HTTP-сервер для микросервисной архитектуры. Сервер должен поддерживать:

- Разные таймауты для разработки и продакшена
- Опциональный TLS для HTTPS
- Настраиваемое логирование
- Ограничения на размер заголовков
- Различные обработчики запросов

Классический подход - создать конструктор для каждой комбинации параметров:

**Плохой подход - телескопические конструкторы:**

```go
func NewServer(addr string) *Server
func NewServerWithTimeout(addr string, timeout time.Duration) *Server
func NewServerWithTimeoutAndTLS(addr string, timeout time.Duration, tlsConfig *tls.Config) *Server
func NewServerWithTimeoutAndTLSAndLogger(addr string, timeout time.Duration, tlsConfig *tls.Config, logger *log.Logger) *Server
// ... и так далее
```

**Проблемы:**

- Взрыв количества функций-конструкторов
- Сложно запомнить порядок параметров
- Нельзя пропустить опциональные параметры
- Трудно поддерживать

**Builder pattern решает это.**

## Структура Builder Pattern

**Ключевые компоненты:**

**Builder (Строитель):**

- Предоставляет методы для установки свойств объекта
- Возвращает себя для цепочки вызовов
- Имеет метод Build(), создающий финальный объект

**Director (Директор, опционально):**

- Знает, как строить конкретные конфигурации
- Использует builder для конструирования объектов

**Product (Продукт):**

- Сложный объект, который строится

## Базовая реализация

### HTTP Server Builder

Вернёмся к задаче с HTTP-сервером. В реальном проекте у вас может быть:

- Локальный сервер для разработки (простая конфигурация)
- `Staging-сервер` (средняя сложность)
- Production-сервер (полная конфигурация с `TLS`, мониторингом, строгими таймаутами)

`Builder` позволяет создавать все эти варианты из одного кода, добавляя только нужные параметры:

```go
package server

import (
    "crypto/tls"
    "log"
    "net/http"
    "time"
)

// Server - продукт, который мы строим
type Server struct {
    addr           string
    handler        http.Handler
    readTimeout    time.Duration
    writeTimeout   time.Duration
    maxHeaderBytes int
    tlsConfig      *tls.Config
    logger         *log.Logger
}

// ServerBuilder строит экземпляры Server
type ServerBuilder struct {
    server *Server
}

// NewServerBuilder создаёт новый builder
func NewServerBuilder(addr string) *ServerBuilder {
    return &ServerBuilder{
        server: &Server{
            addr:           addr,
            readTimeout:    30 * time.Second,
            writeTimeout:   30 * time.Second,
            maxHeaderBytes: 1 << 20, // 1 MB
        },
    }
}

// WithHandler устанавливает HTTP handler
func (b *ServerBuilder) WithHandler(handler http.Handler) *ServerBuilder {
    b.server.handler = handler
    return b
}

// WithReadTimeout устанавливает таймаут чтения
func (b *ServerBuilder) WithReadTimeout(timeout time.Duration) *ServerBuilder {
    b.server.readTimeout = timeout
    return b
}

// WithWriteTimeout устанавливает таймаут записи
func (b *ServerBuilder) WithWriteTimeout(timeout time.Duration) *ServerBuilder {
    b.server.writeTimeout = timeout
    return b
}

// WithMaxHeaderBytes устанавливает максимальный размер заголовков
func (b *ServerBuilder) WithMaxHeaderBytes(size int) *ServerBuilder {
    b.server.maxHeaderBytes = size
    return b
}

// WithTLS устанавливает TLS конфигурацию
func (b *ServerBuilder) WithTLS(config *tls.Config) *ServerBuilder {
    b.server.tlsConfig = config
    return b
}

// WithLogger устанавливает логгер
func (b *ServerBuilder) WithLogger(logger *log.Logger) *ServerBuilder {
    b.server.logger = logger
    return b
}

// Build создаёт финальный Server
func (b *ServerBuilder) Build() (*Server, error) {
    if b.server.handler == nil {
        return nil, fmt.Errorf("handler обязателен")
    }
    
    if b.server.logger == nil {
        b.server.logger = log.New(os.Stdout, "SERVER: ", log.LstdFlags)
    }
    
    return b.server, nil
}

// Start запускает сервер
func (s *Server) Start() error {
    httpServer := &http.Server{
        Addr:           s.addr,
        Handler:        s.handler,
        ReadTimeout:    s.readTimeout,
        WriteTimeout:   s.writeTimeout,
        MaxHeaderBytes: s.maxHeaderBytes,
        TLSConfig:      s.tlsConfig,
        ErrorLog:       s.logger,
    }
    
    if s.tlsConfig != nil {
        s.logger.Printf("Запуск HTTPS сервера на %s", s.addr)
        return httpServer.ListenAndServeTLS("", "")
    }
    
    s.logger.Printf("Запуск HTTP сервера на %s", s.addr)
    return httpServer.ListenAndServe()
}
```

### Использование

#### Сценарий 1: Локальная разработка

Вы запускаете сервер на своей машине. Нужен минимум настроек - только адрес и обработчик:

```go
func main() {
    // Простой сервер для разработки
    // Используются дефолтные таймауты (30 секунд)
    // Логирование в stdout
    server, err := NewServerBuilder(":8080").
        WithHandler(http.DefaultServeMux).
        Build()
    
    if err != nil {
        log.Fatal(err)
    }
    
    // Сценарий 2: Production сервер
    // Здесь критична безопасность и производительность:
    // - Короткие таймауты (10 сек) для защиты от медленных клиентов
    // - TLS обязателен
    // - Увеличенный лимит заголовков для сложных API
    // - Структурированное логирование
    
    tlsConfig := &tls.Config{
        MinVersion: tls.VersionTLS12,
    }
    
    logger := log.New(os.Stdout, "PROD: ", log.LstdFlags)
    
    prodServer, err := NewServerBuilder(":443").
        WithHandler(myHandler).
        WithReadTimeout(10 * time.Second).
        WithWriteTimeout(10 * time.Second).
        WithMaxHeaderBytes(2 << 20). // 2 MB
        WithTLS(tlsConfig).
        WithLogger(logger).
        Build()
    
    if err != nil {
        log.Fatal(err)
    }
    
    prodServer.Start()
}
```

## Реальный пример: Подключение к базе данных

### Контекст задачи

В production-приложении подключение к PostgreSQL требует тонкой настройки:

- **Разработка:** localhost, без SSL, маленький пул соединений
- **Staging:** удалённый хост, SSL опционален, средний пул
- **Production:** кластер БД, обязательный SSL, большой пул, мониторинг времени жизни соединений

Каждая среда имеет свои требования, но базовая логика подключения одинакова. Builder идеально подходит для этого случая.

### Database Config Builder

```go
package database

import (
    "database/sql"
    "fmt"
    "time"
)

// DBConfig хранит конфигурацию базы данных
type DBConfig struct {
    host            string
    port            int
    database        string
    username        string
    password        string
    maxOpenConns    int
    maxIdleConns    int
    connMaxLifetime time.Duration
    sslMode         string
    timezone        string
    charset         string
}

// DBConfigBuilder строит конфигурации базы данных
type DBConfigBuilder struct {
    config *DBConfig
}

// NewDBConfigBuilder создаёт новый builder
func NewDBConfigBuilder() *DBConfigBuilder {
    return &DBConfigBuilder{
        config: &DBConfig{
            host:            "localhost",
            port:            5432,
            maxOpenConns:    25,
            maxIdleConns:    5,
            connMaxLifetime: 5 * time.Minute,
            sslMode:         "disable",
            timezone:        "UTC",
            charset:         "utf8mb4",
        },
    }
}

// WithHost устанавливает хост базы данных
func (b *DBConfigBuilder) WithHost(host string) *DBConfigBuilder {
    b.config.host = host
    return b
}

// WithPort устанавливает порт базы данных
func (b *DBConfigBuilder) WithPort(port int) *DBConfigBuilder {
    b.config.port = port
    return b
}

// WithDatabase устанавливает имя базы данных
func (b *DBConfigBuilder) WithDatabase(database string) *DBConfigBuilder {
    b.config.database = database
    return b
}

// WithCredentials устанавливает имя пользователя и пароль
func (b *DBConfigBuilder) WithCredentials(username, password string) *DBConfigBuilder {
    b.config.username = username
    b.config.password = password
    return b
}

// WithConnectionPool устанавливает параметры пула соединений
func (b *DBConfigBuilder) WithConnectionPool(maxOpen, maxIdle int, maxLifetime time.Duration) *DBConfigBuilder {
    b.config.maxOpenConns = maxOpen
    b.config.maxIdleConns = maxIdle
    b.config.connMaxLifetime = maxLifetime
    return b
}

// WithSSL включает SSL режим
func (b *DBConfigBuilder) WithSSL(mode string) *DBConfigBuilder {
    b.config.sslMode = mode
    return b
}

// WithTimezone устанавливает часовой пояс
func (b *DBConfigBuilder) WithTimezone(tz string) *DBConfigBuilder {
    b.config.timezone = tz
    return b
}

// Build создаёт подключение к базе данных
func (b *DBConfigBuilder) Build() (*sql.DB, error) {
    if b.config.database == "" {
        return nil, fmt.Errorf("имя базы данных обязательно")
    }
    
    if b.config.username == "" {
        return nil, fmt.Errorf("имя пользователя обязательно")
    }
    
    dsn := b.buildDSN()
    
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, fmt.Errorf("открытие базы данных: %w", err)
    }
    
    db.SetMaxOpenConns(b.config.maxOpenConns)
    db.SetMaxIdleConns(b.config.maxIdleConns)
    db.SetConnMaxLifetime(b.config.connMaxLifetime)
    
    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("ping базы данных: %w", err)
    }
    
    return db, nil
}

func (b *DBConfigBuilder) buildDSN() string {
    return fmt.Sprintf(
        "host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
        b.config.host,
        b.config.port,
        b.config.username,
        b.config.password,
        b.config.database,
        b.config.sslMode,
        b.config.timezone,
    )
}
```

### Применение

#### Локальная разработка

Разработчик на своей машине. PostgreSQL установлен локально, используются дефолтные настройки:

```go
// Минимальная конфигурация для разработки
// Используются дефолты: localhost:5432, пул 25/5 соединений
devDB, err := NewDBConfigBuilder().
    WithDatabase("myapp_dev").
    WithCredentials("dev_user", "dev_pass").
    Build()

// Сценарий 2: Production база данных
// Критичны: безопасность, производительность, надёжность
// - Удалённый хост с репликацией
// - Обязательный SSL
// - Большой пул соединений (100 открытых, 10 idle)
// - Короткое время жизни соединений (10 минут) для балансировки
prodDB, err := NewDBConfigBuilder().
    WithHost("prod-db.example.com").
    WithPort(5432).
    WithDatabase("myapp_prod").
    WithCredentials("prod_user", "secure_password").
    WithConnectionPool(100, 10, 10*time.Minute).
    WithSSL("require").
    WithTimezone("Europe/Moscow").
    Build()
```

## Реальный пример: Query Builder

### SQL Query Builder

```go
package query

import (
    "fmt"
    "strings"
)

// Query представляет SQL запрос
type Query struct {
    table      string
    columns    []string
    where      []string
    orderBy    []string
    limit      int
    offset     int
    joins      []string
    groupBy    []string
    having     []string
}

// QueryBuilder строит SQL запросы
type QueryBuilder struct {
    query *Query
}

// NewQueryBuilder создаёт новый query builder
func NewQueryBuilder() *QueryBuilder {
    return &QueryBuilder{
        query: &Query{
            columns: []string{"*"},
        },
    }
}

// Select устанавливает колонки для выборки
func (b *QueryBuilder) Select(columns ...string) *QueryBuilder {
    b.query.columns = columns
    return b
}

// From устанавливает имя таблицы
func (b *QueryBuilder) From(table string) *QueryBuilder {
    b.query.table = table
    return b
}

// Where добавляет условие WHERE
func (b *QueryBuilder) Where(condition string, args ...interface{}) *QueryBuilder {
    b.query.where = append(b.query.where, fmt.Sprintf(condition, args...))
    return b
}

// Join добавляет JOIN
func (b *QueryBuilder) Join(table, condition string) *QueryBuilder {
    b.query.joins = append(b.query.joins, fmt.Sprintf("JOIN %s ON %s", table, condition))
    return b
}

// LeftJoin добавляет LEFT JOIN
func (b *QueryBuilder) LeftJoin(table, condition string) *QueryBuilder {
    b.query.joins = append(b.query.joins, fmt.Sprintf("LEFT JOIN %s ON %s", table, condition))
    return b
}

// OrderBy добавляет ORDER BY
func (b *QueryBuilder) OrderBy(column string, direction string) *QueryBuilder {
    b.query.orderBy = append(b.query.orderBy, fmt.Sprintf("%s %s", column, direction))
    return b
}

// GroupBy добавляет GROUP BY
func (b *QueryBuilder) GroupBy(columns ...string) *QueryBuilder {
    b.query.groupBy = append(b.query.groupBy, columns...)
    return b
}

// Having добавляет HAVING
func (b *QueryBuilder) Having(condition string) *QueryBuilder {
    b.query.having = append(b.query.having, condition)
    return b
}

// Limit устанавливает LIMIT
func (b *QueryBuilder) Limit(limit int) *QueryBuilder {
    b.query.limit = limit
    return b
}

// Offset устанавливает OFFSET
func (b *QueryBuilder) Offset(offset int) *QueryBuilder {
    b.query.offset = offset
    return b
}

// Build генерирует SQL запрос
func (b *QueryBuilder) Build() (string, error) {
    if b.query.table == "" {
        return "", fmt.Errorf("имя таблицы обязательно")
    }
    
    var parts []string
    
    // SELECT
    parts = append(parts, fmt.Sprintf("SELECT %s", strings.Join(b.query.columns, ", ")))
    
    // FROM
    parts = append(parts, fmt.Sprintf("FROM %s", b.query.table))
    
    // JOINs
    if len(b.query.joins) > 0 {
        parts = append(parts, strings.Join(b.query.joins, " "))
    }
    
    // WHERE
    if len(b.query.where) > 0 {
        parts = append(parts, fmt.Sprintf("WHERE %s", strings.Join(b.query.where, " AND ")))
    }
    
    // GROUP BY
    if len(b.query.groupBy) > 0 {
        parts = append(parts, fmt.Sprintf("GROUP BY %s", strings.Join(b.query.groupBy, ", ")))
    }
    
    // HAVING
    if len(b.query.having) > 0 {
        parts = append(parts, fmt.Sprintf("HAVING %s", strings.Join(b.query.having, " AND ")))
    }
    
    // ORDER BY
    if len(b.query.orderBy) > 0 {
        parts = append(parts, fmt.Sprintf("ORDER BY %s", strings.Join(b.query.orderBy, ", ")))
    }
    
    // LIMIT
    if b.query.limit > 0 {
        parts = append(parts, fmt.Sprintf("LIMIT %d", b.query.limit))
    }
    
    // OFFSET
    if b.query.offset > 0 {
        parts = append(parts, fmt.Sprintf("OFFSET %d", b.query.offset))
    }
    
    return strings.Join(parts, " "), nil
}
```

### Использование в коде

```go
// Простой запрос
query, _ := NewQueryBuilder().
    Select("id", "name", "email").
    From("users").
    Where("active = true").
    OrderBy("created_at", "DESC").
    Limit(10).
    Build()

// Сложный запрос с JOIN
complexQuery, _ := NewQueryBuilder().
    Select("u.id", "u.name", "COUNT(o.id) as order_count").
    From("users u").
    LeftJoin("orders o", "o.user_id = u.id").
    Where("u.active = true").
    Where("u.created_at > '2024-01-01'").
    GroupBy("u.id", "u.name").
    Having("COUNT(o.id) > 5").
    OrderBy("order_count", "DESC").
    Limit(20).
    Build()

fmt.Println(complexQuery)
// Вывод: SELECT u.id, u.name, COUNT(o.id) as order_count FROM users u 
// LEFT JOIN orders o ON o.user_id = u.id 
// WHERE u.active = true AND u.created_at > '2024-01-01' 
// GROUP BY u.id, u.name HAVING COUNT(o.id) > 5 
// ORDER BY order_count DESC LIMIT 20
```

## Продвинуто: Director Pattern

`Director` знает, как строить конкретные конфигурации:

```go
// ServerDirector создаёт предопределённые конфигурации сервера
type ServerDirector struct {
    builder *ServerBuilder
}

func NewServerDirector(builder *ServerBuilder) *ServerDirector {
    return &ServerDirector{builder: builder}
}

// BuildDevelopmentServer создаёт сервер для разработки
func (d *ServerDirector) BuildDevelopmentServer(handler http.Handler) (*Server, error) {
    return d.builder.
        WithHandler(handler).
        WithReadTimeout(60 * time.Second).
        WithWriteTimeout(60 * time.Second).
        Build()
}

// BuildProductionServer создаёт продакшн сервер
func (d *ServerDirector) BuildProductionServer(handler http.Handler, tlsConfig *tls.Config) (*Server, error) {
    return d.builder.
        WithHandler(handler).
        WithReadTimeout(10 * time.Second).
        WithWriteTimeout(10 * time.Second).
        WithMaxHeaderBytes(2 << 20).
        WithTLS(tlsConfig).
        Build()
}

// Использование
builder := NewServerBuilder(":8080")
director := NewServerDirector(builder)

devServer, _ := director.BuildDevelopmentServer(myHandler)
prodServer, _ := director.BuildProductionServer(myHandler, tlsConfig)
```

## Functional Options Pattern

Альтернативный Go-идиоматичный подход:

```go
type ServerOption func(*Server)

func WithReadTimeout(timeout time.Duration) ServerOption {
    return func(s *Server) {
        s.readTimeout = timeout
    }
}

func WithWriteTimeout(timeout time.Duration) ServerOption {
    return func(s *Server) {
        s.writeTimeout = timeout
    }
}

func NewServer(addr string, handler http.Handler, opts ...ServerOption) *Server {
    server := &Server{
        addr:         addr,
        handler:      handler,
        readTimeout:  30 * time.Second,
        writeTimeout: 30 * time.Second,
    }
    
    for _, opt := range opts {
        opt(server)
    }
    
    return server
}

// Использование
server := NewServer(":8080", myHandler,
    WithReadTimeout(10*time.Second),
    WithWriteTimeout(10*time.Second),
)
```

## Тестирование

```go
func TestServerBuilder(t *testing.T) {
    tests := []struct {
        name    string
        builder func() *ServerBuilder
        wantErr bool
    }{
        {
            name: "валидный сервер",
            builder: func() *ServerBuilder {
                return NewServerBuilder(":8080").
                    WithHandler(http.DefaultServeMux)
            },
            wantErr: false,
        },
        {
            name: "отсутствует handler",
            builder: func() *ServerBuilder {
                return NewServerBuilder(":8080")
            },
            wantErr: true,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            _, err := tt.builder().Build()
            if (err != nil) != tt.wantErr {
                t.Errorf("Build() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

## Когда использовать Builder Pattern

**Используйте когда:**

- У объекта много опциональных параметров
- Процесс конструирования сложный
- Нужны разные представления одного объекта
- Хотите неизменяемые объекты после конструирования

**Не используйте когда:**

- Объект простой с малым количеством параметров
- Все параметры обязательны
- Конструирование простое
- Достаточно functional options pattern

## Builder vs Factory

**Builder:**

- Пошаговое конструирование
- Один процесс, разные представления
- Фокус на КАК строить
- Возвращает полностью сконструированный объект

**Factory:**

- Создание в один шаг
- Скрывает логику создания
- Фокус на ЧТО создавать
- Может возвращать интерфейс

## Заключение

Builder pattern предоставляет чистый способ конструирования сложных объектов в Go.

**Ключевые преимущества:**

- Читаемое конструирование объектов
- Гибкая обработка параметров
- Неизменяемые объекты
- Валидация перед созданием

**Советы по реализации:**

- Возвращайте builder из каждого метода для цепочки вызовов
- Валидируйте в методе Build()
- Предоставляйте разумные значения по умолчанию
- Рассмотрите functional options для простых случаев

**Реальные применения:**

- Конфигурационные builders
- Query builders
- HTTP клиенты
- Builders тестовых данных
- Сложные доменные объекты

Builder pattern необходим для создания сложных объектов с чистым, поддерживаемым кодом.

---

*Как вы обрабатываете конструирование сложных объектов в вашем Go коде? Делитесь подходом в комментариях или пишите напрямую.*
