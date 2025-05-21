---
title: "Go Channel Hell: How We Defeated chan map[string]*map[int]chan struct{}"
date: 2025-05-14T17:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'concurrency', 'refactoring']
tags: ['golang', 'channels', 'concurrency', 'refactoring', 'architecture', 'real-time', 'websockets']
---

Hey Gopher! 👋

Have you ever seen code like `chan map[string]*map[int]chan struct{}`? If yes, then you know what **channel hell** is.

This is a story about how we **started simple**, **reached nightmare**, and **found an elegant solution**. A real-time notification system that grew from 100 users to 100,000, and how we **refactored** the channel architecture.

**Spoiler:** we ended up replacing all this horror with **3 simple interfaces** and **typed channels** 🚀

<!--more-->

## 1. The Beginning: Simple Task

### Task: Real-time Notifications

**Requirements v1.0:**

- Users connect via WebSocket
- Send notifications to specific users
- ~100 concurrent users

**Naive solution:**

```go
// Simple and working solution
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
        default: // channel full
        }
    }
}
```

**Result:** works perfectly! Simple, understandable code.

## 2. Evolution into Nightmare

### Requirements v2.0: Rooms and Groups

**New features:**

- Users can be in different "rooms"
- Send messages to entire room
- User can be in multiple rooms

```go
// Starting to complicate...
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

**Result:** works, but code became more complex.

### Requirements v3.0: Notification Types

**Even more features:**

- Different notification types (messages, likes, system)
- User can subscribe only to specific types
- Notification priorities

```go
// Hell begins...
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

**Result:** code becomes unreadable, but still works.

### Requirements v4.0: Final Boss

**The last straw:**

- Temporary subscriptions (with TTL)
- Batch notifications
- Delivery statistics
- Graceful shutdown

```go
// WELCOME TO HELL! 🔥
type NotificationHub struct {
    // userID -> roomID -> notifType -> priority -> channel + metadata
    clients map[string]*map[int]*map[string]*map[int]chan struct {
        Data      any
        Timestamp time.Time
        TTL       time.Duration
        Callback  chan bool
    }
    
    // Additional management structures
    subscriptions map[string]*map[int]*map[string]*time.Timer
    stats         map[string]*map[int]*map[string]*DeliveryStats
    shutdownCh    chan struct{}
    mu            sync.RWMutex
}

// 100+ line method to send one notification
func (h *NotificationHub) SendNotification(
    userID string, 
    roomID int, 
    notifType string, 
    priority int, 
    data any,
    ttl time.Duration,
    callback chan bool,
) error {
    // 100 lines of code with nested checks...
    // Nobody understands what's happening here
    // Tests are impossible to write
    // Debugging is a nightmare
}
```

**Result:**

- 🚫 Code is unreadable
- 🚫 Tests impossible to write
- 🚫 Debugging is unrealistic
- 🚫 Adding new features is scary
- 🚫 Race conditions appear constantly

## 3. Problems with Complex Channels

### Why This Is Bad

**🔥 Problem 1: Cognitive Load**

```go
// What does this even mean?
ch := make(chan map[string]*map[int]chan struct{})

// How to read this?
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

**🔥 Problem 2: Testing**

```go
func TestSendNotification(t *testing.T) {
    hub := NewNotificationHub()
    
    // How to create test data?
    // Need to initialize 4 levels of nesting!
    hub.clients["user1"] = &map[int]*map[string]*map[int]chan struct{}{
        1: &map[string]*map[int]chan struct{}{
            "message": &map[int]chan struct{}{
                1: make(chan struct{}),
            },
        },
    }
    
    // Test already takes 50 lines, and we haven't tested anything yet
}
```

**🔥 Problem 3: Race Conditions**

```go
// Where's the race condition here? Find it in 30 seconds!
func (h *NotificationHub) cleanup() {
    h.mu.Lock()
    for userID, userRooms := range h.clients {
        for roomID, roomTypes := range *userRooms {
            for notifType, typePriorities := range *roomTypes {
                for priority, ch := range *typePriorities {
                    close(ch) // Can panic!
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

## 4. Refactoring: From Chaos to Order

### Step 1: Extract Abstractions

```go
// Instead of complex channels - simple interfaces
type Subscriber interface {
    ID() string
    Receive(notification Notification) error
    Close() error
}

type Notification struct {
    Type     string
    RoomID   int
    Priority int
    Data     any
    TTL      time.Duration
}

type NotificationRouter interface {
    Subscribe(subscriber Subscriber, filter Filter) error
    Unsubscribe(subscriberID string) error
    Send(notification Notification) error
}
```

### Step 2: Simple Implementation

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
    
    // Start goroutine for processing
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
                // Channel full, log it
            }
        }
    }
    
    return nil
}
```

### Step 3: Typed Channels

```go
// Instead of any - concrete types
type MessageNotification struct {
    UserID  string
    RoomID  int
    Content string
}

type LikeNotification struct {
    UserID  string
    PostID  int
    LikerID string
}

// Separate channels for different types
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

## 5. Final Architecture

### Clean Solution

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

// Simple testing
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

### Benefits of New Approach

**✅ Readability**

```go
// Was
ch := make(chan map[string]*map[int]chan struct{})

// Became
ch := make(chan Notification)
```

**✅ Testability**

```go
// Was: 50 lines of initialization
// Became: 5 lines with mocks
func TestSendNotification(t *testing.T) {
    router := NewMockRouter()
    system := NewNotificationSystem(router)
    
    system.SendToUser("user1", NewMessage("Hello"))
    
    assert.Equal(t, 1, router.CallCount())
}
```

**✅ Extensibility**

```go
// New notification type
type VideoCallNotification struct {
    CallerID string
    RoomID   string
}

// Just add new handler
dispatcher.RegisterHandler("video_call", handleVideoCall)
```

## 6. Performance: Before and After

### Benchmarks

```go
func BenchmarkOldSystem(b *testing.B) {
    hub := NewOldNotificationHub()
    // Initialize 4 levels of nesting
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

// Results:
// BenchmarkOldSystem-8    100000    15420 ns/op    2048 B/op    12 allocs/op
// BenchmarkNewSystem-8    500000     3180 ns/op     256 B/op     2 allocs/op
```

**Result:** new system is **5x faster** and uses **8x less memory**.

### Scaling

```go
// Old system: O(n³) to find subscribers
func (h *OldHub) findSubscribers(roomID int, notifType string) []chan any {
    result := []chan any{}
    for _, userRooms := range h.clients {
        for rID, roomTypes := range *userRooms {
            if rID == roomID {
                for nType, channels := range *roomTypes {
                    if nType == notifType {
                        // Another level of nesting...
                    }
                }
            }
        }
    }
    return result
}

// New system: O(1) with indexes
func (r *NewRouter) findSubscribers(filter Filter) []*SubscriberInfo {
    return r.index.Get(filter) // Fast lookup by index
}
```

## 7. Lessons and Principles

### What We Learned

**🎯 Principle 1: Simplicity over "cleverness"**

```go
// Bad: "clever" solution
chan map[string]*map[int]chan struct{}

// Good: simple solution
chan Notification
```

**🎯 Principle 2: Interfaces over complex types**

```go
// Bad: rigid structure
type ComplexHub struct {
    clients map[string]*map[int]*map[string]chan any
}

// Good: flexible interfaces
type NotificationRouter interface {
    Send(Notification) error
}
```

**🎯 Principle 3: Composition over inheritance**

```go
// Good: small, composable parts
type NotificationSystem struct {
    router     Router
    dispatcher Dispatcher
    filter     Filter
}
```

### Step-by-step Refactoring

```go
// Step 1: Extract interfaces (without changing implementation)
type LegacyWrapper struct {
    oldHub *ComplexHub
}

func (w *LegacyWrapper) Send(n Notification) error {
    return w.oldHub.SendComplexNotification(/* many parameters */)
}

// Step 2: Gradually replace implementation
// Step 3: Remove old code
```

## 8. Practical Tips

### How to Avoid Channel Hell

**✅ Use simple channel types**

```go
// Good
chan string
chan Notification
chan Event

// Bad
chan map[string]any
chan *map[int]*SomeStruct
```

**✅ Maximum 2 levels of nesting**

```go
// Still tolerable
map[string]chan Notification

// Already bad
map[string]map[int]chan any
```

**✅ Typed structures instead of maps**

```go
// Bad
data := map[string]any{
    "type": "message",
    "user": "john",
}

// Good
type Message struct {
    Type string
    User string
}
```

### Refactoring Tools

```go
// 1. Create interfaces for current API
type LegacyNotificationHub interface {
    SendNotification(userID string, roomID int, /* ... */) error
}

// 2. Wrap old code
type LegacyWrapper struct {
    hub *OldComplexHub
}

// 3. Gradually replace implementation
// 4. Remove old code
```

## Conclusion: Simplicity Beats Complexity

**Main lessons:**
🚀 **Start simple** - don't complicate without necessity  
🔧 **Refactor early** - don't wait until it gets really bad  
🎯 **Interfaces save** - abstractions matter more than implementation  
📊 **Measure performance** - complexity isn't always faster  

**Golden rule of channels:**
> If a channel type takes more than one line or contains pointers to maps - time to refactor.

**Remember:** code is written once but read thousands of times. Make it simple to understand.

**P.S. Have you encountered channel hell? How did you solve it? Share your stories!** 🚀

```go
// Additional resources:
// - "Effective Go" - https://golang.org/doc/effective_go.html
// - "Go Concurrency Patterns" - Rob Pike - https://www.youtube.com/watch?v=f6kdp27TYZs
// - "Refactoring" - Martin Fowler - https://martinfowler.com/books/refactoring.html
```
