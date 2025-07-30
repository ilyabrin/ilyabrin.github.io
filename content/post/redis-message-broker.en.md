---
title: "Redis as Message Broker: When It's Better Than RabbitMQ"
date: 2025-07-23T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["redis", "rabbitmq", "message-broker", "architecture", "performance"]
categories: ["Redis"]
---

`Redis` is often perceived only as a cache. But Redis is a full-fledged message broker that in some scenarios works better than `RabbitMQ`, `Kafka`, and other specialized solutions.

Let's figure out when Redis is the right choice, and when it's better to take something else.

<!--more-->

## The Choice Problem

You have a task: you need to pass messages between services. First thought - RabbitMQ or Kafka. But you already have Redis for caching. Why add another system?

The question isn't "can you use Redis". The question is "when is Redis the best choice".

## Redis as Message Broker: Capabilities

### 1. Pub/Sub - Simplest Option

Classic publish-subscribe pattern. One publishes, many subscribe.

```go
// Publisher
func PublishEvent(client *redis.Client, channel string, message string) error {
    return client.Publish(context.Background(), channel, message).Err()
}

// Subscriber
func Subscribe(client *redis.Client, channel string) {
    pubsub := client.Subscribe(context.Background(), channel)
    defer pubsub.Close()
    
    ch := pubsub.Channel()
    for msg := range ch {
        fmt.Printf("Received: %s\n", msg.Payload)
    }
}
```

**Pros:**

- Instant delivery
- Simple implementation
- Zero latency

**Cons:**

- No delivery guarantee
- If subscriber is offline - message is lost
- No persistence

**When to use:**

- Real-time notifications
- Cache invalidation
- Live UI updates
- Coordination between instances

### 2. Lists - Simple Queue

Redis Lists work as FIFO queue. LPUSH adds, BRPOP takes.

```go
// Producer
func Enqueue(client *redis.Client, queue string, message string) error {
    return client.LPush(context.Background(), queue, message).Err()
}

// Consumer
func Consume(client *redis.Client, queue string) {
    for {
        result, err := client.BRPop(context.Background(), 0, queue).Result()
        if err != nil {
            continue
        }
        
        message := result[1]
        processMessage(message)
    }
}
```

**Pros:**

- Delivery guarantee (while Redis is alive)
- Order preserved
- Blocking read (BRPOP)
- Persistence (if enabled)

**Cons:**

- No processing acknowledgment
- If consumer crashes - message is lost
- One consumer per queue

**When to use:**

- Background tasks
- Email sending
- Image processing
- Simple job queues

### 3. Streams - Advanced Queue

Redis Streams are like Kafka, but simpler. Appeared in Redis 5.0.

```go
// Producer
func AddToStream(client *redis.Client, stream string, data map[string]interface{}) error {
    return client.XAdd(context.Background(), &redis.XAddArgs{
        Stream: stream,
        Values: data,
    }).Err()
}

// Consumer Group
func ConsumeStream(client *redis.Client, stream, group, consumer string) {
    for {
        streams, err := client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
            Group:    group,
            Consumer: consumer,
            Streams:  []string{stream, ">"},
            Count:    10,
            Block:    0,
        }).Result()
        
        if err != nil {
            continue
        }
        
        for _, stream := range streams {
            for _, message := range stream.Messages {
                processMessage(message.Values)
                
                // Acknowledge processing
                client.XAck(context.Background(), stream.Stream, group, message.ID)
            }
        }
    }
}
```

**Pros:**

- Consumer groups (like in Kafka)
- Processing acknowledgment (ACK)
- Persistence
- Read from any position
- Multiple consumers
- Pending messages tracking

**Cons:**

- More complex than Lists
- Need to manage consumer groups
- More memory

**When to use:**

- Event sourcing
- Audit logs
- Activity streams
- When reliability is needed
- When multiple consumers needed

## Redis vs RabbitMQ: Comparison

### Performance

**Redis:**

- 100,000+ messages per second on single instance
- Latency < 1ms
- In-memory operations

**RabbitMQ:**

- 20,000-50,000 messages per second
- Latency 1-5ms
- Disk + memory

**Conclusion:** Redis is 2-5x faster for simple scenarios.

### Reliability

**Redis:**

- Persistence optional (RDB/AOF)
- Can lose last seconds on crash
- Asynchronous replication

**RabbitMQ:**

- Persistence by default
- Acknowledgments at every stage
- Clustering with synchronous replication

**Conclusion:** RabbitMQ is more reliable for critical data.

### Complexity

**Redis:**

- Simple installation
- Minimal configuration
- Clear API

**RabbitMQ:**

- Complex installation
- Many settings
- Erlang under the hood
- Exchanges, queues, bindings

**Conclusion:** Redis is much simpler.

### Functionality

**Redis:**

- Pub/Sub
- Lists
- Streams
- Sorted Sets for priorities

**RabbitMQ:**

- Pattern-based routing
- Dead letter queues
- Message TTL
- Priority queues
- Delayed messages
- Transactions

**Conclusion:** RabbitMQ is more feature-rich.

## When Redis is Better

### 1. High Speed More Important Than Reliability

Real-time notifications, live updates, service coordination.

**Example:** Cache invalidation on data update.

```go
func InvalidateCache(client *redis.Client, key string) {
    // Delete from local cache
    localCache.Delete(key)
    
    // Notify other instances
    client.Publish(context.Background(), "cache:invalidate", key)
}
```

### 2. You Already Have Redis

Why add RabbitMQ if Redis already works? Fewer systems - fewer problems.

**Example:** Background tasks in small application.

### 3. Simple Scenarios

No complex routing, no priorities, no delayed messages.

**Example:** Email queue.

```go
func SendEmailAsync(client *redis.Client, to, subject, body string) {
    email := map[string]interface{}{
        "to":      to,
        "subject": subject,
        "body":    body,
    }
    
    data, _ := json.Marshal(email)
    client.LPush(context.Background(), "emails", data)
}
```

### 4. Low Latency is Critical

When every millisecond matters.

**Example:** Real-time analytics, live dashboards.

### 5. Small Message Volume

Up to 100,000 messages per second Redis handles excellently.

## When RabbitMQ is Better

### 1. Critical Data

Financial transactions, orders, payments - can't lose.

### 2. Complex Routing

Need to send messages to different queues based on conditions.

### 3. Delivery Guarantees

Need acknowledgments at every stage: publisher → broker → consumer.

### 4. Large Volume

Millions of messages per day, need disk persistence.

### 5. Enterprise Requirements

Monitoring, management, plugins, integrations.

## Hybrid Approach

Often the best solution is to use both.

**Redis for:**

- Fast notifications
- Cache invalidation
- Real-time coordination

**RabbitMQ for:**

- Critical tasks
- Complex routing
- Long-lived queues

**Example architecture:**

```sh
User Action → API
              ↓
         Redis Pub/Sub (cache invalidation)
              ↓
         RabbitMQ (order processing)
              ↓
         Workers
```

## Practical Patterns

### 1. Task Queue with Redis Lists

```go
type Task struct {
    ID   string
    Type string
    Data map[string]interface{}
}

func EnqueueTask(client *redis.Client, task Task) error {
    data, _ := json.Marshal(task)
    return client.LPush(context.Background(), "tasks", data).Err()
}

func ProcessTasks(client *redis.Client) {
    for {
        result, err := client.BRPop(context.Background(), 0, "tasks").Result()
        if err != nil {
            continue
        }
        
        var task Task
        json.Unmarshal([]byte(result[1]), &task)
        
        switch task.Type {
        case "email":
            sendEmail(task.Data)
        case "image":
            processImage(task.Data)
        }
    }
}
```

### 2. Event Bus with Redis Pub/Sub

```go
type EventBus struct {
    client *redis.Client
}

func (e *EventBus) Publish(event string, data interface{}) error {
    payload, _ := json.Marshal(data)
    return e.client.Publish(context.Background(), event, payload).Err()
}

func (e *EventBus) Subscribe(event string, handler func(data []byte)) {
    pubsub := e.client.Subscribe(context.Background(), event)
    defer pubsub.Close()
    
    ch := pubsub.Channel()
    for msg := range ch {
        handler([]byte(msg.Payload))
    }
}
```

### 3. Reliable Queue with Redis Streams

```go
func ReliableQueue(client *redis.Client, stream, group string) {
    // Create consumer group
    client.XGroupCreate(context.Background(), stream, group, "0")
    
    for {
        // Read new messages
        streams, _ := client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
            Group:    group,
            Consumer: "worker-1",
            Streams:  []string{stream, ">"},
            Count:    10,
            Block:    time.Second,
        }).Result()
        
        for _, s := range streams {
            for _, msg := range s.Messages {
                if processMessage(msg.Values) {
                    // Acknowledge processing
                    client.XAck(context.Background(), stream, group, msg.ID)
                }
            }
        }
        
        // Process pending messages (not acknowledged)
        pending, _ := client.XPendingExt(context.Background(), &redis.XPendingExtArgs{
            Stream: stream,
            Group:  group,
            Start:  "-",
            End:    "+",
            Count:  10,
        }).Result()
        
        for _, p := range pending {
            if p.RetryCount > 3 {
                // Move to dead letter queue
                client.XDel(context.Background(), stream, p.ID)
            }
        }
    }
}
```

## Monitoring and Metrics

### Key Metrics for Redis

```go
func GetQueueMetrics(client *redis.Client, queue string) map[string]int64 {
    return map[string]int64{
        "length":    client.LLen(context.Background(), queue).Val(),
        "consumers": client.PubSubNumSub(context.Background(), queue).Val()[queue],
    }
}

func GetStreamMetrics(client *redis.Client, stream, group string) map[string]interface{} {
    info, _ := client.XInfoGroups(context.Background(), stream).Result()
    
    metrics := make(map[string]interface{})
    for _, g := range info {
        if g.Name == group {
            metrics["pending"] = g.Pending
            metrics["consumers"] = g.Consumers
            metrics["lag"] = g.Lag
        }
    }
    
    return metrics
}
```

## Conclusion

**Use Redis when:**

- Speed more important than reliability
- Simple scenarios
- You already have Redis
- Low latency is critical
- Small message volume

**Use RabbitMQ when:**

- Critical data
- Complex routing
- Delivery guarantees needed
- Large volume
- Enterprise requirements

**Best solution:**
Often it's a combination. Redis for fast operations, RabbitMQ for critical ones.

Redis isn't a replacement for specialized message brokers. It's a tool that in the right hands solves 80% of tasks simpler and faster.

Don't overcomplicate architecture unnecessarily. If Redis handles it - use Redis.
