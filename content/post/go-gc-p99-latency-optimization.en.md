---
title: "Go Runtime: How GC Impacts P99 Latency in High-Load APIs"
date: 2025-12-27T10:00:00Z
draft: false
tags: ["golang", "gc", "garbage-collector", "performance", "latency", "optimization"]
categories: ["Go", "Performance"]
description: "Practical guide to optimizing P99 latency in Go applications: how the garbage collector affects performance and what to do about it in production."
---

You have a great API with median latency of 5ms, but P99 suddenly spikes to 500ms? Clients complain about periodic freezes? Welcome to the world of Go Garbage Collector and its impact on tail latency.

In this article, we'll tackle a real problem: how a 10ms GC pause turns into 500ms latency for users, and what to do to keep P99 latency under control.

<!--more-->

## The Problem: Great P50, Terrible P99

### Real Production Case

```sh
API metrics before optimization:
P50:  4ms  ✅
P90:  12ms ✅
P95:  45ms ⚠️
P99:  520ms ❌
P99.9: 2.1s  💥
```

**What's happening:**

- 50% of requests processed in 4ms - excellent
- 90% in 12ms - good
- But 1% of users wait half a second
- And 0.1% wait 2+ seconds!

**Why is this critical:**

```sh
At 100,000 RPS:
- 1,000 requests/sec get 500ms latency
- 100 requests/sec wait 2+ seconds
- 60,000 bad requests per minute
```

The problem? **Garbage Collector pauses.**

## How Go GC Works

### Concurrent Mark-Sweep

Go uses a concurrent garbage collector with phases:

```sh
1. Mark Setup (STW)    - ~50-200μs
   ↓ (stops entire application)

2. Concurrent Mark     - main time
   ↓ (runs parallel with application)

3. Mark Termination (STW) - ~50-500μs
   ↓ (stops again)

4. Sweep (concurrent)  - background cleanup
```

**Stop-The-World (STW) phases** are the source of latency spikes.

### When GC Triggers

```go
// GC triggers when twice as much memory is allocated
// as remained after the last GC

// Example:
// After GC remaining: 1GB
// GC triggers when: heap reaches 2GB
// This is controlled by GOGC (default 100)
```

**The problem in high-load APIs:**

```go
// At 100k RPS and 1KB per request:
// 100,000 req/s * 1KB = ~100MB/s allocations

// With GOGC=100 and 1GB after last GC:
// GC triggers after ~10 seconds
// Much garbage accumulates
// GC pause will be long
```

## Diagnosing the Problem

### Step 1: Enable GC Logging

```bash
# Export environment variable
export GODEBUG=gctrace=1

# Run application
./your-app
```

**GC trace output:**

```sh
gc 1 @0.004s 2%: 0.018+1.3+0.076 ms clock, 0.14+0.35/1.2/3.0+0.61 ms cpu, 4->4->3 MB, 5 MB goal, 8 P
gc 2 @0.015s 3%: 0.021+2.1+0.095 ms clock, 0.17+0.42/2.0/5.2+0.76 ms cpu, 5->6->4 MB, 6 MB goal, 8 P
gc 3 @0.045s 4%: 0.025+15.2+0.12 ms clock, 0.20+0.68/14.8/42.1+0.99 ms cpu, 7->9->6 MB, 8 MB goal, 8 P
                    ^^^^
                    Mark phase - affects latency!
```

**Decoding important parts:**

```sh
gc 3 @0.045s 4%: 0.025+15.2+0.12 ms clock
                  ^^^^^  ^^^^  ^^^^^
                  STW    Mark  STW
                  setup  phase term
```

### Step 2: Measure Real Impact

```go
package main

import (
    "fmt"
    "runtime"
    "runtime/debug"
    "time"
)

type LatencyTracker struct {
    samples []time.Duration
}

func (lt *LatencyTracker) Track(d time.Duration) {
    lt.samples = append(lt.samples, d)
}

func (lt *LatencyTracker) Percentile(p float64) time.Duration {
    if len(lt.samples) == 0 {
        return 0
    }

    sort.Slice(lt.samples, func(i, j int) bool {
        return lt.samples[i] < lt.samples[j]
    })

    idx := int(float64(len(lt.samples)) * p / 100.0)
    if idx >= len(lt.samples) {
        idx = len(lt.samples) - 1
    }

    return lt.samples[idx]
}

func benchmarkWithGC() {
    tracker := &LatencyTracker{}

    // Simulate load
    for i := 0; i < 100000; i++ {
        start := time.Now()

        // Simulate request processing with allocations
        data := make([]byte, 1024)
        _ = processRequest(data)

        elapsed := time.Since(start)
        tracker.Track(elapsed)

        // Every 1000 requests - output statistics
        if i > 0 && i%1000 == 0 {
            var m runtime.MemStats
            runtime.ReadMemStats(&m)

            fmt.Printf("Request %d - Heap: %d MB, P99: %v\n",
                i,
                m.HeapAlloc/1024/1024,
                tracker.Percentile(99),
            )
        }
    }

    fmt.Printf("\nFinal stats:\n")
    fmt.Printf("P50:  %v\n", tracker.Percentile(50))
    fmt.Printf("P90:  %v\n", tracker.Percentile(90))
    fmt.Printf("P99:  %v\n", tracker.Percentile(99))
    fmt.Printf("P99.9: %v\n", tracker.Percentile(99.9))
}

func processRequest(data []byte) []byte {
    // Create temporary objects (pressure on GC)
    temp := make([]byte, len(data)*2)
    copy(temp, data)
    return temp[:len(data)]
}
```

### Step 3: Profiling

```go
import (
    _ "net/http/pprof"
    "net/http"
)

func main() {
    // Enable pprof endpoints
    go func() {
        http.ListenAndServe("localhost:6060", nil)
    }()

    // Your application
    runApp()
}
```

**Analyze allocations:**

```bash
# Collect heap profile
curl http://localhost:6060/debug/pprof/heap > heap.prof

# Analyze
go tool pprof heap.prof

# In pprof console
(pprof) top10
(pprof) list functionName
(pprof) web  # visualization
```

## Solution 1: GOGC Tuning

### Understanding GOGC

```go
// GOGC controls GC aggressiveness
// Default GOGC=100

// GOGC=100: GC triggers when heap grew by 100%
// Live heap: 1GB -> GC at 2GB

// GOGC=200: GC triggers when heap grew by 200%
// Live heap: 1GB -> GC at 3GB

// GOGC=50: GC triggers when heap grew by 50%
// Live heap: 1GB -> GC at 1.5GB
```

### Strategy: Increase GOGC

```go
package main

import (
    "os"
    "runtime/debug"
)

func init() {
    // Option 1: via environment variable
    // export GOGC=200

    // Option 2: programmatically
    debug.SetGCPercent(200)
}

func main() {
    // Your application
}
```

**Effect:**

```sh
Before (GOGC=100):
- GC every 10 seconds
- Pause 15ms
- P99: 520ms

After (GOGC=200):
- GC every 20 seconds
- Pause 25ms (longer, but less frequent!)
- P99: 180ms ✅
```

**Trade-off:**

- ✅ Less frequent GC → fewer spikes
- ❌ More memory used
- ❌ When GC happens, pause is longer

### Sweet Spot

```go
// For high-load APIs, good starting point:
debug.SetGCPercent(200) // or even 300

// Monitor:
// 1. Memory usage (shouldn't lead to OOM)
// 2. P99 latency (should improve)
// 3. GC pause duration (will be longer, but less frequent)
```

## Solution 2: GOMEMLIMIT (Go 1.19+)

### Soft Memory Limit

```go
package main

import (
    "runtime/debug"
)

func init() {
    // Set soft memory limit
    // Application can use up to 8GB
    debug.SetMemoryLimit(8 * 1024 * 1024 * 1024) // 8GB
}
```

**How it works:**

```sh
Without GOMEMLIMIT:
- GC works by GOGC formula
- Can use unlimited memory
- In container can lead to OOM

With GOMEMLIMIT=8GB:
- GC becomes more aggressive approaching limit
- Protects from OOM in Kubernetes
- Better predictability
```

### Kubernetes Integration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-api:latest
        env:
        # Set GOMEMLIMIT ~90% of memory limit
        - name: GOMEMLIMIT
          value: "7200MiB"  # 90% of 8GB
        - name: GOGC
          value: "200"

        resources:
          requests:
            memory: "8Gi"
            cpu: "2000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
```

**Why 90% of limit:**

- 10% buffer for non-heap memory (stacks, mmap, etc.)
- Protection for edge cases
- Safety during spikes

## Solution 3: Ballast Memory

### Technique for Stable GC

```go
package main

import (
    "fmt"
    "runtime"
)

func init() {
    // Create large ballast slice
    // This "tricks" GC, making pauses more predictable
    ballast := make([]byte, 2*1024*1024*1024) // 2GB

    runtime.KeepAlive(ballast)

    fmt.Printf("Ballast allocated: %d GB\n", len(ballast)/1024/1024/1024)
}

func main() {
    // Your application
}
```

**How it works:**

```sh
Without ballast:
- Live heap: 100MB
- GC target: 200MB (GOGC=100)
- Many frequent GC cycles

With 2GB ballast:
- Live heap: 2.1GB (2GB ballast + 100MB data)
- GC target: 4.2GB
- Fewer GC cycles
- More stable pauses
```

**Important:**

```go
// Ballast should be a HUGE slice, but it doesn't use
// real memory thanks to virtual memory
// It's just address space reservation

// Check actual usage:
var m runtime.MemStats
runtime.ReadMemStats(&m)
fmt.Printf("Actual heap: %d MB\n", m.HeapAlloc/1024/1024)
```

## Solution 4: Reduce Allocations

### Find Hot Spots

```go
// Run with alloc profiling
go test -bench=. -benchmem -memprofile=mem.prof

// Analyze
go tool pprof mem.prof
```

### Technique 1: sync.Pool for Reuse

```go
var bufferPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

// Before: create new buffer every time
func processDataBad(data []byte) []byte {
    buf := new(bytes.Buffer)
    buf.Write(data)
    // ... processing
    return buf.Bytes()
}

// After: reuse buffers
func processDataGood(data []byte) []byte {
    buf := bufferPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufferPool.Put(buf)
    }()

    buf.Write(data)
    // ... processing
    return buf.Bytes()
}
```

### Technique 2: Preallocate Slices

```go
// Before: many reallocations
func collectDataBad() []Item {
    var items []Item  // capacity = 0

    for i := 0; i < 1000; i++ {
        items = append(items, getItem(i))
        // append will cause reallocation many times
    }
    return items
}

// After: one allocation
func collectDataGood() []Item {
    items := make([]Item, 0, 1000)  // preallocate

    for i := 0; i < 1000; i++ {
        items = append(items, getItem(i))
        // no reallocation
    }
    return items
}
```

### Technique 3: Avoid String Concatenation

```go
// Before: many allocations
func buildStringBad(parts []string) string {
    result := ""
    for _, part := range parts {
        result += part  // each concatenation = new string!
    }
    return result
}

// After: one allocation
func buildStringGood(parts []string) string {
    var builder strings.Builder
    builder.Grow(estimateSize(parts))  // preallocate

    for _, part := range parts {
        builder.WriteString(part)
    }
    return builder.String()
}
```

## Solution 5: Optimize Data Structures

### Example: JSON API Response

```go
// Before: many small allocations
type UserResponseBad struct {
    ID       int               `json:"id"`
    Name     *string           `json:"name"`      // pointer!
    Email    *string           `json:"email"`     // pointer!
    Tags     []string          `json:"tags"`
    Metadata map[string]string `json:"metadata"`  // map allocates
}

// After: fewer allocations
type UserResponseGood struct {
    ID       int               `json:"id"`
    Name     string            `json:"name"`      // value
    Email    string            `json:"email"`     // value
    Tags     [8]string         `json:"tags"`      // array instead of slice
    Metadata [16]KeyValue      `json:"metadata"`  // array instead of map
}

type KeyValue struct {
    Key   string
    Value string
}
```

**Result:**

```sh
UserResponseBad:
- 1 allocation for struct
- 2 allocations for string pointers
- 1 allocation for slice
- 1 allocation for map
= 5+ allocations per object

UserResponseGood:
- 1 allocation for entire struct
= 1 allocation per object

At 100k RPS: 500k vs 100k allocations/sec
```

## Production Case: Reducing P99 from 500ms to 50ms

### Initial Situation

```sh
Service: REST API for recommendations
RPS: 80,000
Memory: 4GB
Pods: 20

Metrics BEFORE optimization:
P50:  5ms
P95:  38ms
P99:  520ms  ❌
P99.9: 1.8s  💥

GC pauses: 10-50ms every 15 seconds
```

### Step 1: Diagnosis

```bash
# Enabled GC trace
export GODEBUG=gctrace=1

# Result:
gc 145 @45.123s 4%: 0.12+42.3+0.18 ms clock
                          ^^^^
                          42ms mark phase!
```

### Step 2: Applied Optimizations

```go
// 1. Increased GOGC
debug.SetGCPercent(300)

// 2. Set GOMEMLIMIT
debug.SetMemoryLimit(3.6 * 1024 * 1024 * 1024) // 3.6GB (90% of 4GB)

// 3. Added ballast
ballast := make([]byte, 1*1024*1024*1024) // 1GB
runtime.KeepAlive(ballast)

// 4. Optimized hot path with sync.Pool
var responsePool = sync.Pool{
    New: func() interface{} {
        return &RecommendationResponse{
            Items: make([]Item, 0, 100),
        }
    },
}
```

### Step 3: Results

```sh
Metrics AFTER optimization:
P50:  4ms   (was 5ms)
P95:  22ms  (was 38ms) ✅
P99:  48ms  (was 520ms) ✅✅✅
P99.9: 120ms (was 1.8s) ✅✅✅

GC pauses: 15-30ms every 45 seconds

Memory: 5GB (was 4GB)
Cost: +25% memory
Benefit: P99 improved 10x!
```

### ROI Calculation

```sh
Before:
- 1% of requests (800/sec) with 500ms+ latency
- Conversion loss on slow requests: ~30%
- Lost revenue: ~$50k/month

After:
- All requests < 100ms
- Additional memory costs: +$500/month
- ROI: 100x
```

## Monitoring and Alerting

### Prometheus Metrics

```go
package main

import (
    "runtime"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    gcDuration = promauto.NewHistogram(prometheus.HistogramOpts{
        Name: "go_gc_duration_seconds",
        Help: "GC pause duration",
        Buckets: []float64{0.0001, 0.001, 0.01, 0.1, 1},
    })

    heapAlloc = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "go_heap_alloc_bytes",
        Help: "Heap memory allocated",
    })

    numGC = promauto.NewCounter(prometheus.CounterOpts{
        Name: "go_gc_total",
        Help: "Total number of GC runs",
    })
)

func collectGCMetrics() {
    var stats runtime.MemStats
    runtime.ReadMemStats(&stats)

    heapAlloc.Set(float64(stats.HeapAlloc))
    numGC.Add(float64(stats.NumGC))
    gcDuration.Observe(float64(stats.PauseNs[(stats.NumGC+255)%256]) / 1e9)
}
```

### Grafana Dashboard

```promql
# P99 latency
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket[5m])
)

# GC pause P99
histogram_quantile(0.99,
  rate(go_gc_duration_seconds_bucket[5m])
)

# Heap usage
go_heap_alloc_bytes / 1024 / 1024

# GC frequency
rate(go_gc_total[5m])
```

### Alerts

```yaml
groups:
- name: go_gc_alerts
  rules:
  - alert: HighP99Latency
    expr: |
      histogram_quantile(0.99,
        rate(http_request_duration_seconds_bucket[5m])
      ) > 0.1
    for: 5m
    annotations:
      summary: "P99 latency > 100ms"

  - alert: FrequentGC
    expr: rate(go_gc_total[5m]) > 2
    for: 10m
    annotations:
      summary: "GC running more than 2 times per second"

  - alert: LongGCPause
    expr: |
      histogram_quantile(0.99,
        rate(go_gc_duration_seconds_bucket[5m])
      ) > 0.05
    for: 5m
    annotations:
      summary: "GC pause P99 > 50ms"
```

## Optimization Checklist

### Quick Wins (< 1 day)

- [ ] Enable `GODEBUG=gctrace=1` and measure baseline
- [ ] Set `GOGC=200` and measure effect
- [ ] Add `GOMEMLIMIT` to Kubernetes deployment
- [ ] Setup Prometheus metrics for GC

### Medium Effort (1 week)

- [ ] Profile allocations with `pprof`
- [ ] Add `sync.Pool` for hot paths
- [ ] Optimize data structures
- [ ] Preallocate slices of known sizes

### High Effort (2-4 weeks)

- [ ] Implement ballast memory
- [ ] Rewrite critical parts for zero-allocation
- [ ] Optimize JSON serialization
- [ ] Consider object pooling for all types

## Conclusion

Go Garbage Collector is a powerful tool, but it can kill P99 latency in high-load systems. Key takeaways:

**Main Problems:**

- Stop-The-World pauses create latency spikes
- By default GC is optimized for throughput, not latency
- In high-throughput systems GC runs frequently

**Solutions:**

1. **GOGC=200-300** - less frequent GC
2. **GOMEMLIMIT** - OOM protection and predictability
3. **Ballast memory** - stable GC pauses
4. **Fewer allocations** - less work for GC
5. **sync.Pool** - object reuse

**Results:**

- P99 latency: 500ms → 50ms (10x improvement)
- Cost: +20-30% memory
- ROI: huge for business-critical APIs

**Golden Rule:**

> Measure, optimize, monitor. GC tuning is a balance between memory, latency, and throughput. Start with GOGC and GOMEMLIMIT, then dive into allocation optimization.

## Additional Resources

- [Go Blog: Understanding Go Garbage Collection](https://blog.golang.org/garbage-collection)
- [Go Blog: Profiling Go Programs](https://blog.golang.org/profiling-go-programs)
- [Go Documentation: runtime/debug Package](https://pkg.go.dev/runtime/debug)
- [Prometheus Go Client](https://github.com/prometheus/client_golang)
- [Go Memory Management](https://golang.org/doc/effective_go#memory)

---

*Successfully conquered GC in production? Share your cases and metrics!*
