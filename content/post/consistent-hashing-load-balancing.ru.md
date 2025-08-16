---
title: "Consistent Hashing: математика за load balancing"
date: 2025-08-16T10:20:00+01:00

author: "Ilya Brin"
categories: ['algorithms', 'distributed-systems', 'math']
tags: ['consistent-hashing', 'load-balancing', 'distributed-systems', 'algorithms', 'hash-ring', 'scalability']
---

Привет, бро! 👋

Представь: у тебя **1000 серверов** и **миллионы запросов**. Как равномерно распределить нагрузку так, чтобы при добавлении нового сервера не пришлось **перехешировать всё**?

Обычный `hash(key) % servers` превращается в **катастрофу** при масштабировании. Добавил один сервер - и **90% данных** нужно перемещать!

Но есть элегантное решение: **Consistent Hashing**. Математика, которая спасает от хаоса в distributed systems.

Разбираем алгоритм, который использует **Amazon DynamoDB**, **Cassandra** и **Redis Cluster** 🚀

<!--more-->

## 1. Проблема обычного хеширования

### Классический подход (и почему он не работает)

```go
// Наивный load balancer
func getServer(key string, servers []string) string {
    hash := fnv.New32a()
    hash.Write([]byte(key))
    return servers[hash.Sum32() % uint32(len(servers))]
}

// Проблема: добавили сервер - всё сломалось!
servers := []string{"server1", "server2", "server3"}
key := "user123"

// До: user123 -> server2
fmt.Println(getServer(key, servers)) // server2

// После добавления server4:
servers = append(servers, "server4")
fmt.Println(getServer(key, servers)) // server1 (!)
```

**Результат:** при изменении количества серверов **большинство ключей** попадает на другие серверы!

### Математика проблемы

При изменении количества серверов с `n` на `n+1`:

- **Процент ключей, которые останутся на тех же серверах:** `n/(n+1)`
- **Процент ключей для перемещения:** `1/(n+1)`

Для 10 серверов: **90%** ключей остаются, **10%** перемещаются ✅  
Для 100 серверов: **99%** остаются, **1%** перемещается ✅

**Но!** В реальности из-за модуло операции перемещается **гораздо больше**.

## 2. Consistent Hashing: концепция

### Основная идея

Вместо прямого маппинга `key -> server` создаём **кольцо хешей**:

1. **Серверы** размещаются на кольце по их хеш-значениям
2. **Ключи** тоже хешируются и размещаются на кольце  
3. Каждый ключ обслуживается **первым сервером по часовой стрелке**

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

### Математическое обоснование

**Hash Ring** - это окружность с координатами `[0, 2^32-1]`.

Для ключа `k` и множества серверов `S`:

```
server(k) = min{s ∈ S : hash(s) ≥ hash(k)} ∪ {min(S)}
```

Где `min(S)` - сервер с минимальным хешем (для wrap-around).

## 3. Реализация на Go

### Базовая структура

```go
type ConsistentHash struct {
    ring     map[uint32]string // hash -> server
    sortedHashes []uint32      // отсортированные хеши
    replicas int               // виртуальные узлы
}

func New(replicas int) *ConsistentHash {
    return &ConsistentHash{
        ring:     make(map[uint32]string),
        replicas: replicas,
    }
}
```

### Добавление серверов

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

### Поиск сервера

```go
func (ch *ConsistentHash) Get(key string) string {
    if len(ch.ring) == 0 {
        return ""
    }
    
    hash := ch.hashKey(key)
    
    // Бинарный поиск первого сервера >= hash
    idx := sort.Search(len(ch.sortedHashes), func(i int) bool {
        return ch.sortedHashes[i] >= hash
    })
    
    // Wrap around если дошли до конца
    if idx == len(ch.sortedHashes) {
        idx = 0
    }
    
    return ch.ring[ch.sortedHashes[idx]]
}
```

## 4. Виртуальные узлы (Virtual Nodes)

### Проблема неравномерного распределения

С одним хешем на сервер распределение может быть **неравномерным**:

```sh
server1(50)  -> 25% нагрузки
server2(100) -> 25% нагрузки  
server3(300) -> 50% нагрузки (!)
```

### Решение: множественные хеши

Каждый сервер размещается на кольце **несколько раз** с разными хешами:

```go
// Вместо одного hash(server1)
// Создаём: hash(server1:0), hash(server1:1), ..., hash(server1:N)

for i := 0; i < replicas; i++ {
    hash := hashKey(fmt.Sprintf("%s:%d", server, i))
    ring[hash] = server
}
```

**Результат:** более равномерное распределение нагрузки.

### Оптимальное количество виртуальных узлов

**Эмпирическое правило:** `replicas = 150-200`

- Меньше 100: неравномерное распределение
- Больше 500: избыточные вычисления

## 5. Производительность и оптимизации

### Бенчмарк базовой реализации

```go
func BenchmarkConsistentHash(b *testing.B) {
    ch := New(150)
    ch.Add("server1", "server2", "server3")
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ch.Get(fmt.Sprintf("key%d", i))
    }
}

// Результат: ~200ns per operation
```

### Оптимизация: предвычисленные хеши

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
    oh.cache[key] = server // Кешируем результат
    return server
}
```

## 6. Реальный пример: Redis Cluster

### Как Redis использует consistent hashing

```go
// Redis использует 16384 слота (2^14)
const RedisSlots = 16384

func getRedisSlot(key string) int {
    return int(crc16(key) % RedisSlots)
}

// Каждый узел отвечает за диапазон слотов
type RedisNode struct {
    addr  string
    slots []int // [0-5460], [5461-10922], [10923-16383]
}
```

### Миграция слотов при добавлении узла

```go
func redistributeSlots(nodes []RedisNode, newNode RedisNode) {
    slotsPerNode := RedisSlots / len(nodes)
    
    for i := range nodes[:len(nodes)-1] {
        // Перемещаем часть слотов на новый узел
        moveSlots := slotsPerNode / len(nodes)
        // Atomic slot migration...
    }
}
```

## 7. Практические применения

### Load Balancer с consistent hashing

```go
type LoadBalancer struct {
    ch      *ConsistentHash
    servers map[string]*Server
}

func (lb *LoadBalancer) Route(request *http.Request) *Server {
    // Используем session ID или client IP для стикости
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

## 8. Мониторинг и метрики

### Ключевые метрики для consistent hashing

```go
type HashMetrics struct {
    KeyDistribution   map[string]int // server -> key count
    LoadBalance       float64        // коэффициент неравномерности
    RehashOperations  int           // количество перехеширований
}

func (ch *ConsistentHash) GetMetrics() HashMetrics {
    distribution := make(map[string]int)
    
    // Симулируем 10000 ключей
    for i := 0; i < 10000; i++ {
        key := fmt.Sprintf("key%d", i)
        server := ch.Get(key)
        distribution[server]++
    }
    
    // Вычисляем коэффициент неравномерности
    loadBalance := calculateLoadBalance(distribution)
    
    return HashMetrics{
        KeyDistribution: distribution,
        LoadBalance:     loadBalance,
    }
}
```

## Вывод: Когда использовать Consistent Hashing

**✅ Используй когда:**

- Частое добавление/удаление серверов
- Нужна session affinity
- Distributed caching
- Sharding баз данных

**❌ Не используй когда:**

- Статичное количество серверов
- Нужно идеально равномерное распределение
- Простой round-robin достаточен

**Главное преимущество:** при добавлении/удалении сервера перемещается только `1/n` данных вместо большинства.

**P.S. Используешь consistent hashing в своих проектах? Делись опытом!** 🚀

```go
// Дополнительные ресурсы:
// - "Consistent Hashing and Random Trees" (Karger et al.)
// - Amazon DynamoDB Paper
// - Redis Cluster Specification
```
