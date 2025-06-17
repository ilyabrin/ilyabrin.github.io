---
title: "Adapter Pattern in Go: Interface Compatibility"
date: 2025-06-15T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "adapter"]
categories: ["Patterns"]
---

`Adapter Pattern` solves the problem of interface incompatibility. You have code expecting one interface, and a library providing another. An `adapter` is a layer that makes them compatible.

<!--more-->

## Problem: Incompatible Interfaces

Your code works with Logger interface:

```go
type Logger interface {
    Log(level, message string)
}
```

But a third-party library provides a different interface:

```go
type ZapLogger struct{}

func (z *ZapLogger) Info(msg string) {}
func (z *ZapLogger) Error(msg string) {}
func (z *ZapLogger) Debug(msg string) {}
```

Interfaces are incompatible. Need an adapter.

## Solution: Adapter

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

Now ZapLogger is compatible with Logger interface.

## Real Example 1: Migrating from Logrus to Zap

You have legacy code with Logrus:

```go
type LogrusLogger struct {
    logger *logrus.Logger
}

func (l *LogrusLogger) Info(msg string) {
    l.logger.Info(msg)
}
```

New code uses standard interface:

```go
type AppLogger interface {
    Log(ctx context.Context, level Level, msg string)
}
```

Adapter for Logrus:

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

Adapter for Zap:

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

Now you can switch between loggers without changing code:

```go
var logger AppLogger

if useZap {
    logger = &ZapAdapter{logger: zap.NewProduction()}
} else {
    logger = &LogrusAdapter{logger: logrus.New()}
}

logger.Log(ctx, LevelInfo, "Application started")
```

## Real Example 2: Payment System Integration

Your application works with Payment interface:

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
    // Stripe-specific logic
}

func (s *StripeClient) CreateRefund(chargeID string) (*Refund, error) {
    // Stripe-specific logic
}
```

Adapter for Stripe:

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

PayPal API is different:

```go
type PayPalClient struct{}

func (p *PayPalClient) ProcessPayment(req PaymentRequest) (*PaymentResponse, error) {
    // PayPal-specific logic
}

func (p *PayPalClient) RefundPayment(paymentID string) error {
    // PayPal-specific logic
}
```

Adapter for PayPal:

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

Usage:

```go
func ProcessOrder(payment Payment, amount int) error {
    transactionID, err := payment.Charge(amount, "USD")
    if err != nil {
        return err
    }
    
    // If something goes wrong
    if needRefund {
        return payment.Refund(transactionID)
    }
    
    return nil
}

// Works with any provider
stripe := &StripeAdapter{client: stripeClient}
paypal := &PayPalAdapter{client: paypalClient}

ProcessOrder(stripe, 1000)
ProcessOrder(paypal, 1000)
```

## Real Example 3: Working with Different Databases

Your repository interface:

```go
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Save(ctx context.Context, user *User) error
}
```

PostgreSQL with sqlx:

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

MongoDB with official driver:

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

Both repositories implement the same interface — this is the adapter. You can switch between databases:

```go
var repo UserRepository

if useMongo {
    repo = &MongoUserRepo{collection: mongoCollection}
} else {
    repo = &PostgresUserRepo{db: postgresDB}
}

user, err := repo.FindByID(ctx, "123")
```

## Real Example 4: Caching with Different Backends

Cache interface:

```go
type Cache interface {
    Get(key string) ([]byte, error)
    Set(key string, value []byte, ttl time.Duration) error
    Delete(key string) error
}
```

Redis adapter:

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

Memcached adapter:

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

In-memory adapter for tests:

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

## Real Example 5: HTTP Clients

Standard interface:

```go
type HTTPClient interface {
    Do(req *http.Request) (*http.Response, error)
}
```

Standard http.Client already implements this interface. But what if you need a client with retry?

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

Or client with metrics:

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

Composing adapters:

```go
client := &MetricsHTTPClient{
    client: &RetryHTTPClient{
        client:  http.DefaultClient,
        retries: 3,
    },
    metrics: prometheusMetrics,
}
```

## Real Example 6: Cloud Storage

Storage interface:

```go
type Storage interface {
    Upload(ctx context.Context, key string, data []byte) error
    Download(ctx context.Context, key string) ([]byte, error)
    Delete(ctx context.Context, key string) error
}
```

AWS S3 adapter:

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

Google Cloud Storage adapter:

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

Local filesystem for development:

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

## When to Use Adapter

1. **Third-party library integration** — when their interface doesn't match yours
2. **Technology migration** — gradual replacement of one library with another
3. **Testing** — creating mock adapters for tests
4. **Multi-tenancy** — supporting different providers for different clients
5. **Infrastructure abstraction** — independence from specific implementations

## Adapter vs Facade

Adapter makes one interface compatible with another. Facade simplifies a complex interface.

```go
// Adapter: interface transformation
type LoggerAdapter struct {
    logger *ThirdPartyLogger
}

func (a *LoggerAdapter) Log(msg string) {
    a.logger.WriteLog(msg, time.Now())
}

// Facade: interface simplification
type DatabaseFacade struct {
    conn *sql.DB
    cache *redis.Client
    queue *kafka.Producer
}

func (f *DatabaseFacade) SaveUser(user *User) error {
    // Hides complexity of working with DB, cache, and queue
}
```

## Performance

Adapter adds one level of indirection. Overhead is minimal:

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

Difference is usually within 1-2 nanoseconds.

## Conclusion

Adapter Pattern in Go:

- Use for third-party library integration
- Apply during technology migration
- Create adapters for testing
- Abstract infrastructure through adapters
- Combine adapters to extend functionality

Adapter isn't complication. It's flexibility and independence from specific implementations.

In modern applications, adapters are everywhere: loggers, databases, caches, payment systems, cloud services. They make code portable and testable.
