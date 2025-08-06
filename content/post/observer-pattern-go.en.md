---
title: "Observer Pattern in Go: Event Subscription Implementation"
date: 2025-08-04T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "design-patterns", "observer", "events", "architecture"]
categories: ["Development"]
---

Observer pattern is one of the most useful behavioral patterns. It establishes one-to-many dependency between objects: when one object changes state, all dependents are notified automatically.

Here's how to implement it properly in Go with real-world examples.

<!--more-->

## The Problem

You're building a system where multiple components need to react to events:

- User registration → Send email, create profile, log analytics
- Order status change → Notify customer, update inventory, trigger shipping
- Price update → Recalculate totals, notify subscribers, update cache

**Bad approach:**

Tight coupling - subject knows all observers directly:

```go
type OrderService struct {
    emailService     *EmailService
    inventoryService *InventoryService
    shippingService  *ShippingService
}

func (s *OrderService) CreateOrder(order Order) {
    // Save order
    s.saveOrder(order)
    
    // Manually notify everyone
    s.emailService.SendConfirmation(order)
    s.inventoryService.UpdateStock(order)
    s.shippingService.ScheduleDelivery(order)
}
```

**Problems:**

- Hard to add new observers
- OrderService knows too much
- Difficult to test
- No flexibility in notification order

**Observer pattern solves this.**

## Observer Pattern Structure

**Key components:**

**Subject (Observable):**

- Maintains list of observers
- Provides methods to attach/detach observers
- Notifies observers on state change

**Observer:**

- Defines update interface
- Receives notifications from subject

**Concrete Observer:**

- Implements update logic
- Maintains reference to subject (optional)

## Basic Implementation

### Observer Interface

```go
package observer

// Observer defines the interface for objects that should be notified
type Observer interface {
    Update(event Event)
}

// Event represents a notification with data
type Event struct {
    Type string
    Data interface{}
}
```

### Subject Implementation

```go
// Subject manages observers and notifications
type Subject struct {
    observers []Observer
    mu        sync.RWMutex
}

// NewSubject creates a new subject
func NewSubject() *Subject {
    return &Subject{
        observers: make([]Observer, 0),
    }
}

// Attach adds an observer
func (s *Subject) Attach(observer Observer) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.observers = append(s.observers, observer)
}

// Detach removes an observer
func (s *Subject) Detach(observer Observer) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    for i, obs := range s.observers {
        if obs == observer {
            s.observers = append(s.observers[:i], s.observers[i+1:]...)
            break
        }
    }
}

// Notify sends event to all observers
func (s *Subject) Notify(event Event) {
    s.mu.RLock()
    observers := make([]Observer, len(s.observers))
    copy(observers, s.observers)
    s.mu.RUnlock()
    
    for _, observer := range observers {
        observer.Update(event)
    }
}
```

## Real-World Example: Order System

### Domain Model

```go
package order

type Order struct {
    ID          string
    CustomerID  string
    Items       []OrderItem
    TotalAmount float64
    Status      OrderStatus
    CreatedAt   time.Time
}

type OrderStatus string

const (
    StatusPending   OrderStatus = "pending"
    StatusConfirmed OrderStatus = "confirmed"
    StatusShipped   OrderStatus = "shipped"
    StatusDelivered OrderStatus = "delivered"
    StatusCancelled OrderStatus = "cancelled"
)

type OrderItem struct {
    ProductID string
    Quantity  int
    Price     float64
}
```

### Order Service with Observer

```go
type OrderService struct {
    *observer.Subject
    repository OrderRepository
}

func NewOrderService(repo OrderRepository) *OrderService {
    return &OrderService{
        Subject:    observer.NewSubject(),
        repository: repo,
    }
}

func (s *OrderService) CreateOrder(order *Order) error {
    // Save order
    if err := s.repository.Save(order); err != nil {
        return fmt.Errorf("save order: %w", err)
    }
    
    // Notify observers
    s.Notify(observer.Event{
        Type: "order.created",
        Data: order,
    })
    
    return nil
}

func (s *OrderService) UpdateStatus(orderID string, status OrderStatus) error {
    order, err := s.repository.GetByID(orderID)
    if err != nil {
        return fmt.Errorf("get order: %w", err)
    }
    
    oldStatus := order.Status
    order.Status = status
    
    if err := s.repository.Update(order); err != nil {
        return fmt.Errorf("update order: %w", err)
    }
    
    // Notify about status change
    s.Notify(observer.Event{
        Type: "order.status_changed",
        Data: map[string]interface{}{
            "order":      order,
            "old_status": oldStatus,
            "new_status": status,
        },
    })
    
    return nil
}
```

### Concrete Observers

**Email Notification Observer:**

```go
type EmailNotifier struct {
    emailService EmailService
    logger       *log.Logger
}

func NewEmailNotifier(service EmailService, logger *log.Logger) *EmailNotifier {
    return &EmailNotifier{
        emailService: service,
        logger:       logger,
    }
}

func (n *EmailNotifier) Update(event observer.Event) {
    switch event.Type {
    case "order.created":
        order := event.Data.(*Order)
        n.sendOrderConfirmation(order)
        
    case "order.status_changed":
        data := event.Data.(map[string]interface{})
        order := data["order"].(*Order)
        newStatus := data["new_status"].(OrderStatus)
        n.sendStatusUpdate(order, newStatus)
    }
}

func (n *EmailNotifier) sendOrderConfirmation(order *Order) {
    err := n.emailService.Send(EmailMessage{
        To:      order.CustomerID,
        Subject: "Order Confirmation",
        Body:    fmt.Sprintf("Your order %s has been confirmed", order.ID),
    })
    
    if err != nil {
        n.logger.Printf("failed to send confirmation email: %v", err)
    }
}

func (n *EmailNotifier) sendStatusUpdate(order *Order, status OrderStatus) {
    err := n.emailService.Send(EmailMessage{
        To:      order.CustomerID,
        Subject: "Order Status Update",
        Body:    fmt.Sprintf("Your order %s is now %s", order.ID, status),
    })
    
    if err != nil {
        n.logger.Printf("failed to send status email: %v", err)
    }
}
```

**Inventory Observer:**

```go
type InventoryObserver struct {
    inventoryService InventoryService
    logger           *log.Logger
}

func NewInventoryObserver(service InventoryService, logger *log.Logger) *InventoryObserver {
    return &InventoryObserver{
        inventoryService: service,
        logger:           logger,
    }
}

func (o *InventoryObserver) Update(event observer.Event) {
    switch event.Type {
    case "order.created":
        order := event.Data.(*Order)
        o.reserveStock(order)
        
    case "order.status_changed":
        data := event.Data.(map[string]interface{})
        order := data["order"].(*Order)
        newStatus := data["new_status"].(OrderStatus)
        
        if newStatus == StatusCancelled {
            o.releaseStock(order)
        }
    }
}

func (o *InventoryObserver) reserveStock(order *Order) {
    for _, item := range order.Items {
        err := o.inventoryService.Reserve(item.ProductID, item.Quantity)
        if err != nil {
            o.logger.Printf("failed to reserve stock for %s: %v", item.ProductID, err)
        }
    }
}

func (o *InventoryObserver) releaseStock(order *Order) {
    for _, item := range order.Items {
        err := o.inventoryService.Release(item.ProductID, item.Quantity)
        if err != nil {
            o.logger.Printf("failed to release stock for %s: %v", item.ProductID, err)
        }
    }
}
```

**Analytics Observer:**

```go
type AnalyticsObserver struct {
    analyticsService AnalyticsService
}

func NewAnalyticsObserver(service AnalyticsService) *AnalyticsObserver {
    return &AnalyticsObserver{
        analyticsService: service,
    }
}

func (o *AnalyticsObserver) Update(event observer.Event) {
    switch event.Type {
    case "order.created":
        order := event.Data.(*Order)
        o.trackOrderCreated(order)
        
    case "order.status_changed":
        data := event.Data.(map[string]interface{})
        order := data["order"].(*Order)
        newStatus := data["new_status"].(OrderStatus)
        o.trackStatusChange(order, newStatus)
    }
}

func (o *AnalyticsObserver) trackOrderCreated(order *Order) {
    o.analyticsService.Track("order_created", map[string]interface{}{
        "order_id":     order.ID,
        "customer_id":  order.CustomerID,
        "total_amount": order.TotalAmount,
        "items_count":  len(order.Items),
    })
}

func (o *AnalyticsObserver) trackStatusChange(order *Order, status OrderStatus) {
    o.analyticsService.Track("order_status_changed", map[string]interface{}{
        "order_id": order.ID,
        "status":   status,
    })
}
```

### Wiring It Together

```go
func main() {
    // Initialize services
    emailService := NewEmailService()
    inventoryService := NewInventoryService()
    analyticsService := NewAnalyticsService()
    orderRepo := NewOrderRepository()
    
    logger := log.New(os.Stdout, "ORDER: ", log.LstdFlags)
    
    // Create order service
    orderService := NewOrderService(orderRepo)
    
    // Attach observers
    orderService.Attach(NewEmailNotifier(emailService, logger))
    orderService.Attach(NewInventoryObserver(inventoryService, logger))
    orderService.Attach(NewAnalyticsObserver(analyticsService))
    
    // Create order - all observers notified automatically
    order := &Order{
        ID:         "ORD-001",
        CustomerID: "CUST-123",
        Items: []OrderItem{
            {ProductID: "PROD-1", Quantity: 2, Price: 29.99},
            {ProductID: "PROD-2", Quantity: 1, Price: 49.99},
        },
        TotalAmount: 109.97,
        Status:      StatusPending,
        CreatedAt:   time.Now(),
    }
    
    if err := orderService.CreateOrder(order); err != nil {
        logger.Fatalf("failed to create order: %v", err)
    }
    
    // Update status - observers notified again
    if err := orderService.UpdateStatus("ORD-001", StatusConfirmed); err != nil {
        logger.Fatalf("failed to update status: %v", err)
    }
}
```

## Advanced: Async Notifications

For better performance, notify observers asynchronously:

```go
// AsyncSubject notifies observers in goroutines
type AsyncSubject struct {
    observers []Observer
    mu        sync.RWMutex
    wg        sync.WaitGroup
}

func NewAsyncSubject() *AsyncSubject {
    return &AsyncSubject{
        observers: make([]Observer, 0),
    }
}

func (s *AsyncSubject) Notify(event Event) {
    s.mu.RLock()
    observers := make([]Observer, len(s.observers))
    copy(observers, s.observers)
    s.mu.RUnlock()
    
    for _, observer := range observers {
        s.wg.Add(1)
        go func(obs Observer) {
            defer s.wg.Done()
            obs.Update(event)
        }(observer)
    }
}

func (s *AsyncSubject) Wait() {
    s.wg.Wait()
}
```

## Advanced: Priority Observers

Execute observers in specific order:

```go
type PriorityObserver struct {
    Observer
    Priority int
}

type PrioritySubject struct {
    observers []PriorityObserver
    mu        sync.RWMutex
}

func (s *PrioritySubject) Attach(observer Observer, priority int) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    po := PriorityObserver{
        Observer: observer,
        Priority: priority,
    }
    
    s.observers = append(s.observers, po)
    
    // Sort by priority (higher first)
    sort.Slice(s.observers, func(i, j int) bool {
        return s.observers[i].Priority > s.observers[j].Priority
    })
}

func (s *PrioritySubject) Notify(event Event) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    
    for _, po := range s.observers {
        po.Observer.Update(event)
    }
}
```

## Advanced: Event Filtering

Observers subscribe to specific event types:

```go
type FilteredObserver struct {
    Observer
    EventTypes []string
}

func (o *FilteredObserver) ShouldNotify(eventType string) bool {
    if len(o.EventTypes) == 0 {
        return true // Subscribe to all
    }
    
    for _, et := range o.EventTypes {
        if et == eventType {
            return true
        }
    }
    return false
}

type FilteredSubject struct {
    observers []FilteredObserver
    mu        sync.RWMutex
}

func (s *FilteredSubject) AttachFiltered(observer Observer, eventTypes ...string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    s.observers = append(s.observers, FilteredObserver{
        Observer:   observer,
        EventTypes: eventTypes,
    })
}

func (s *FilteredSubject) Notify(event Event) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    
    for _, fo := range s.observers {
        if fo.ShouldNotify(event.Type) {
            fo.Observer.Update(event)
        }
    }
}
```

## Testing

```go
func TestOrderService_CreateOrder(t *testing.T) {
    // Mock observer
    mockObserver := &MockObserver{
        events: make([]observer.Event, 0),
    }
    
    // Setup
    repo := NewInMemoryOrderRepository()
    service := NewOrderService(repo)
    service.Attach(mockObserver)
    
    // Test
    order := &Order{
        ID:          "TEST-001",
        CustomerID:  "CUST-001",
        TotalAmount: 100.0,
        Status:      StatusPending,
    }
    
    err := service.CreateOrder(order)
    
    // Assert
    assert.NoError(t, err)
    assert.Len(t, mockObserver.events, 1)
    assert.Equal(t, "order.created", mockObserver.events[0].Type)
}

type MockObserver struct {
    events []observer.Event
    mu     sync.Mutex
}

func (m *MockObserver) Update(event observer.Event) {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.events = append(m.events, event)
}
```

## When to Use Observer Pattern

**Use when:**

- Multiple objects need to react to state changes
- You want loose coupling between components
- Number of observers can change at runtime
- You need to broadcast notifications

**Don't use when:**

- Simple one-to-one relationships
- Performance is critical (consider channels)
- Order of notifications matters strictly
- You need guaranteed delivery

## Observer vs Pub/Sub

**Observer:**

- Direct reference between subject and observers
- Synchronous by default
- Subject knows observers exist
- Simpler implementation

**Pub/Sub:**

- Message broker between publishers and subscribers
- Asynchronous by default
- Publishers don't know subscribers
- More complex but more flexible

## Conclusion

Observer pattern provides clean way to implement event-driven architecture in Go.

**Key benefits:**

- Loose coupling
- Easy to add new observers
- Separation of concerns
- Testable components

**Implementation tips:**

- Use interfaces for flexibility
- Consider async notifications for performance
- Add filtering for complex systems
- Test observers independently

**Real-world applications:**

- Event systems
- UI updates
- Logging and monitoring
- Notification systems
- State synchronization

Observer pattern is fundamental for building reactive, maintainable systems in Go.

---

*How do you implement event handling in your Go applications? Share your approach in comments or reach out directly.*
