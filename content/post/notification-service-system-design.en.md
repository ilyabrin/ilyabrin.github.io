---
title: "Notification System: How to Sync Millions of Devices Without Pain"
date: 2025-04-28T14:04:14+01:00

author: "Ilya Brin"
categories: ['distributed-systems', 'system-design', 'notification-service', 'architecture']
tags: ['notifications', 'system-design', 'scalability', 'websockets', 'push-notifications', 'go', 'golang', 'microservices']
---

Hey architect! 📱

Need to build a notification system that works like the big players? Where messages arrive instantly on all user devices, and the server doesn't crash under load?

Let's break down how to design a `notification service` that can handle millions of users and sync state across their devices.

<!--more-->

## 1. What is a notification system and why do you need it?

### Real-world tasks

- **Marketing push** - promotions, reminders, personalized offers
- **Instant messages** - new chats, likes, comments
- **System notifications** - status updates, errors, warnings
- **State synchronization** - read messages, online status

### Key requirements

✅ **Synchronization** - state must be identical across all devices  
✅ **Low latency** - notifications should arrive in milliseconds  
✅ **Scalability** - from 1,000 to 100 million users  
✅ **High availability** - 99.9% uptime, even if one data center fails  

**Problem:**
> How to deliver a notification to a user who might be online from phone, tablet, and computer simultaneously?

## 2. High-level architecture

### 🔥 System components

```sh
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Clients   │>>>>>|     Gateway  │>>>>>│ Notification │
│ (iOS/Web/   │     │   (WebSocket │     │    Service   │
│  Android)   │     │   /gRPC)     │     │              │
└─────────────┘     └──────────────┘     └──────────────┘
                           ⌄                    ⌄
                           ⌄                    ⌄
                           ⌄                    ⌄
                    ┌──────────────┐     ┌──────────────┐
                    │   Session    │     │   Message    │
                    │   Manager    │     │    Queue     │
                    │              |     │   (Redis/    │
                    └──────────────┘     │   RabbitMQ)  │
                                         └──────────────┘
```

### 🔥 Main services

**1. Gateway Service** - entry point for all clients
**2. Notification Service** - business logic for notifications  
**3. Session Manager** - tracking active connections
**4. Message Queue** - reliable message delivery

## 3. Gateway Service: entry point

### Gateway tasks

- Authentication and authorization
- Heartbeat and reconnection logic
- Load balancing between instances
- WebSocket connection management

```go
type Gateway struct {
    sessions    *SessionManager
    hub         *ConnectionHub
    auth        AuthService
    msgQueue    MessageQueue
}

type Connection struct {
    UserID    string
    DeviceID  string
    Conn      *websocket.Conn
    Send      chan []byte
    LastSeen  time.Time
}

func (g *Gateway) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := websocket.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    
    userID := g.auth.GetUserID(r)
    deviceID := r.Header.Get("Device-ID")
    
    client := &Connection{
        UserID:   userID,
        DeviceID: deviceID,
        Conn:     conn,
        Send:     make(chan []byte, 256),
        LastSeen: time.Now(),
    }
    
    g.hub.Register(client)
    
    go g.writePump(client)
    go g.readPump(client)
}
```

### Connection Hub - connection management

```go
type ConnectionHub struct {
    clients    map[string]map[string]*Connection // userID -> deviceID -> connection
    register   chan *Connection
    unregister chan *Connection
    broadcast  chan *Message
    mu         sync.RWMutex
}

func (h *ConnectionHub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            if h.clients[client.UserID] == nil {
                h.clients[client.UserID] = make(map[string]*Connection)
            }
            h.clients[client.UserID][client.DeviceID] = client
            h.mu.Unlock()
            
        case client := <-h.unregister:
            h.mu.Lock()
            if devices := h.clients[client.UserID]; devices != nil {
                delete(devices, client.DeviceID)
                if len(devices) == 0 {
                    delete(h.clients, client.UserID)
                }
            }
            h.mu.Unlock()
            
        case message := <-h.broadcast:
            h.sendToUser(message.UserID, message.Data)
        }
    }
}
```

## 4. Notification Service: business logic

### Notification types

```go
type NotificationType string

const (
    TypeMessage     NotificationType = "message"
    TypeLike        NotificationType = "like"
    TypeComment     NotificationType = "comment"
    TypeSystemAlert NotificationType = "system_alert"
)

type Notification struct {
    ID        string            `json:"id"`
    UserID    string            `json:"user_id"`
    Type      NotificationType  `json:"type"`
    Title     string            `json:"title"`
    Body      string            `json:"body"`
    Data      map[string]any    `json:"data"`
    CreatedAt time.Time         `json:"created_at"`
    ReadAt    *time.Time        `json:"read_at,omitempty"`
}
```

### **🔹 Notification processing service:**

```go
type NotificationService struct {
    db       Database
    push     PushService
    queue    MessageQueue
    sessions SessionManager
}

func (ns *NotificationService) SendNotification(notification *Notification) error {
    // 1. Save to database for history
    if err := ns.db.SaveNotification(notification); err != nil {
        return err
    }
    
    // 2. Check if user is online
    if ns.sessions.IsUserOnline(notification.UserID) {
        // Send via WebSocket
        return ns.sendRealtime(notification)
    }
    
    // 3. If offline - send push
    return ns.push.SendPush(notification)
}

func (ns *NotificationService) sendRealtime(notification *Notification) error {
    message := &Message{
        Type:   "notification",
        UserID: notification.UserID,
        Data:   notification,
    }
    
    return ns.queue.Publish("realtime_notifications", message)
}
```

## 5. State synchronization between devices

### Problem

User read a message on phone - need to mark as read on all devices.

```go
type SyncService struct {
    redis    *redis.Client
    sessions SessionManager
    queue    MessageQueue
}

type SyncEvent struct {
    UserID    string      `json:"user_id"`
    DeviceID  string      `json:"device_id"`
    Type      string      `json:"type"` // "read", "typing", "online"
    Data      any         `json:"data"`
    Timestamp time.Time   `json:"timestamp"`
}

func (ss *SyncService) MarkAsRead(userID, messageID, deviceID string) error {
    // 1. Update in database
    if err := ss.updateReadStatus(userID, messageID); err != nil {
        return err
    }
    
    // 2. Sync with other devices
    syncEvent := &SyncEvent{
        UserID:    userID,
        DeviceID:  deviceID,
        Type:      "read",
        Data:      map[string]string{"message_id": messageID},
        Timestamp: time.Now(),
    }
    
    return ss.broadcastToOtherDevices(syncEvent)
}

func (ss *SyncService) broadcastToOtherDevices(event *SyncEvent) error {
    devices := ss.sessions.GetUserDevices(event.UserID)
    
    for _, device := range devices {
        if device.DeviceID != event.DeviceID {
            ss.queue.Publish("sync_events", &Message{
                UserID: event.UserID,
                Data:   event,
                Target: device.DeviceID,
            })
        }
    }
    
    return nil
}
```

## 6. Message Queue: reliable delivery

### Using Redis Streams for guaranteed delivery

```go
type RedisQueue struct {
    client *redis.Client
}

func (rq *RedisQueue) Publish(stream string, message *Message) error {
    data := map[string]interface{}{
        "user_id": message.UserID,
        "type":    message.Type,
        "data":    message.Data,
    }
    
    return rq.client.XAdd(context.Background(), &redis.XAddArgs{
        Stream: stream,
        Values: data,
    }).Err()
}

func (rq *RedisQueue) Subscribe(stream, consumerGroup string, handler func(*Message)) {
    for {
        msgs, err := rq.client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
            Group:    consumerGroup,
            Consumer: "worker-" + uuid.New().String(),
            Streams:  []string{stream, ">"},
            Count:    10,
            Block:    time.Second,
        }).Result()
        
        if err != nil {
            continue
        }
        
        for _, msg := range msgs {
            for _, message := range msg.Messages {
                handler(parseMessage(message))
                rq.client.XAck(context.Background(), stream, consumerGroup, message.ID)
            }
        }
    }
}
```

## 7. Push notifications for offline users

### Integration with FCM (Firebase) and APNs

```go
type PushService struct {
    fcm  *messaging.Client
    apns *apns2.Client
    db   Database
}

func (ps *PushService) SendPush(notification *Notification) error {
    devices, err := ps.db.GetUserDevices(notification.UserID)
    if err != nil {
        return err
    }
    
    for _, device := range devices {
        switch device.Platform {
        case "android":
            ps.sendFCM(device.Token, notification)
        case "ios":
            ps.sendAPNs(device.Token, notification)
        }
    }
    
    return nil
}

func (ps *PushService) sendFCM(token string, notification *Notification) error {
    message := &messaging.Message{
        Token: token,
        Notification: &messaging.Notification{
            Title: notification.Title,
            Body:  notification.Body,
        },
        Data: map[string]string{
            "notification_id": notification.ID,
            "type":           string(notification.Type),
        },
    }
    
    _, err := ps.fcm.Send(context.Background(), message)
    return err
}
```

## 8. Scaling and performance

### Horizontal scaling

**1. User sharding:**

```go
func (s *ShardManager) GetShardForUser(userID string) string {
    hash := fnv.New32a()
    hash.Write([]byte(userID))
    shardID := hash.Sum32() % uint32(s.shardCount)
    return fmt.Sprintf("shard-%d", shardID)
}
```

**2. Load Balancer with sticky sessions (nginx):**

```lua
upstream notification_gateway {
    ip_hash;  # Sticky sessions by IP
    server gateway1:8080;
    server gateway2:8080;
    server gateway3:8080;
}
```

**3. Redis Cluster for sessions:**

```go
type SessionManager struct {
    cluster *redis.ClusterClient
}

func (sm *SessionManager) StoreSession(userID, deviceID string, conn *Connection) {
    key := fmt.Sprintf("session:%s:%s", userID, deviceID)
    data := map[string]interface{}{
        "server_id": sm.serverID,
        "connected_at": time.Now().Unix(),
    }
    
    sm.cluster.HMSet(context.Background(), key, data)
    sm.cluster.Expire(context.Background(), key, 30*time.Minute)
}
```

## 9. Monitoring and metrics

### Key metrics

```go
type Metrics struct {
    ActiveConnections    prometheus.Gauge
    NotificationsSent    prometheus.Counter
    DeliveryLatency      prometheus.Histogram
    FailedDeliveries     prometheus.Counter
}

func (m *Metrics) RecordNotificationSent(userID string, latency time.Duration) {
    m.NotificationsSent.Inc()
    m.DeliveryLatency.Observe(latency.Seconds())
}
```

### Health checks

```go
func (g *Gateway) HealthCheck(w http.ResponseWriter, r *http.Request) {
    status := map[string]string{
        "status":      "healthy",
        "connections": fmt.Sprintf("%d", g.hub.GetConnectionCount()),
        "uptime":      time.Since(g.startTime).String(),
    }
    
    json.NewEncoder(w).Encode(status)
}
```

## Conclusion: notification system is not just WebSocket

Building a reliable notification system is about:

✅ **Reliability** - guaranteed delivery through message queues  
✅ **Architecture** - proper separation of responsibilities between services  
✅ **Synchronization** - state must be consistent across all devices  
✅ **Scalability** - horizontal scaling and sharding  

**Main rule:**
> Notification system is not a feature, it's critical infrastructure. Plan for scale from day one.

**P.S. What problems have you had to solve when building real-time systems? Share your experience in the comments!** 🚀

```go
// Additional resources:
// - WebSocket RFC: https://tools.ietf.org/html/rfc6455
// - Redis Streams: https://redis.io/topics/streams-intro
// - System Design Interview: https://github.com/donnemartin/system-design-primer
// - Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
// - Apple Push Notification Service: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server
```
