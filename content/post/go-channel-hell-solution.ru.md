---
title: "Ад каналов в Go: как мы победили chan map[string]*map[int]chan struct{}"
date: 2025-05-14T17:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'concurrency', 'refactoring']
tags: ['golang', 'channels', 'concurrency', 'refactoring', 'architecture', 'real-time', 'websockets']
---

Привет, гошник! 👋

Видел ли ты когда-нибудь код вроде `chan map[string]*map[int]chan struct{}`? Если да, то ты знаешь, что такое **ад каналов**.

Это история о том, как мы **начали с простого**, **дошли до кошмара** и **нашли элегантное решение**. Real-time система уведомлений, которая выросла от 100 пользователей до 100,000, и как мы **рефакторили** архитектуру каналов.

**Спойлер:** в итоге мы заменили весь этот ужас на **3 простых интерфейса** и **типизированные каналы** 🚀

<!--more-->

## 1. Начало: простая задача

### Задача: real-time уведомления

**Требования v1.0:**

- Пользователи подключаются через WebSocket
- Отправляем уведомления конкретным пользователям
- ~100 одновременных пользователей

**Наивное решение:**

```go
// Простое и работающее решение
type NotificationHub struct {
    clients map[string]chan string // userID -> channel
    mu      sync.RWMutex
}

func (h *NotificationHub) AddClient(userID string) chan string {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    ch := make(chan string, 10)
    h.clients[userID] = ch
    return ch
}

func (h *NotificationHub) SendToUser(userID, message string) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    
    if ch, ok := h.clients[userID]; ok {
        select {
        case ch <- message:
        default: // канал заполнен
        }
    }
}
```

**Результат:** работает отлично! Простой, понятный код.

## 2. Эволюция в кошмар

### Требования v2.0: комнаты и группы

**Новые фичи:**

- Пользователи могут быть в разных "комнатах"
- Отправка сообщений всей комнате
- Пользователь может быть в нескольких комнатах

```go
// Начинаем усложнять...
type NotificationHub struct {
    // userID -> roomID -> channel
    clients map[string]map[int]chan string
    mu      sync.RWMutex
}

func (h *NotificationHub) JoinRoom(userID string, roomID int) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if h.clients[userID] == nil {
        h.clients[userID] = make(map[int]chan string)
    }
    h.clients[userID][roomID] = make(chan string, 10)
}

func (h *NotificationHub) SendToRoom(roomID int, message string) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    
    for _, rooms := range h.clients {
        if ch, ok := rooms[roomID]; ok {
            select {
            case ch <- message:
            default:
            }
        }
    }
}
```

**Результат:** работает, но код стал сложнее.

### Требования v3.0: типы уведомлений

**Ещё больше фич:**

- Разные типы уведомлений (сообщения, лайки, системные)
- Пользователь может подписаться только на определённые типы
- Приоритеты уведомлений

```go
// Ад начинается...
type NotificationHub struct {
    // userID -> roomID -> notificationType -> channel
    clients map[string]map[int]map[string]chan any
    mu      sync.RWMutex
}

func (h *NotificationHub) Subscribe(userID string, roomID int, notifType string) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if h.clients[userID] == nil {
        h.clients[userID] = make(map[int]map[string]chan any)
    }
    if h.clients[userID][roomID] == nil {
        h.clients[userID][roomID] = make(map[string]chan any)
    }
    h.clients[userID][roomID][notifType] = make(chan any, 10)
}
```

**Результат:** код становится нечитаемым, но ещё работает.

### Требования v4.0: финальный босс

**Последняя капля:**

- Временные подписки (с TTL)
- Batch уведомления
- Статистика доставки
- Graceful shutdown

```go
// ДОБРО ПОЖАЛОВАТЬ В АД! 🔥
type NotificationHub struct {
    // userID -> roomID -> notifType -> priority -> channel + metadata
    clients map[string]*map[int]*map[string]*map[int]chan struct {
        Data       any
        Timestamp  time.Time
        TTL        time.Duration
        Callback   chan bool
    }
    
    // Дополнительные структуры для управления
    subscriptions  map[string]*map[int]*map[string]*time.Timer
    stats          map[string]*map[int]*map[string]*DeliveryStats
    shutdownCh     chan struct{}
    mu             sync.RWMutex
}

// Метод на 100+ строк кода для отправки одного уведомления
func (h *NotificationHub) SendNotification(
    userID string, 
    roomID int, 
    notifType string, 
    priority int, 
    data any,
    ttl time.Duration,
    callback chan bool,
) error {
    // 100 строк кода с вложенными проверками...
    // Никто не понимает, что здесь происходит
    // Тесты писать невозможно
    // Дебажить - кошмар
}
```

**Результат:**

- 🚫 Код нечитаемый
- 🚫 Дебажить нереально
- 🚫 Тесты писать невозможно
- 🚫 Новые фичи добавлять страшно
- 🚫 Race conditions появляются постоянно

## 3. Проблемы сложных каналов

### Почему это плохо

**🔥 Проблема 1: Cognitive Load**

```go
// Что это вообще означает?
ch := make(chan map[string]*map[int]chan struct{})

// Как это читать?
for userRooms := range h.clients {
    for roomTypes := range *userRooms {
        for typePriorities := range *roomTypes {
            for priorityChannel := range *typePriorities {
                // ???
            }
        }
    }
}
```

**🔥 Проблема 2: Тестирование**

```go
func TestSendNotification(t *testing.T) {
    hub := NewNotificationHub()
    
    // Как создать тестовые данные?
    // Нужно инициализировать 4 уровня вложенности!
    hub.clients["user1"] = &map[int]*map[string]*map[int]chan struct{}{
        1: &map[string]*map[int]chan struct{}{
            "message": &map[int]chan struct{}{
                1: make(chan struct{}),
            },
        },
    }
    
    // Тест уже занимает 50 строк, а мы ещё ничего не тестируем
}
```

**🔥 Проблема 3: Race Conditions**

```go
// Где здесь race condition? Найди за 30 секунд!
func (h *NotificationHub) cleanup() {
    h.mu.Lock()
    for userID, userRooms := range h.clients {
        for roomID, roomTypes := range *userRooms {
            for notifType, typePriorities := range *roomTypes {
                for priority, ch := range *typePriorities {
                    close(ch) // Может паниковать!
                }
                delete(*roomTypes, notifType)
            }
            delete(*userRooms, roomID)
        }
        delete(h.clients, userID)
    }
    h.mu.Unlock()
}
```

## 4. Рефакторинг: от хаоса к порядку

### Шаг 1: Выделяем абстракции

```go
// Вместо сложных каналов - простые интерфейсы
type Subscriber interface {
    ID() string
    Receive(notification Notification) error
    Close() error
}

type Notification struct {
    Type     string         // "message", "like", "system"
    RoomID   int            // 0 для личных уведомлений, >0 для комнат
    Priority int            // 1 - высокий, 5 - низкий
    Data     any            // payload
    TTL      time.Duration  // время жизни уведомления
}

type NotificationRouter interface {
    Send(notification Notification) errors
    Subscribe(subscriber Subscriber, filter Filter) error
    Unsubscribe(subscriberID string) error
}
```

### Шаг 2: Простая реализация

```go
type SimpleRouter struct {
    subscribers map[string]*SubscriberInfo
    mu          sync.RWMutex
}

type SubscriberInfo struct {
    subscriber Subscriber
    filter     Filter
    ch         chan Notification
}

func (r *SimpleRouter) Subscribe(subscriber Subscriber, filter Filter) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    
    info := &SubscriberInfo{
        subscriber: subscriber,
        filter:     filter,
        ch:         make(chan Notification, 100),
    }
    
    r.subscribers[subscriber.ID()] = info
    
    // Запускаем горутину для обработки
    go r.processNotifications(info)
    
    return nil
}

func (r *SimpleRouter) Send(notification Notification) error {
    r.mu.RLock()
    defer r.mu.RUnlock()
    
    for _, info := range r.subscribers {
        if info.filter.Match(notification) {
            select {
            case info.ch <- notification:
            default:
                // Канал заполнен, логируем
            }
        }
    }
    
    return nil
}
```

### Шаг 3: Типизированные каналы

```go
// Вместо any - конкретные типы
type MessageNotification struct {
    UserID  string
    RoomID  int
    Content string
}

type LikeNotification struct {
    UserID   string
    PostID   int
    LikerID  string
}

// Отдельные каналы для разных типов
type TypedChannels struct {
    Messages chan MessageNotification
    Likes    chan LikeNotification
    System   chan SystemNotification
}

func (tc *TypedChannels) Close() {
    close(tc.Messages)
    close(tc.Likes)
    close(tc.System)
}
```

## 5. Финальная архитектура

### Чистое решение

```go
type NotificationSystem struct {
    router     NotificationRouter
    dispatcher *EventDispatcher
}

type EventDispatcher struct {
    handlers map[string][]Handler
    mu       sync.RWMutex
}

type Handler func(event Event) error

func (ns *NotificationSystem) SendToUser(userID string, notification Notification) error {
    return ns.router.Send(notification.WithTarget(userID))
}

func (ns *NotificationSystem) SendToRoom(roomID int, notification Notification) error {
    return ns.router.Send(notification.WithRoom(roomID))
}

// Простое тестирование
func TestNotificationSystem(t *testing.T) {
    router := NewMockRouter()
    system := &NotificationSystem{router: router}
    
    err := system.SendToUser("user1", Notification{
        Type: "message",
        Data: "Hello!",
    })
    
    assert.NoError(t, err)
    assert.Equal(t, 1, router.SentCount())
}
```

### Преимущества нового подхода

**✅ Читаемость**

```go
// Было
ch := make(chan map[string]*map[int]chan struct{})

// Стало
ch := make(chan Notification)
```

**✅ Тестируемость**

```go
// Было: 50 строк инициализации
// Стало: 5 строк с mock'ами
func TestSendNotification(t *testing.T) {
    router := NewMockRouter()
    system := NewNotificationSystem(router)
    
    system.SendToUser("user1", NewMessage("Hello"))
    
    assert.Equal(t, 1, router.CallCount())
}
```

**✅ Расширяемость**

```go
// Новый тип уведомлений
type VideoCallNotification struct {
    CallerID string
    RoomID   string
}

// Просто добавляем новый handler
dispatcher.RegisterHandler("video_call", handleVideoCall)
```

## 6. Производительность: до и после

### Бенчмарки

```go
func BenchmarkOldSystem(b *testing.B) {
    hub := NewOldNotificationHub()
    // Инициализация 4 уровней вложенности
    setupComplexStructure(hub)
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        hub.SendNotification("user1", 1, "message", 1, "data", time.Minute, nil)
    }
}

func BenchmarkNewSystem(b *testing.B) {
    system := NewNotificationSystem()
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        system.SendToUser("user1", NewMessage("data"))
    }
}

// Результаты:
// BenchmarkOldSystem-8    100000    15420 ns/op    2048 B/op    12 allocs/op
// BenchmarkNewSystem-8    500000     3180 ns/op     256 B/op     2 allocs/op
```

**Результат:** новая система в **5 раз быстрее** и использует в **8 раз меньше памяти**.

### Масштабирование

```go
// Старая система: O(n³) для поиска подписчиков
func (h *OldHub) findSubscribers(roomID int, notifType string) []chan any {
    result := []chan any{}
    for _, userRooms := range h.clients {
        for rID, roomTypes := range *userRooms {
            if rID == roomID {
                for nType, channels := range *roomTypes {
                    if nType == notifType {
                        // Ещё один уровень вложенности...
                    }
                }
            }
        }
    }
    return result
}

// Новая система: O(1) с индексами
func (r *NewRouter) findSubscribers(filter Filter) []*SubscriberInfo {
    return r.index.Get(filter) // Быстрый поиск по индексу
}
```

## 7. Уроки и принципы

### Что мы поняли

**🎯 Принцип 1: Простота важнее "умности"**

```go
// Плохо: "умное" решение
chan map[string]*map[int]chan struct{}

// Хорошо: простое решение
chan Notification
```

**🎯 Принцип 2: Интерфейсы лучше сложных типов**

```go
// Плохо: жёсткая структура
type ComplexHub struct {
    clients map[string]*map[int]*map[string]chan any
}

// Хорошо: гибкие интерфейсы
type NotificationRouter interface {
    Send(Notification) error
}
```

**🎯 Принцип 3: Композиция лучше наследования**

```go
// Хорошо: маленькие, композируемые части
type NotificationSystem struct {
    router     Router
    filter     Filter
    dispatcher Dispatcher
}
```

### Рефакторинг по шагам

```go
// Шаг 1: Выделяем интерфейсы (не меняя реализацию)
type LegacyWrapper struct {
    oldHub *ComplexHub
}

func (w *LegacyWrapper) Send(n Notification) error {
    return w.oldHub.SendComplexNotification(/* много параметров */)
}

// Шаг 2: Постепенно заменяем реализацию
// Шаг 3: Удаляем старый код
```

## 8. Практические советы

### Как избежать ада каналов

**✅ Используй простые типы каналов**

```go
// Хорошо
chan string
chan Notification
chan Event

// Плохо
chan map[string]any
chan *map[int]*SomeStruct
```

**✅ Максимум 2 уровня вложенности**

```go
// Ещё терпимо
map[string]chan Notification

// Уже плохо
map[string]map[int]chan any
```

**✅ Типизированные структуры вместо map**

```go
// Плохо
data := map[string]any{
    "type": "message",
    "user": "john",
}

// Хорошо
type Message struct {
    Type string
    User string
}
```

### Инструменты для рефакторинга

```go
// 1. Создай интерфейсы для текущего API
type LegacyNotificationHub interface {
    SendNotification(userID string, roomID int, /* ... */) error
}

// 2. Оберни старый код
type LegacyWrapper struct {
    hub *OldComplexHub
}

// 3. Постепенно заменяй реализацию
// 4. Удаляй старый код
// 5. Пиши тесты для нового кода
```

## Вывод: простота побеждает сложность

**Главные уроки:**
🚀 **Начинай просто** - не усложняй без необходимости  
🔧 **Рефактори рано** - не жди, пока станет совсем плохо  
🎯 **Интерфейсы спасают** - абстракции важнее реализации  
📊 **Измеряй производительность** - сложность не всегда быстрее  

**Золотое правило каналов:**
> Если тип канала занимает больше одной строки или содержит указатели на map'ы - пора рефакторить.

**Помни:** код пишется один раз, а читается тысячи. Делай его простым для понимания.

**P.S. Сталкивались с адом каналов? Как решали? Делитесь историями!** 🚀

```go
// Дополнительные ресурсы:
// - "Effective Go" - https://golang.org/doc/effective_go.html
// - "Go Concurrency Patterns" - Rob Pike - https://www.youtube.com/watch?v=f6kdp27TYZs
// - "Refactoring" - Martin Fowler - https://martinfowler.com/books/refactoring.html
```
