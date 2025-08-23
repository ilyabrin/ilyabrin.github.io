---
title: "Consistent Hashing: The Math Behind Load Balancing"
date: 2025-08-23T11:30:00+01:00

author: "Ilya Brin"
categories: ['algorithms', 'distributed-systems', 'math']
tags: ['consistent-hashing', 'load-balancing', 'distributed-systems', 'algorithms', 'hash-ring', 'scalability']
---

Hey there! 👋

Imagine: you have **1000 servers** and **millions of requests**. How do you distribute load evenly so that adding a new server doesn't require **rehashing everything**?

Regular `hash(key) % servers` becomes a **disaster** when scaling. Add one server and **90% of data** needs to be moved!

But there's an elegant solution: **Consistent Hashing**. The mathematics that saves you from chaos in distributed systems.

Let's dive into the algorithm used by **Amazon DynamoDB**, **Cassandra**, and **Redis Cluster** 🚀

<!--more-->

## 1. The Problem with Regular Hashing

### Classic Approach (and why it fails)

```go
// Naive load balancer
func getServer(key string, servers []string) string {
    hash := fnv.New32a()
    hash.Write([]byte(key))
    return servers[hash.Sum32() % uint32(len(servers))]
}

// Problem: added server - everything breaks!
servers := []string{"server1", "server2", "server3"}
key := "user123"

// Before: user123 -> server2
fmt.Println(getServer(key, servers)) // server2

// After adding server4:
servers = append(servers, "server4")
fmt.Println(getServer(key, servers)) // server1 (!)
```

**Result:** when the number of servers changes, **most keys** end up on different servers!

### Mathematics of the Problem

When changing server count from `n` to `n+1`:

- **Percentage of keys staying on same servers:** `n/(n+1)`
- **Percentage of keys to move:** `1/(n+1)`

For 10 servers: **90%** keys stay, **10%** move ✅  
For 100 servers: **99%** stay, **1%** moves ✅

**But!** In reality, due to modulo operation, **much more** gets moved.

## 2. Consistent Hashing: The Concept

### Core Idea

Instead of direct mapping `key -> server`, we create a **hash ring**:

1. **Servers** are placed on the ring by their hash values
2. **Keys** are also hashed and placed on the ring  
3. Each key is served by the **first server clockwise**

```sh
    server1(100)
         |
    key1(50) -----> server1
         |
    server3(200)
         |
    key2(150) ----> server3
         |
    server2(300)
```

### Mathematical Foundation

**Hash Ring** is a circle with coordinates `[0, 2^32-1]`.

For key `k` and server set `S`:

```
server(k) = min{s ∈ S : hash(s) ≥ hash(k)} ∪ {min(S)}
```

Where `min(S)` is the server with minimum hash (for wrap-around).

## 3. Go Implementation

### Basic Structure

```go
type ConsistentHash struct {
    ring     map[uint32]string // hash -> server
    sortedHashes []uint32      // sorted hashes
    replicas int               // virtual nodes
}

func New(replicas int) *ConsistentHash {
    return &ConsistentHash{
        ring:     make(map[uint32]string),
        replicas: replicas,
    }
}
```

### Adding Servers

```go
func (ch *ConsistentHash) Add(servers ...string) {
    for _, server := range servers {
        for i := 0; i < ch.replicas; i++ {
            hash := ch.hashKey(fmt.Sprintf("%s:%d", server, i))
            ch.ring[hash] = server
            ch.sortedHashes = append(ch.sortedHashes, hash)
        }
    }
    sort.Slice(ch.sortedHashes, func(i, j int) bool {
        return ch.sortedHashes[i] < ch.sortedHashes[j]
    })
}

func (ch *ConsistentHash) hashKey(key string) uint32 {
    h := fnv.New32a()
    h.Write([]byte(key))
    return h.Sum32()
}
```

### Finding Server

```go
func (ch *ConsistentHash) Get(key string) string {
    if len(ch.ring) == 0 {
        return ""
    }
    
    hash := ch.hashKey(key)
    
    // Binary search for first server >= hash
    idx := sort.Search(len(ch.sortedHashes), func(i int) bool {
        return ch.sortedHashes[i] >= hash
    })
    
    // Wrap around if we reached the end
    if idx == len(ch.sortedHashes) {
        idx = 0
    }
    
    return ch.ring[ch.sortedHashes[idx]]
}
```

## 4. Virtual Nodes

### Uneven Distribution Problem

With one hash per server, distribution can be **uneven**:

```sh
server1(50)  -> 25% load
server2(100) -> 25% load  
server3(300) -> 50% load (!)
```

### Solution: Multiple Hashes

Each server is placed on the ring **multiple times** with different hashes:

```go
// Instead of single hash(server1)
// Create: hash(server1:0), hash(server1:1), ..., hash(server1:N)

for i := 0; i < replicas; i++ {
    hash := hashKey(fmt.Sprintf("%s:%d", server, i))
    ring[hash] = server
}
```

**Result:** more even load distribution.

### Optimal Virtual Node Count

**Rule of thumb:** `replicas = 150-200`

- Less than 100: uneven distribution
- More than 500: excessive computation

## 5. Performance and Optimizations

### Basic Implementation Benchmark

```go
func BenchmarkConsistentHash(b *testing.B) {
    ch := New(150)
    ch.Add("server1", "server2", "server3")
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ch.Get(fmt.Sprintf("key%d", i))
    }
}

// Result: ~200ns per operation
```

### Optimization: Precomputed Hashes

```go
type OptimizedHash struct {
    servers []string
    hashes  []uint32
    cache   map[string]string // key -> server cache
}

func (oh *OptimizedHash) Get(key string) string {
    if cached, ok := oh.cache[key]; ok {
        return cached
    }
    
    hash := hashKey(key)
    idx := sort.Search(len(oh.hashes), func(i int) bool {
        return oh.hashes[i] >= hash
    })
    
    if idx == len(oh.hashes) {
        idx = 0
    }
    
    server := oh.servers[idx]
    oh.cache[key] = server // Cache result
    return server
}
```

## 6. Real Example: Redis Cluster

### How Redis Uses Consistent Hashing

```go
// Redis uses 16384 slots (2^14)
const RedisSlots = 16384

func getRedisSlot(key string) int {
    return int(crc16(key) % RedisSlots)
}

// Each node handles a range of slots
type RedisNode struct {
    addr  string
    slots []int // [0-5460], [5461-10922], [10923-16383]
}
```

### Slot Migration When Adding Node

```go
func redistributeSlots(nodes []RedisNode, newNode RedisNode) {
    slotsPerNode := RedisSlots / len(nodes)
    
    for i := range nodes[:len(nodes)-1] {
        // Move some slots to new node
        moveSlots := slotsPerNode / len(nodes)
        // Atomic slot migration...
    }
}
```

## 7. Practical Applications

### Load Balancer with Consistent Hashing

```go
type LoadBalancer struct {
    ch      *ConsistentHash
    servers map[string]*Server
}

func (lb *LoadBalancer) Route(request *http.Request) *Server {
    // Use session ID or client IP for stickiness
    key := request.Header.Get("Session-ID")
    if key == "" {
        key = request.RemoteAddr
    }
    
    serverName := lb.ch.Get(key)
    return lb.servers[serverName]
}
```

### Distributed Cache

```go
type DistributedCache struct {
    ch     *ConsistentHash
    clients map[string]*redis.Client
}

func (dc *DistributedCache) Set(key, value string) error {
    serverName := dc.ch.Get(key)
    client := dc.clients[serverName]
    return client.Set(key, value, 0).Err()
}

func (dc *DistributedCache) Get(key string) (string, error) {
    serverName := dc.ch.Get(key)
    client := dc.clients[serverName]
    return client.Get(key).Result()
}
```

## 8. Monitoring and Metrics

### Key Metrics for Consistent Hashing

```go
type HashMetrics struct {
    KeyDistribution   map[string]int // server -> key count
    LoadBalance       float64        // imbalance coefficient
    RehashOperations  int           // rehash count
}

func (ch *ConsistentHash) GetMetrics() HashMetrics {
    distribution := make(map[string]int)
    
    // Simulate 10000 keys
    for i := 0; i < 10000; i++ {
        key := fmt.Sprintf("key%d", i)
        server := ch.Get(key)
        distribution[server]++
    }
    
    // Calculate load balance coefficient
    loadBalance := calculateLoadBalance(distribution)
    
    return HashMetrics{
        KeyDistribution: distribution,
        LoadBalance:     loadBalance,
    }
}
```

## Conclusion: When to Use Consistent Hashing

**✅ Use when:**

- Frequent server addition/removal
- Need session affinity
- Distributed caching
- Database sharding

**❌ Don't use when:**

- Static server count
- Need perfectly even distribution
- Simple round-robin is sufficient

**Main advantage:** when adding/removing servers, only `1/n` of data moves instead of majority.

**P.S. Using consistent hashing in your projects? Share your experience!** 🚀

```go
// Additional resources:
// - "Consistent Hashing and Random Trees" (Karger et al.)
// - Amazon DynamoDB Paper
// - Redis Cluster Specification
```
