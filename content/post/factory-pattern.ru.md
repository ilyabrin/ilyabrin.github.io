---
title: "Factory Pattern в Go: создание объектов с помощью фабрик"
date: 2025-06-10T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "factory"]
categories: ["Patterns"]
---

`Factory Pattern` решает одну проблему: как создавать объекты, не привязываясь к конкретным типам. Вместо прямого вызова конструктора используется фабричная функция, которая решает, какой именно объект создать.

<!--more-->

## Проблема: жёсткая привязка к типам

Без фабрики код привязан к конкретным типам:

```go
type MySQLDatabase struct{}
type PostgresDatabase struct{}

func main() {
    db := &MySQLDatabase{} // Жёсткая привязка
    // Чтобы сменить БД, нужно менять код
}
```

Каждый раз при смене типа приходится переписывать код.

## Решение: фабричная функция

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

Теперь тип определяется в одном месте. Клиентский код не знает о конкретных реализациях.

## Simple Factory: базовая фабрика

Самый простой вариант - функция, которая возвращает интерфейс:

```go
type Logger interface {
    Log(message string)
}

type FileLogger struct {
    path string
}

func (f *FileLogger) Log(message string) {
    // Запись в файл
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

Использование:

```go
logger := NewLogger("console")
logger.Log("Application started")
```

## Factory Method: фабрика в интерфейсе

Когда нужно делегировать создание объектов подклассам:

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

Использование:

```go
func SendAlert(factory NotificationFactory, msg string) {
    notification := factory.CreateNotification()
    notification.Send(msg)
}
```

## Abstract Factory: семейства объектов

Когда нужно создавать связанные объекты:

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

Использование:

```go
func RenderUI(factory UIFactory) {
    button := factory.CreateButton()
    checkbox := factory.CreateCheckbox()
    
    button.Render()
    checkbox.Render()
}
```

## Фабрика с конфигурацией

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

## Фабрика с валидацией

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

## Регистрация фабрик

Для расширяемости без изменения кода:

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

## Фабрика с пулом объектов

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

## Когда использовать Factory

### 1. Создание зависит от условий

```go
func NewCache(size int) Cache {
    if size > 1000 {
        return &RedisCache{}
    }
    return &MemoryCache{}
}
```

### 2. Сложная инициализация

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

### 3. Скрытие реализации

```go
func NewMetrics() Metrics {
    return &prometheusMetrics{
        registry: prometheus.NewRegistry(),
    }
}
```

## Когда НЕ использовать Factory

### 1. Простые структуры

```go
// Не нужно
func NewPoint(x, y int) *Point {
    return &Point{x: x, y: y}
}

// Достаточно
point := Point{X: 10, Y: 20}
```

### 2. Один тип

```go
// Не нужно
func NewUser() *User {
    return &User{}
}

// Достаточно
user := &User{}
```

### 3. Нет логики создания

```go
// Не нужно
func NewConfig() *Config {
    return &Config{}
}

// Достаточно
config := &Config{}
```

## Фабрика vs Builder

```go
// Factory: создание за один вызов
db := NewDatabase("postgres")

// Builder: пошаговое создание
db := NewDatabaseBuilder().
    WithHost("localhost").
    WithPort(5432).
    WithSSL(true).
    Build()
```

`Factory` для простых случаев. `Builder` для сложных объектов с множеством параметров.

## Тестирование с фабриками

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
    // Тест с mock-репозиторием
}
```

## Производительность

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

Фабрика добавляет минимальный overhead. Для большинства случаев разница незаметна.

## Реальный пример: HTTP клиент

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

Использование:

```go
client := NewHTTPClient(
    WithTimeout(10 * time.Second),
    WithRetries(5),
)
```

## Заключение

`Factory Pattern` в Go:

- Используйте для создания объектов с условиями
- Скрывайте конкретные реализации за интерфейсами
- Применяйте для сложной инициализации
- Комбинируйте с функциональными опциями
- Избегайте для простых структур

`Factory` - это не про усложнение. Это про `гибкость и расширяемость`.

Если создание объекта - это одна строка, фабрика не нужна. Если создание зависит от условий, требует валидации или скрывает детали - фабрика поможет.
