---
title: "Go Race Detector: Finding and Fixing Data Races"
date: 2025-01-15T19:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'concurrency', 'debugging']
tags: ['golang', 'race-detector', 'concurrency', 'data-races', 'debugging', 'goroutines', 'sync']
---

Hey bug hunter! 👋

**Data races** are the most insidious bugs in concurrent programs. They **hide in production**, **don't reproduce locally**, and **corrupt data** in the most unpredictable ways.

Fortunately, Go has a **built-in race detector** that finds these bugs **automatically**. It's like an X-ray for your concurrent code!

Let's explore **what data races are**, **how to find them**, and **how to fix them** using Go Race Detector 🚀

<!--more-->

## 1. What is a Data Race

### Definition

A **Data Race** occurs when:

1. Two or more goroutines **simultaneously** access the same variable
2. At least one of them **writes** to that variable
3. There's no **synchronization** between these accesses

### Simple data race example

```go
package main

import (
    "fmt"
    "time"
)

var counter int

func increment() {
    for i := 0; i < 1000; i++ {
        counter++ // RACE CONDITION!
    }
}

func main() {
    go increment()
    go increment()
    
    time.Sleep(time.Second)
    fmt.Println("Counter:", counter) // Result is unpredictable!
}
```

**Problem:** `counter++` is not an atomic operation. It consists of:

1. Reading the value of `counter`
2. Incrementing by 1
3. Writing back

Between these steps, another goroutine can modify `counter`.

### Why data races are dangerous

```go
// Example from real project
type UserCache struct {
    users map[string]*User
}

func (uc *UserCache) GetUser(id string) *User {
    return uc.users[id] // RACE: read
}

func (uc *UserCache) SetUser(id string, user *User) {
    uc.users[id] = user // RACE: write
}

// Result: panic, corrupted data, unpredictable behavior
```

## 2. Go Race Detector: How to Use

### Enabling the detector

```bash
# Run with race detector
go run -race main.go

# Test with race detector
go test -race ./...

# Build with race detector
go build -race -o myapp main.go
```

### Example of race detection

```go
// race_example.go
package main

import (
    "fmt"
    "sync"
)

var data int

func writer(wg *sync.WaitGroup) {
    defer wg.Done()
    data = 42 // Write
}

func reader(wg *sync.WaitGroup) {
    defer wg.Done()
    fmt.Println(data) // Read
}

func main() {
    var wg sync.WaitGroup
    wg.Add(2)
    
    go writer(&wg)
    go reader(&wg)
    
    wg.Wait()
}
```

**Run:**

```bash
go run -race race_example.go
```

**Detector output:**

```sh
==================
WARNING: DATA RACE
Write at 0x00c000014088 by goroutine 7:
  main.writer()
      /path/race_example.go:11 +0x38

Previous read at 0x00c000014088 by goroutine 8:
  main.reader()
      /path/race_example.go:16 +0x3a

Goroutine 7 (running) created at:
  main.main()
      /path/race_example.go:23 +0x7e

Goroutine 8 (running) created at:
  main.main()
      /path/race_example.go:24 +0x96
==================
```

## 3. Common Data Race Patterns

### Race in map

```go
// BAD: concurrent access to map
type Cache struct {
    data map[string]string
}

func (c *Cache) Get(key string) string {
    return c.data[key] // RACE
}

func (c *Cache) Set(key, value string) {
    c.data[key] = value // RACE
}

// GOOD: with mutex
type SafeCache struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *SafeCache) Get(key string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data[key]
}

func (c *SafeCache) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}
```

### Race in slice

```go
// BAD: concurrent append
var items []string

func addItem(item string) {
    items = append(items, item) // RACE
}

// GOOD: with mutex
type SafeSlice struct {
    mu    sync.Mutex
    items []string
}

func (s *SafeSlice) Add(item string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.items = append(s.items, item)
}
```

### Race in counters

```go
// BAD: regular increment
var counter int64

func increment() {
    counter++ // RACE
}

// GOOD: atomic operations
import "sync/atomic"

var counter int64

func increment() {
    atomic.AddInt64(&counter, 1)
}

func getCounter() int64 {
    return atomic.LoadInt64(&counter)
}
```

## 4. Fixing Data Races

### Method 1: Mutexes

```go
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

func (c *Counter) Value() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.value
}
```

### Method 2: Atomic Operations

```go
import "sync/atomic"

type AtomicCounter struct {
    value int64
}

func (c *AtomicCounter) Increment() {
    atomic.AddInt64(&c.value, 1)
}

func (c *AtomicCounter) Value() int64 {
    return atomic.LoadInt64(&c.value)
}
```

### Method 3: Channels

```go
type ChannelCounter struct {
    ch chan int
    value int
}

func NewChannelCounter() *ChannelCounter {
    c := &ChannelCounter{
        ch: make(chan int),
    }
    go c.run()
    return c
}

func (c *ChannelCounter) run() {
    for delta := range c.ch {
        c.value += delta
    }
}

func (c *ChannelCounter) Increment() {
    c.ch <- 1
}
```

### Method 4: sync.Once for initialization

```go
// BAD: race in lazy initialization
var instance *Singleton

func GetInstance() *Singleton {
    if instance == nil { // RACE
        instance = &Singleton{} // RACE
    }
    return instance
}

// GOOD: with sync.Once
var (
    instance *Singleton
    once     sync.Once
)

func GetInstance() *Singleton {
    once.Do(func() {
        instance = &Singleton{}
    })
    return instance
}
```

## 5. Advanced Techniques

### Detector in tests

```go
func TestConcurrentAccess(t *testing.T) {
    cache := NewSafeCache()
    
    // Launch many goroutines
    var wg sync.WaitGroup
    for i := 0; i < 100; i++ {
        wg.Add(2)
        
        go func(id int) {
            defer wg.Done()
            cache.Set(fmt.Sprintf("key%d", id), "value")
        }(i)
        
        go func(id int) {
            defer wg.Done()
            cache.Get(fmt.Sprintf("key%d", id))
        }(i)
    }
    
    wg.Wait()
}

// Run: go test -race
```

### Benchmarks with race detector

```go
func BenchmarkCounter(b *testing.B) {
    counter := &AtomicCounter{}
    
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            counter.Increment()
        }
    })
}

// Run: go test -race -bench=.
```

### Detector configuration

```bash
# Increase memory limit for detector
export GORACE="log_path=./race_log halt_on_error=1"

# GORACE options:
# log_path - where to write logs
# halt_on_error - stop on first race
# strip_path_prefix - remove prefix from paths
```

## 6. Real Production Examples

### HTTP server with race

```go
// BAD: race in HTTP handler
type Server struct {
    requestCount int
}

func (s *Server) handler(w http.ResponseWriter, r *http.Request) {
    s.requestCount++ // RACE: many goroutines access simultaneously
    fmt.Fprintf(w, "Request #%d", s.requestCount)
}

// GOOD: with atomic counter
type SafeServer struct {
    requestCount int64
}

func (s *SafeServer) handler(w http.ResponseWriter, r *http.Request) {
    count := atomic.AddInt64(&s.requestCount, 1)
    fmt.Fprintf(w, "Request #%d", count)
}
```

### Cache with TTL

```go
type CacheItem struct {
    Value     interface{}
    ExpiresAt time.Time
}

type TTLCache struct {
    mu    sync.RWMutex
    items map[string]*CacheItem
}

func (c *TTLCache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    
    item, exists := c.items[key]
    if !exists || time.Now().After(item.ExpiresAt) {
        return nil, false
    }
    
    return item.Value, true
}

func (c *TTLCache) Set(key string, value interface{}, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()
    
    c.items[key] = &CacheItem{
        Value:     value,
        ExpiresAt: time.Now().Add(ttl),
    }
}

func (c *TTLCache) cleanup() {
    ticker := time.NewTicker(time.Minute)
    defer ticker.Stop()
    
    for range ticker.C {
        c.mu.Lock()
        now := time.Now()
        for key, item := range c.items {
            if now.After(item.ExpiresAt) {
                delete(c.items, key)
            }
        }
        c.mu.Unlock()
    }
}
```

## 7. Race Detector Performance

### Performance impact

```go
func BenchmarkWithoutRace(b *testing.B) {
    counter := &AtomicCounter{}
    for i := 0; i < b.N; i++ {
        counter.Increment()
    }
}

// Without race detector: 50 ns/op
// With race detector:    500 ns/op (10x slower)
```

**Recommendations:**

- Use race detector in **tests** and **development**
- **DON'T use** in production (too slow)
- Run CI/CD with `-race` flag

### Testing optimization

```go
// Conditional compilation for race detector
//go:build race
// +build race

package main

import "log"

func init() {
    log.Println("Race detector enabled")
}
```

## 8. Alternatives to Race Detector

### Static analysis

```bash
# go vet finds some race conditions
go vet ./...

# golangci-lint with additional checks
golangci-lint run --enable=gocritic,gosec
```

### Stress testing

```go
func TestStress(t *testing.T) {
    if testing.Short() {
        t.Skip("Skipping stress test in short mode")
    }
    
    cache := NewSafeCache()
    
    // Run for 10 seconds
    done := make(chan bool)
    go func() {
        time.Sleep(10 * time.Second)
        close(done)
    }()
    
    var wg sync.WaitGroup
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for {
                select {
                case <-done:
                    return
                default:
                    cache.Set("key", "value")
                    cache.Get("key")
                }
            }
        }()
    }
    
    wg.Wait()
}
```

## 9. Best Practices

### Rules for safe concurrent code

```go
// 1. Use sync.RWMutex for read-heavy workloads
type ReadHeavyCache struct {
    mu   sync.RWMutex // RWMutex instead of Mutex
    data map[string]string
}

// 2. Minimize lock time
func (c *ReadHeavyCache) Get(key string) string {
    c.mu.RLock()
    value := c.data[key] // Fast operation
    c.mu.RUnlock()
    return value
}

// 3. Use defer for unlock
func (c *ReadHeavyCache) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock() // Guaranteed unlock
    c.data[key] = value
}

// 4. Atomic operations for simple cases
var counter int64

func incrementCounter() {
    atomic.AddInt64(&counter, 1) // Faster than mutex
}
```

### Patterns to avoid races

```go
// Pattern: ownership transfer through channels
func processData(data []int) <-chan int {
    result := make(chan int)
    
    go func() {
        defer close(result)
        for _, item := range data {
            result <- item * 2 // Only one goroutine writes
        }
    }()
    
    return result // Ownership transferred through channel
}

// Pattern: immutable data
type ImmutableConfig struct {
    host string
    port int
}

func (c *ImmutableConfig) Host() string { return c.host }
func (c *ImmutableConfig) Port() int    { return c.port }

// New config = new object
func (c *ImmutableConfig) WithPort(port int) *ImmutableConfig {
    return &ImmutableConfig{
        host: c.host,
        port: port,
    }
}
```

## Conclusion: Race detector is your best friend

**Key principles:**
🔍 **Always use** `-race` in tests  
🚫 **Never ignore** detector warnings  
🔒 **Protect shared state** with mutexes or atomic operations  
📊 **Prefer** atomic operations for simple cases  
🧪 **Write stress tests** for concurrent code  

**Golden rule:**
> If two goroutines access the same variable and at least one writes - synchronization is needed!

**Remember:** data races aren't just bugs, they're **undefined behavior**. The program can behave differently on different machines and at different times.

**P.S. Have you found data races in your code? What were the trickiest cases?** 🚀

```go
// Additional resources:
// - "Go Memory Model": https://golang.org/ref/mem
// - "Introducing the Go Race Detector": https://blog.golang.org/race-detector
// - "Advanced Go Concurrency Patterns": https://talks.golang.org/2013/advconc.slide
```
