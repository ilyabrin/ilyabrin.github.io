---
title: "Builder Pattern in Go: Step-by-Step Construction of Complex Objects"
date: 2025-08-07T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "design-patterns", "builder", "construction", "architecture"]
categories: ["Development"]
---

Builder pattern separates object construction from its representation. It allows creating different representations of an object using the same construction process.

Here's how to implement it properly in Go with real-world examples.

<!--more-->

## The Problem

Imagine: you're building an HTTP server for microservices architecture. The server needs to support:

- Different timeouts for development and production
- Optional TLS for HTTPS
- Configurable logging
- Header size limits
- Various request handlers

Classic approach - create constructor for every parameter combination:

**Bad approach - telescoping constructors:**

```go
func NewServer(addr string) *Server
func NewServerWithTimeout(addr string, timeout time.Duration) *Server
func NewServerWithTimeoutAndTLS(addr string, timeout time.Duration, tlsConfig *tls.Config) *Server
func NewServerWithTimeoutAndTLSAndLogger(addr string, timeout time.Duration, tlsConfig *tls.Config, logger *log.Logger) *Server
// ... and so on
```

**Problems:**

- Explosion of constructor functions
- Hard to remember parameter order
- Can't skip optional parameters
- Difficult to maintain

**Builder pattern solves this.**

## Builder Pattern Structure

**Key components:**

**Builder:**

- Provides methods to set object properties
- Returns itself for method chaining
- Has Build() method that creates final object

**Director (optional):**

- Knows how to build specific configurations
- Uses builder to construct objects

**Product:**

- Complex object being built

## Basic Implementation

### HTTP Server Builder

Back to the HTTP server task. In a real project you might have:

- Local development server (simple configuration)
- Staging server (medium complexity)
- Production server (full configuration with TLS, monitoring, strict timeouts)

Builder allows creating all these variants from the same code, adding only needed parameters:

```go
package server

import (
    "crypto/tls"
    "log"
    "net/http"
    "time"
)

// Server is the product we're building
type Server struct {
    addr           string
    handler        http.Handler
    readTimeout    time.Duration
    writeTimeout   time.Duration
    maxHeaderBytes int
    tlsConfig      *tls.Config
    logger         *log.Logger
}

// ServerBuilder builds Server instances
type ServerBuilder struct {
    server *Server
}

// NewServerBuilder creates a new builder
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

// WithHandler sets the HTTP handler
func (b *ServerBuilder) WithHandler(handler http.Handler) *ServerBuilder {
    b.server.handler = handler
    return b
}

// WithReadTimeout sets read timeout
func (b *ServerBuilder) WithReadTimeout(timeout time.Duration) *ServerBuilder {
    b.server.readTimeout = timeout
    return b
}

// WithWriteTimeout sets write timeout
func (b *ServerBuilder) WithWriteTimeout(timeout time.Duration) *ServerBuilder {
    b.server.writeTimeout = timeout
    return b
}

// WithMaxHeaderBytes sets max header size
func (b *ServerBuilder) WithMaxHeaderBytes(size int) *ServerBuilder {
    b.server.maxHeaderBytes = size
    return b
}

// WithTLS sets TLS configuration
func (b *ServerBuilder) WithTLS(config *tls.Config) *ServerBuilder {
    b.server.tlsConfig = config
    return b
}

// WithLogger sets logger
func (b *ServerBuilder) WithLogger(logger *log.Logger) *ServerBuilder {
    b.server.logger = logger
    return b
}

// Build creates the final Server
func (b *ServerBuilder) Build() (*Server, error) {
    if b.server.handler == nil {
        return nil, fmt.Errorf("handler is required")
    }
    
    if b.server.logger == nil {
        b.server.logger = log.New(os.Stdout, "SERVER: ", log.LstdFlags)
    }
    
    return b.server, nil
}

// Start starts the server
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
        s.logger.Printf("Starting HTTPS server on %s", s.addr)
        return httpServer.ListenAndServeTLS("", "")
    }
    
    s.logger.Printf("Starting HTTP server on %s", s.addr)
    return httpServer.ListenAndServe()
}
```

### Usage

**Scenario 1: Local Development**

You're running server on your machine. Need minimal setup - just address and handler:

```go
func main() {
    // Simple development server
    // Uses default timeouts (30 seconds)
    // Logging to stdout
    server, err := NewServerBuilder(":8080").
        WithHandler(http.DefaultServeMux).
        Build()
    
    if err != nil {
        log.Fatal(err)
    }
    
    // Scenario 2: Production server
    // Security and performance are critical:
    // - Short timeouts (10 sec) to protect from slow clients
    // - TLS required
    // - Increased header limit for complex APIs
    // - Structured logging
    
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

## Real-World Example: Database Connection

### Task Context

In production applications, PostgreSQL connection requires fine-tuning:

- **Development:** localhost, no SSL, small connection pool
- **Staging:** remote host, SSL optional, medium pool
- **Production:** DB cluster, required SSL, large pool, connection lifetime monitoring

Each environment has its requirements, but basic connection logic is the same. Builder is perfect for this case.

### Database Config Builder

```go
package database

import (
    "database/sql"
    "fmt"
    "time"
)

// DBConfig holds database configuration
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

// DBConfigBuilder builds database configurations
type DBConfigBuilder struct {
    config *DBConfig
}

// NewDBConfigBuilder creates a new builder
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

// WithHost sets database host
func (b *DBConfigBuilder) WithHost(host string) *DBConfigBuilder {
    b.config.host = host
    return b
}

// WithPort sets database port
func (b *DBConfigBuilder) WithPort(port int) *DBConfigBuilder {
    b.config.port = port
    return b
}

// WithDatabase sets database name
func (b *DBConfigBuilder) WithDatabase(database string) *DBConfigBuilder {
    b.config.database = database
    return b
}

// WithCredentials sets username and password
func (b *DBConfigBuilder) WithCredentials(username, password string) *DBConfigBuilder {
    b.config.username = username
    b.config.password = password
    return b
}

// WithConnectionPool sets connection pool parameters
func (b *DBConfigBuilder) WithConnectionPool(maxOpen, maxIdle int, maxLifetime time.Duration) *DBConfigBuilder {
    b.config.maxOpenConns = maxOpen
    b.config.maxIdleConns = maxIdle
    b.config.connMaxLifetime = maxLifetime
    return b
}

// WithSSL enables SSL mode
func (b *DBConfigBuilder) WithSSL(mode string) *DBConfigBuilder {
    b.config.sslMode = mode
    return b
}

// WithTimezone sets timezone
func (b *DBConfigBuilder) WithTimezone(tz string) *DBConfigBuilder {
    b.config.timezone = tz
    return b
}

// Build creates database connection
func (b *DBConfigBuilder) Build() (*sql.DB, error) {
    if b.config.database == "" {
        return nil, fmt.Errorf("database name is required")
    }
    
    if b.config.username == "" {
        return nil, fmt.Errorf("username is required")
    }
    
    dsn := b.buildDSN()
    
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, fmt.Errorf("open database: %w", err)
    }
    
    db.SetMaxOpenConns(b.config.maxOpenConns)
    db.SetMaxIdleConns(b.config.maxIdleConns)
    db.SetConnMaxLifetime(b.config.connMaxLifetime)
    
    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("ping database: %w", err)
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

### Usage

**Scenario 1: Local Development**

Developer on their machine. PostgreSQL installed locally, using default settings:

```go
// Minimal configuration for development
// Uses defaults: localhost:5432, pool 25/5 connections
devDB, err := NewDBConfigBuilder().
    WithDatabase("myapp_dev").
    WithCredentials("dev_user", "dev_pass").
    Build()

// Scenario 2: Production database
// Critical: security, performance, reliability
// - Remote host with replication
// - Required SSL
// - Large connection pool (100 open, 10 idle)
// - Short connection lifetime (10 min) for load balancing
prodDB, err := NewDBConfigBuilder().
    WithHost("prod-db.example.com").
    WithPort(5432).
    WithDatabase("myapp_prod").
    WithCredentials("prod_user", "secure_password").
    WithConnectionPool(100, 10, 10*time.Minute).
    WithSSL("require").
    WithTimezone("America/New_York").
    Build()
```

## Real-World Example: Query Builder

### SQL Query Builder

```go
package query

import (
    "fmt"
    "strings"
)

// Query represents a SQL query
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

// QueryBuilder builds SQL queries
type QueryBuilder struct {
    query *Query
}

// NewQueryBuilder creates a new query builder
func NewQueryBuilder() *QueryBuilder {
    return &QueryBuilder{
        query: &Query{
            columns: []string{"*"},
        },
    }
}

// Select sets columns to select
func (b *QueryBuilder) Select(columns ...string) *QueryBuilder {
    b.query.columns = columns
    return b
}

// From sets table name
func (b *QueryBuilder) From(table string) *QueryBuilder {
    b.query.table = table
    return b
}

// Where adds WHERE condition
func (b *QueryBuilder) Where(condition string, args ...interface{}) *QueryBuilder {
    b.query.where = append(b.query.where, fmt.Sprintf(condition, args...))
    return b
}

// Join adds JOIN clause
func (b *QueryBuilder) Join(table, condition string) *QueryBuilder {
    b.query.joins = append(b.query.joins, fmt.Sprintf("JOIN %s ON %s", table, condition))
    return b
}

// LeftJoin adds LEFT JOIN clause
func (b *QueryBuilder) LeftJoin(table, condition string) *QueryBuilder {
    b.query.joins = append(b.query.joins, fmt.Sprintf("LEFT JOIN %s ON %s", table, condition))
    return b
}

// OrderBy adds ORDER BY clause
func (b *QueryBuilder) OrderBy(column string, direction string) *QueryBuilder {
    b.query.orderBy = append(b.query.orderBy, fmt.Sprintf("%s %s", column, direction))
    return b
}

// GroupBy adds GROUP BY clause
func (b *QueryBuilder) GroupBy(columns ...string) *QueryBuilder {
    b.query.groupBy = append(b.query.groupBy, columns...)
    return b
}

// Having adds HAVING clause
func (b *QueryBuilder) Having(condition string) *QueryBuilder {
    b.query.having = append(b.query.having, condition)
    return b
}

// Limit sets LIMIT
func (b *QueryBuilder) Limit(limit int) *QueryBuilder {
    b.query.limit = limit
    return b
}

// Offset sets OFFSET
func (b *QueryBuilder) Offset(offset int) *QueryBuilder {
    b.query.offset = offset
    return b
}

// Build generates SQL query
func (b *QueryBuilder) Build() (string, error) {
    if b.query.table == "" {
        return "", fmt.Errorf("table name is required")
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

### Usage

```go
// Simple query
query, _ := NewQueryBuilder().
    Select("id", "name", "email").
    From("users").
    Where("active = true").
    OrderBy("created_at", "DESC").
    Limit(10).
    Build()

// Complex query with joins
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
// Output: SELECT u.id, u.name, COUNT(o.id) as order_count FROM users u 
// LEFT JOIN orders o ON o.user_id = u.id 
// WHERE u.active = true AND u.created_at > '2024-01-01' 
// GROUP BY u.id, u.name HAVING COUNT(o.id) > 5 
// ORDER BY order_count DESC LIMIT 20
```

## Advanced: Director Pattern

Director knows how to build specific configurations:

```go
// ServerDirector creates predefined server configurations
type ServerDirector struct {
    builder *ServerBuilder
}

func NewServerDirector(builder *ServerBuilder) *ServerDirector {
    return &ServerDirector{builder: builder}
}

// BuildDevelopmentServer creates development server
func (d *ServerDirector) BuildDevelopmentServer(handler http.Handler) (*Server, error) {
    return d.builder.
        WithHandler(handler).
        WithReadTimeout(60 * time.Second).
        WithWriteTimeout(60 * time.Second).
        Build()
}

// BuildProductionServer creates production server
func (d *ServerDirector) BuildProductionServer(handler http.Handler, tlsConfig *tls.Config) (*Server, error) {
    return d.builder.
        WithHandler(handler).
        WithReadTimeout(10 * time.Second).
        WithWriteTimeout(10 * time.Second).
        WithMaxHeaderBytes(2 << 20).
        WithTLS(tlsConfig).
        Build()
}

// Usage
builder := NewServerBuilder(":8080")
director := NewServerDirector(builder)

devServer, _ := director.BuildDevelopmentServer(myHandler)
prodServer, _ := director.BuildProductionServer(myHandler, tlsConfig)
```

## Functional Options Pattern

Alternative Go-idiomatic approach:

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

// Usage
server := NewServer(":8080", myHandler,
    WithReadTimeout(10*time.Second),
    WithWriteTimeout(10*time.Second),
)
```

## Testing

```go
func TestServerBuilder(t *testing.T) {
    tests := []struct {
        name    string
        builder func() *ServerBuilder
        wantErr bool
    }{
        {
            name: "valid server",
            builder: func() *ServerBuilder {
                return NewServerBuilder(":8080").
                    WithHandler(http.DefaultServeMux)
            },
            wantErr: false,
        },
        {
            name: "missing handler",
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

## When to Use Builder Pattern

**Use when:**

- Object has many optional parameters
- Construction process is complex
- Need different representations of same object
- Want immutable objects after construction

**Don't use when:**

- Object is simple with few parameters
- All parameters are required
- Construction is straightforward
- Functional options pattern is sufficient

## Builder vs Factory

**Builder:**

- Step-by-step construction
- Same process, different representations
- Focuses on HOW to build
- Returns fully constructed object

**Factory:**

- One-step creation
- Hides creation logic
- Focuses on WHAT to create
- May return interface

## Conclusion

Builder pattern provides clean way to construct complex objects in Go.

**Key benefits:**

- Readable object construction
- Flexible parameter handling
- Immutable objects
- Validation before creation

**Implementation tips:**

- Return builder from each method for chaining
- Validate in Build() method
- Provide sensible defaults
- Consider functional options for simpler cases

**Real-world applications:**

- Configuration builders
- Query builders
- HTTP clients
- Test data builders
- Complex domain objects

Builder pattern is essential for creating complex objects with clean, maintainable code.

---

*How do you handle complex object construction in your Go code? Share your approach in comments or reach out directly.*
