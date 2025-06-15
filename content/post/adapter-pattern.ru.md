---
title: "Adapter Pattern в Go: совместимость интерфейсов"
date: 2025-06-15T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "adapter"]
categories: ["Patterns"]
---

`Adapter Pattern` решает проблему несовместимости интерфейсов. У вас есть код, который ожидает один интерфейс, и библиотека, которая предоставляет другой. `Адаптер` — это прослойка, которая делает их совместимыми.

<!--more-->

## Проблема: несовместимые интерфейсы

Ваш код работает с интерфейсом Logger:

```go
type Logger interface {
    Log(level, message string)
}
```

Но сторонняя библиотека предоставляет другой интерфейс:

```go
type ZapLogger struct{}

func (z *ZapLogger) Info(msg string) {}
func (z *ZapLogger) Error(msg string) {}
func (z *ZapLogger) Debug(msg string) {}
```

Интерфейсы несовместимы. Нужен адаптер.

## Решение: адаптер

```go
type ZapLoggerAdapter struct {
    logger *ZapLogger
}

func (a *ZapLoggerAdapter) Log(level, message string) {
    switch level {
    case "info":
        a.logger.Info(message)
    case "error":
        a.logger.Error(message)
    case "debug":
        a.logger.Debug(message)
    }
}
```

Теперь ZapLogger совместим с интерфейсом Logger.

## Реальный пример 1: миграция с Logrus на Zap

У вас legacy-код с Logrus:

```go
type LogrusLogger struct {
    logger *logrus.Logger
}

func (l *LogrusLogger) Info(msg string) {
    l.logger.Info(msg)
}
```

Новый код использует стандартный интерфейс:

```go
type AppLogger interface {
    Log(ctx context.Context, level Level, msg string)
}
```

Адаптер для Logrus:

```go
type LogrusAdapter struct {
    logger *logrus.Logger
}

func (a *LogrusAdapter) Log(ctx context.Context, level Level, msg string) {
    entry := a.logger.WithContext(ctx)
    
    switch level {
    case LevelInfo:
        entry.Info(msg)
    case LevelError:
        entry.Error(msg)
    case LevelDebug:
        entry.Debug(msg)
    }
}
```

Адаптер для Zap:

```go
type ZapAdapter struct {
    logger *zap.Logger
}

func (a *ZapAdapter) Log(ctx context.Context, level Level, msg string) {
    switch level {
    case LevelInfo:
        a.logger.Info(msg)
    case LevelError:
        a.logger.Error(msg)
    case LevelDebug:
        a.logger.Debug(msg)
    }
}
```

Теперь можно переключаться между логгерами без изменения кода:

```go
var logger AppLogger

if useZap {
    logger = &ZapAdapter{logger: zap.NewProduction()}
} else {
    logger = &LogrusAdapter{logger: logrus.New()}
}

logger.Log(ctx, LevelInfo, "Application started")
```

## Реальный пример 2: интеграция платёжных систем

Ваше приложение работает с интерфейсом Payment:

```go
type Payment interface {
    Charge(amount int, currency string) (string, error)
    Refund(transactionID string) error
}
```

Stripe API:

```go
type StripeClient struct{}

func (s *StripeClient) CreateCharge(params ChargeParams) (*Charge, error) {
    // Stripe-специфичная логика
}

func (s *StripeClient) CreateRefund(chargeID string) (*Refund, error) {
    // Stripe-специфичная логика
}
```

Адаптер для Stripe:

```go
type StripeAdapter struct {
    client *StripeClient
}

func (a *StripeAdapter) Charge(amount int, currency string) (string, error) {
    charge, err := a.client.CreateCharge(ChargeParams{
        Amount:   amount,
        Currency: currency,
    })
    if err != nil {
        return "", err
    }
    return charge.ID, nil
}

func (a *StripeAdapter) Refund(transactionID string) error {
    _, err := a.client.CreateRefund(transactionID)
    return err
}
```

PayPal API другой:

```go
type PayPalClient struct{}

func (p *PayPalClient) ProcessPayment(req PaymentRequest) (*PaymentResponse, error) {
    // PayPal-специфичная логика
}

func (p *PayPalClient) RefundPayment(paymentID string) error {
    // PayPal-специфичная логика
}
```

Адаптер для PayPal:

```go
type PayPalAdapter struct {
    client *PayPalClient
}

func (a *PayPalAdapter) Charge(amount int, currency string) (string, error) {
    resp, err := a.client.ProcessPayment(PaymentRequest{
        Amount:   amount,
        Currency: currency,
    })
    if err != nil {
        return "", err
    }
    return resp.TransactionID, nil
}

func (a *PayPalAdapter) Refund(transactionID string) error {
    return a.client.RefundPayment(transactionID)
}
```

Использование:

```go
func ProcessOrder(payment Payment, amount int) error {
    transactionID, err := payment.Charge(amount, "USD")
    if err != nil {
        return err
    }
    
    // Если что-то пошло не так
    if needRefund {
        return payment.Refund(transactionID)
    }
    
    return nil
}

// Работает с любым провайдером
stripe := &StripeAdapter{client: stripeClient}
paypal := &PayPalAdapter{client: paypalClient}

ProcessOrder(stripe, 1000)
ProcessOrder(paypal, 1000)
```

## Реальный пример 3: работа с разными базами данных

Ваш интерфейс репозитория:

```go
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Save(ctx context.Context, user *User) error
}
```

PostgreSQL с sqlx:

```go
type PostgresUserRepo struct {
    db *sqlx.DB
}

func (r *PostgresUserRepo) FindByID(ctx context.Context, id string) (*User, error) {
    var user User
    err := r.db.GetContext(ctx, &user, "SELECT * FROM users WHERE id = $1", id)
    return &user, err
}

func (r *PostgresUserRepo) Save(ctx context.Context, user *User) error {
    _, err := r.db.ExecContext(ctx, 
        "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
        user.ID, user.Name, user.Email)
    return err
}
```

MongoDB с официальным драйвером:

```go
type MongoUserRepo struct {
    collection *mongo.Collection
}

func (r *MongoUserRepo) FindByID(ctx context.Context, id string) (*User, error) {
    var user User
    err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
    return &user, err
}

func (r *MongoUserRepo) Save(ctx context.Context, user *User) error {
    _, err := r.collection.InsertOne(ctx, user)
    return err
}
```

Оба репозитория реализуют один интерфейс — это и есть адаптер. Можно переключаться между БД:

```go
var repo UserRepository

if useMongo {
    repo = &MongoUserRepo{collection: mongoCollection}
} else {
    repo = &PostgresUserRepo{db: postgresDB}
}

user, err := repo.FindByID(ctx, "123")
```

## Реальный пример 4: кэширование с разными бэкендами

Интерфейс кэша:

```go
type Cache interface {
    Get(key string) ([]byte, error)
    Set(key string, value []byte, ttl time.Duration) error
    Delete(key string) error
}
```

Redis адаптер:

```go
type RedisCache struct {
    client *redis.Client
}

func (c *RedisCache) Get(key string) ([]byte, error) {
    return c.client.Get(context.Background(), key).Bytes()
}

func (c *RedisCache) Set(key string, value []byte, ttl time.Duration) error {
    return c.client.Set(context.Background(), key, value, ttl).Err()
}

func (c *RedisCache) Delete(key string) error {
    return c.client.Del(context.Background(), key).Err()
}
```

Memcached адаптер:

```go
type MemcachedCache struct {
    client *memcache.Client
}

func (c *MemcachedCache) Get(key string) ([]byte, error) {
    item, err := c.client.Get(key)
    if err != nil {
        return nil, err
    }
    return item.Value, nil
}

func (c *MemcachedCache) Set(key string, value []byte, ttl time.Duration) error {
    return c.client.Set(&memcache.Item{
        Key:        key,
        Value:      value,
        Expiration: int32(ttl.Seconds()),
    })
}

func (c *MemcachedCache) Delete(key string) error {
    return c.client.Delete(key)
}
```

In-memory адаптер для тестов:

```go
type InMemoryCache struct {
    data map[string][]byte
    mu   sync.RWMutex
}

func (c *InMemoryCache) Get(key string) ([]byte, error) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    
    value, ok := c.data[key]
    if !ok {
        return nil, errors.New("key not found")
    }
    return value, nil
}

func (c *InMemoryCache) Set(key string, value []byte, ttl time.Duration) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    c.data[key] = value
    return nil
}

func (c *InMemoryCache) Delete(key string) error {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    delete(c.data, key)
    return nil
}
```

## Реальный пример 5: HTTP клиенты

Стандартный интерфейс:

```go
type HTTPClient interface {
    Do(req *http.Request) (*http.Response, error)
}
```

Стандартный http.Client уже реализует этот интерфейс. Но что если нужен клиент с retry?

```go
type RetryHTTPClient struct {
    client  *http.Client
    retries int
}

func (c *RetryHTTPClient) Do(req *http.Request) (*http.Response, error) {
    var resp *http.Response
    var err error
    
    for i := 0; i <= c.retries; i++ {
        resp, err = c.client.Do(req)
        if err == nil && resp.StatusCode < 500 {
            return resp, nil
        }
        
        if i < c.retries {
            time.Sleep(time.Second * time.Duration(i+1))
        }
    }
    
    return resp, err
}
```

Или клиент с метриками:

```go
type MetricsHTTPClient struct {
    client  HTTPClient
    metrics *prometheus.CounterVec
}

func (c *MetricsHTTPClient) Do(req *http.Request) (*http.Response, error) {
    start := time.Now()
    resp, err := c.client.Do(req)
    duration := time.Since(start)
    
    status := "success"
    if err != nil {
        status = "error"
    }
    
    c.metrics.WithLabelValues(req.Method, status).Inc()
    
    return resp, err
}
```

Композиция адаптеров:

```go
client := &MetricsHTTPClient{
    client: &RetryHTTPClient{
        client:  http.DefaultClient,
        retries: 3,
    },
    metrics: prometheusMetrics,
}
```

## Реальный пример 6: облачные хранилища

Интерфейс хранилища:

```go
type Storage interface {
    Upload(ctx context.Context, key string, data []byte) error
    Download(ctx context.Context, key string) ([]byte, error)
    Delete(ctx context.Context, key string) error
}
```

AWS S3 адаптер:

```go
type S3Storage struct {
    client *s3.Client
    bucket string
}

func (s *S3Storage) Upload(ctx context.Context, key string, data []byte) error {
    _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
        Body:   bytes.NewReader(data),
    })
    return err
}

func (s *S3Storage) Download(ctx context.Context, key string) ([]byte, error) {
    result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    })
    if err != nil {
        return nil, err
    }
    defer result.Body.Close()
    
    return io.ReadAll(result.Body)
}
```

Google Cloud Storage адаптер:

```go
type GCSStorage struct {
    client *storage.Client
    bucket string
}

func (g *GCSStorage) Upload(ctx context.Context, key string, data []byte) error {
    wc := g.client.Bucket(g.bucket).Object(key).NewWriter(ctx)
    defer wc.Close()
    
    _, err := wc.Write(data)
    return err
}

func (g *GCSStorage) Download(ctx context.Context, key string) ([]byte, error) {
    rc, err := g.client.Bucket(g.bucket).Object(key).NewReader(ctx)
    if err != nil {
        return nil, err
    }
    defer rc.Close()
    
    return io.ReadAll(rc)
}
```

Локальная файловая система для разработки:

```go
type LocalStorage struct {
    basePath string
}

func (l *LocalStorage) Upload(ctx context.Context, key string, data []byte) error {
    path := filepath.Join(l.basePath, key)
    return os.WriteFile(path, data, 0644)
}

func (l *LocalStorage) Download(ctx context.Context, key string) ([]byte, error) {
    path := filepath.Join(l.basePath, key)
    return os.ReadFile(path)
}
```

## Когда использовать Adapter

1. **Интеграция сторонних библиотек** — когда их интерфейс не совпадает с вашим
2. **Миграция между технологиями** — постепенная замена одной библиотеки на другую
3. **Абстракция инфраструктуры** — независимость от конкретных реализаций
4. **Мультитенантность** — поддержка разных провайдеров для разных клиентов
5. **Тестирование** — создание mock-адаптеров для тестов

## Adapter vs Facade

Adapter делает один интерфейс совместимым с другим. `Facade` упрощает сложный интерфейс.

```go
// Adapter: преобразование интерфейса
type LoggerAdapter struct {
    logger *ThirdPartyLogger
}

func (a *LoggerAdapter) Log(msg string) {
    a.logger.WriteLog(msg, time.Now())
}

// Facade: упрощение интерфейса
type DatabaseFacade struct {
    conn *sql.DB
    cache *redis.Client
    queue *kafka.Producer
}

func (f *DatabaseFacade) SaveUser(user *User) error {
    // Скрывает сложность работы с БД, кэшем и очередью
}
```

## Производительность

Адаптер добавляет один уровень косвенности. Overhead минимален:

```go
func BenchmarkDirect(b *testing.B) {
    logger := &ZapLogger{}
    for i := 0; i < b.N; i++ {
        logger.Info("test")
    }
}

func BenchmarkAdapter(b *testing.B) {
    adapter := &ZapLoggerAdapter{logger: &ZapLogger{}}
    for i := 0; i < b.N; i++ {
        adapter.Log("info", "test")
    }
}
```

Разница обычно в пределах 1-2 наносекунд.

## Заключение

`Adapter Pattern` в Go:

- Используйте для интеграции сторонних библиотек
- Применяйте при миграции между технологиями
- Создавайте адаптеры для тестирования
- Абстрагируйте инфраструктуру через адаптеры
- Комбинируйте адаптеры для расширения функциональности

`Адаптер` — это не усложнение. Это гибкость и независимость от конкретных реализаций.

В современных приложениях адаптеры везде: логгеры, базы данных, кэши, платёжные системы, облачные сервисы. Они делают код переносимым и тестируемым.
