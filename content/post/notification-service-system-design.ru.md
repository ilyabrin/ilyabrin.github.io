---
title: "Система уведомлений: как синхронизировать миллионы устройств без боли"
date: 2025-04-28T14:04:14+01:00

author: "Ilya Brin"
categories: ['distributed-systems', 'system-design', 'notification-service', 'architecture']
tags: ['notifications', 'system-design', 'scalability', 'websockets', 'push-notifications', 'go', 'golang', 'microservices']
---

Привет, архитектор! 📱

Тебе нужно построить систему уведомлений, которая работает как у больших парней? Чтобы сообщения приходили мгновенно на все устройства пользователя, а сервер не падал от нагрузки?

Разберём, как спроектировать `notification service`, который выдержит миллионы пользователей и синхронизирует состояние между их устройствами.

<!--more-->

## 1. Что такое система уведомлений и зачем она нужна?

### Реальные задачи

- **Маркетинговые push** - акции, напоминания, персональные предложения
- **Мгновенные сообщения** - новые чаты, лайки, комментарии
- **Системные уведомления** - обновления статуса, ошибки, предупреждения
- **Синхронизация состояния** - прочитанные сообщения, онлайн-статус

### Ключевые требования

✅ **Синхронизация** - состояние должно быть одинаковым на всех устройствах  
✅ **Низкая задержка** - уведомления должны приходить за миллисекунды  
✅ **Масштабируемость** - от 1000 до 100 миллионов пользователей  
✅ **Высокая доступность** - 99.9% uptime, даже если один дата-центр упал  

**Проблема:**
> Как доставить уведомление пользователю, который может быть онлайн с телефона, планшета и компьютера одновременно?

## 2. Архитектура высокого уровня

### 🔥 Компоненты системы

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

### 🔥 Основные сервисы

**4. Message Queue** - надёжная доставка сообщений
**1. Gateway Service** - точка входа для всех клиентов
**3. Session Manager** - отслеживание активных соединений
**2. Notification Service** - бизнес-логика уведомлений  

## 3. Gateway Service: точка входа

### Задачи Gateway

- Аутентификация и авторизация
- Heartbeat и reconnection logic
- Load balancing между инстансами
- Управление WebSocket соединениями

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

### Connection Hub - управление соединениями

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

## 4. Notification Service: бизнес-логика

### Типы уведомлений

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

### **🔹 Сервис обработки уведомлений:**

```go
type NotificationService struct {
    db       Database
    push     PushService
    queue    MessageQueue
    sessions SessionManager
}

func (ns *NotificationService) SendNotification(notification *Notification) error {
    // 1. Сохраняем в базу для истории
    if err := ns.db.SaveNotification(notification); err != nil {
        return err
    }
    
    // 2. Проверяем, онлайн ли пользователь
    if ns.sessions.IsUserOnline(notification.UserID) {
        // Отправляем через WebSocket
        return ns.sendRealtime(notification)
    }
    
    // 3. Если оффлайн - отправляем push
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

## 5. Синхронизация состояния между устройствами

### Проблема

Пользователь прочитал сообщение на телефоне - нужно пометить как прочитанное на всех устройствах.

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
    // 1. Обновляем в базе
    if err := ss.updateReadStatus(userID, messageID); err != nil {
        return err
    }
    
    // 2. Синхронизируем с другими устройствами
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

## 6. Message Queue: надёжная доставка

### Используем Redis Streams для гарантированной доставки

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

## 7. Push-уведомления для оффлайн пользователей

### Интеграция с FCM (Firebase) и APNs

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

## 8. Масштабирование и производительность

### Горизонтальное масштабирование

**1. Шардинг по пользователям:**

```go
func (s *ShardManager) GetShardForUser(userID string) string {
    hash := fnv.New32a()
    hash.Write([]byte(userID))
    shardID := hash.Sum32() % uint32(s.shardCount)
    return fmt.Sprintf("shard-%d", shardID)
}
```

**2. Load Balancer с применением sticky sessions (nginx):**

```lua
upstream notification_gateway {
    ip_hash;  # Sticky sessions по IP
    server gateway1:8080;
    server gateway2:8080;
    server gateway3:8080;
}
```

**3. Redis Cluster для сессий:**

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

## 9. Мониторинг и метрики

### Ключевые метрики

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

## Вывод: система уведомлений - это не просто WebSocket

Построить надёжную систему уведомлений - это про:

✅ **Надёжность** - гарантированная доставка через очереди сообщений  
✅ **Архитектуру** - правильное разделение ответственности между сервисами  
✅ **Синхронизацию** - состояние должно быть консистентным на всех устройствах  
✅ **Масштабируемость** - горизонтальное масштабирование и шардинг  

**Главное правило:**
> Система уведомлений - это не фича, а критически важная инфраструктура. Планируй масштабирование с первого дня.

**P.S. Какие проблемы вам приходилось решать при построении real-time систем? Поделитесь опытом в комментариях!** 🚀

```go
// Дополнительные ресурсы:
// - WebSocket RFC: https://tools.ietf.org/html/rfc6455
// - Redis Streams: https://redis.io/topics/streams-intro
// - System Design Interview: https://github.com/donnemartin/system-design-primer
// - Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
// - Apple Push Notification Service: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server
```
