---
title: "Factory Pattern in Go: Creating Objects with Factories"
date: 2025-06-10T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "factory"]
categories: ["Patterns"]
---

`Factory Pattern` solves one problem: how to create objects without being tied to concrete types. Instead of directly calling a constructor, use a factory function that decides which object to create.

<!--more-->

## Problem: Tight Coupling to Types

Without a factory, code is tied to concrete types:

```go
type MySQLDatabase struct{}
type PostgresDatabase struct{}

func main() {
    db := &MySQLDatabase{} // Tight coupling
    // To change DB, need to change code
}
```

Every time you change the type, you have to rewrite code.

## Solution: Factory Function

```go
type Database interface {
    Connect() error
    Query(sql string) ([]Row, error)
}

func NewDatabase(dbType string) Database {
    switch dbType {
    case "mysql":
        return &MySQLDatabase{}
    case "postgres":
        return &PostgresDatabase{}
    default:
        return &MySQLDatabase{}
    }
}
```

Now the type is determined in one place. Client code doesn't know about concrete implementations.

## Simple Factory: Basic Factory

The simplest variant - a function that returns an interface:

```go
type Logger interface {
    Log(message string)
}

type FileLogger struct {
    path string
}

func (f *FileLogger) Log(message string) {
    // Write to file
}

type ConsoleLogger struct{}

func (c *ConsoleLogger) Log(message string) {
    fmt.Println(message)
}

func NewLogger(logType string) Logger {
    if logType == "file" {
        return &FileLogger{path: "/var/log/app.log"}
    }
    return &ConsoleLogger{}
}
```

Usage:

```go
logger := NewLogger("console")
logger.Log("Application started")
```

## Factory Method: Factory in Interface

When you need to delegate object creation to subclasses:

```go
type Notification interface {
    Send(message string) error
}

type NotificationFactory interface {
    CreateNotification() Notification
}

type EmailFactory struct{}

func (e *EmailFactory) CreateNotification() Notification {
    return &EmailNotification{}
}

type SMSFactory struct{}

func (s *SMSFactory) CreateNotification() Notification {
    return &SMSNotification{}
}
```

Usage:

```go
func SendAlert(factory NotificationFactory, msg string) {
    notification := factory.CreateNotification()
    notification.Send(msg)
}
```

## Abstract Factory: Object Families

When you need to create related objects:

```go
type UIFactory interface {
    CreateButton() Button
    CreateCheckbox() Checkbox
}

type WindowsFactory struct{}

func (w *WindowsFactory) CreateButton() Button {
    return &WindowsButton{}
}

func (w *WindowsFactory) CreateCheckbox() Checkbox {
    return &WindowsCheckbox{}
}

type MacFactory struct{}

func (m *MacFactory) CreateButton() Button {
    return &MacButton{}
}

func (m *MacFactory) CreateCheckbox() Checkbox {
    return &MacCheckbox{}
}
```

Usage:

```go
func RenderUI(factory UIFactory) {
    button := factory.CreateButton()
    checkbox := factory.CreateCheckbox()
    
    button.Render()
    checkbox.Render()
}
```

## Factory with Configuration

```go
type ServerConfig struct {
    Host string
    Port int
    TLS  bool
}

func NewServer(config ServerConfig) *Server {
    server := &Server{
        host: config.Host,
        port: config.Port,
    }
    
    if config.TLS {
        server.setupTLS()
    }
    
    return server
}
```

## Factory with Validation

```go
func NewUser(email, password string) (*User, error) {
    if !isValidEmail(email) {
        return nil, errors.New("invalid email")
    }
    
    if len(password) < 8 {
        return nil, errors.New("password too short")
    }
    
    return &User{
        email:    email,
        password: hashPassword(password),
    }, nil
}
```

## Factory Registration

For extensibility without code changes:

```go
type PaymentFactory func() Payment

var factories = make(map[string]PaymentFactory)

func RegisterPayment(name string, factory PaymentFactory) {
    factories[name] = factory
}

func CreatePayment(name string) Payment {
    factory, ok := factories[name]
    if !ok {
        return nil
    }
    return factory()
}

func init() {
    RegisterPayment("stripe", func() Payment {
        return &StripePayment{}
    })
    RegisterPayment("paypal", func() Payment {
        return &PayPalPayment{}
    })
}
```

## Factory with Object Pool

```go
type ConnectionPool struct {
    connections chan *Connection
}

func NewConnectionPool(size int) *ConnectionPool {
    pool := &ConnectionPool{
        connections: make(chan *Connection, size),
    }
    
    for i := 0; i < size; i++ {
        pool.connections <- &Connection{}
    }
    
    return pool
}

func (p *ConnectionPool) Get() *Connection {
    return <-p.connections
}

func (p *ConnectionPool) Put(conn *Connection) {
    p.connections <- conn
}
```

## When to Use Factory

### 1. Creation Depends on Conditions

```go
func NewCache(size int) Cache {
    if size > 1000 {
        return &RedisCache{}
    }
    return &MemoryCache{}
}
```

### 2. Complex Initialization

```go
func NewHTTPClient(timeout time.Duration) *http.Client {
    return &http.Client{
        Timeout: timeout,
        Transport: &http.Transport{
            MaxIdleConns:        100,
            MaxIdleConnsPerHost: 10,
            IdleConnTimeout:     90 * time.Second,
        },
    }
}
```

### 3. Hide Implementation

```go
func NewMetrics() Metrics {
    return &prometheusMetrics{
        registry: prometheus.NewRegistry(),
    }
}
```

## When NOT to Use Factory

### 1. Simple Structures

```go
// Not needed
func NewPoint(x, y int) *Point {
    return &Point{x: x, y: y}
}

// Sufficient
point := Point{X: 10, Y: 20}
```

### 2. Single Type

```go
// Not needed
func NewUser() *User {
    return &User{}
}

// Sufficient
user := &User{}
```

### 3. No Creation Logic

```go
// Not needed
func NewConfig() *Config {
    return &Config{}
}

// Sufficient
config := &Config{}
```

## Factory vs Builder

```go
// Factory: creation in one call
db := NewDatabase("postgres")

// Builder: step-by-step creation
db := NewDatabaseBuilder().
    WithHost("localhost").
    WithPort(5432).
    WithSSL(true).
    Build()
```

`Factory` for simple cases. `Builder` for complex objects with many parameters.

## Testing with Factories

```go
type UserRepository interface {
    Save(user *User) error
}

func NewUserRepository(env string) UserRepository {
    if env == "test" {
        return &MockRepository{}
    }
    return &PostgresRepository{}
}

func TestUserService(t *testing.T) {
    repo := NewUserRepository("test")
    service := NewUserService(repo)
    // Test with mock repository
}
```

## Performance

```go
func BenchmarkFactory(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = NewLogger("console")
    }
}

func BenchmarkDirect(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = &ConsoleLogger{}
    }
}
```

`Factory` adds minimal overhead. For most cases, the difference is negligible.

## Real Example: HTTP Client

```go
type HTTPClient interface {
    Get(url string) (*Response, error)
    Post(url string, body []byte) (*Response, error)
}

func NewHTTPClient(opts ...Option) HTTPClient {
    client := &httpClient{
        timeout: 30 * time.Second,
        retries: 3,
    }
    
    for _, opt := range opts {
        opt(client)
    }
    
    return client
}

type Option func(*httpClient)

func WithTimeout(d time.Duration) Option {
    return func(c *httpClient) {
        c.timeout = d
    }
}

func WithRetries(n int) Option {
    return func(c *httpClient) {
        c.retries = n
    }
}
```

Usage:

```go
client := NewHTTPClient(
    WithTimeout(10 * time.Second),
    WithRetries(5),
)
```

## Conclusion

`Factory Pattern` in Go:

- Use for creating objects with conditions
- Hide concrete implementations behind interfaces
- Apply for complex initialization
- Combine with functional options
- Avoid for simple structures

`Factory` isn't about complication. It's about `flexibility and extensibility`.

If object creation is one line, factory isn't needed. If creation depends on conditions, requires validation, or hides details - factory helps.
