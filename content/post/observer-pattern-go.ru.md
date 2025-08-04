---
title: "Observer Pattern в Go: Реализация подписки на события"
date: 2025-08-04T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "паттерны-проектирования", "observer", "события", "архитектура"]
categories: ["Разработка"]
---

Observer pattern - один из самых полезных поведенческих паттернов. Он устанавливает зависимость один-ко-многим между объектами: когда один объект меняет состояние, все зависимые уведомляются автоматически.

Вот как правильно реализовать его в Go с реальными примерами.

<!--more-->

## Проблема

Вы строите систему, где множество компонентов должны реагировать на события:

- Регистрация пользователя → Отправить email, создать профиль, залогировать аналитику
- Изменение статуса заказа → Уведомить клиента, обновить склад, запустить доставку
- Обновление цены → Пересчитать итоги, уведомить подписчиков, обновить кеш

**Плохой подход:**

Жёсткая связанность - субъект знает всех наблюдателей напрямую:

```go
type OrderService struct {
    emailService     *EmailService
    inventoryService *InventoryService
    shippingService  *ShippingService
}

func (s *OrderService) CreateOrder(order Order) {
    // Сохраняем заказ
    s.saveOrder(order)
    
    // Вручную уведомляем всех
    s.emailService.SendConfirmation(order)
    s.inventoryService.UpdateStock(order)
    s.shippingService.ScheduleDelivery(order)
}
```

**Проблемы:**

- Сложно добавить новых наблюдателей
- OrderService знает слишком много
- Трудно тестировать
- Нет гибкости в порядке уведомлений

**Observer pattern решает это.**

## Структура Observer Pattern

**Ключевые компоненты:**

**Subject (Наблюдаемый):**

- Хранит список наблюдателей
- Предоставляет методы для подписки/отписки
- Уведомляет наблюдателей при изменении состояния

**Observer (Наблюдатель):**

- Определяет интерфейс обновления
- Получает уведомления от субъекта

**Concrete Observer (Конкретный наблюдатель):**

- Реализует логику обновления
- Хранит ссылку на субъект (опционально)

## Базовая реализация

### Интерфейс Observer

```go
package observer

// Observer определяет интерфейс для объектов, которые должны быть уведомлены
type Observer interface {
    Update(event Event)
}

// Event представляет уведомление с данными
type Event struct {
    Type string
    Data interface{}
}
```

### Реализация Subject

```go
// Subject управляет наблюдателями и уведомлениями
type Subject struct {
    observers []Observer
    mu        sync.RWMutex
}

// NewSubject создаёт новый субъект
func NewSubject() *Subject {
    return &Subject{
        observers: make([]Observer, 0),
    }
}

// Attach добавляет наблюдателя
func (s *Subject) Attach(observer Observer) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.observers = append(s.observers, observer)
}

// Detach удаляет наблюдателя
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

// Notify отправляет событие всем наблюдателям
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

## Реальный пример: Система заказов

### Доменная модель

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

### Order Service с Observer

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
    // Сохраняем заказ
    if err := s.repository.Save(order); err != nil {
        return fmt.Errorf("save order: %w", err)
    }
    
    // Уведомляем наблюдателей
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
    
    // Уведомляем об изменении статуса
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

### Конкретные наблюдатели

**Email-уведомления:**

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
        Subject: "Подтверждение заказа",
        Body:    fmt.Sprintf("Ваш заказ %s подтверждён", order.ID),
    })
    
    if err != nil {
        n.logger.Printf("не удалось отправить email подтверждения: %v", err)
    }
}

func (n *EmailNotifier) sendStatusUpdate(order *Order, status OrderStatus) {
    err := n.emailService.Send(EmailMessage{
        To:      order.CustomerID,
        Subject: "Обновление статуса заказа",
        Body:    fmt.Sprintf("Ваш заказ %s теперь %s", order.ID, status),
    })
    
    if err != nil {
        n.logger.Printf("не удалось отправить email статуса: %v", err)
    }
}
```

**Наблюдатель склада:**

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
            o.logger.Printf("не удалось зарезервировать товар %s: %v", item.ProductID, err)
        }
    }
}

func (o *InventoryObserver) releaseStock(order *Order) {
    for _, item := range order.Items {
        err := o.inventoryService.Release(item.ProductID, item.Quantity)
        if err != nil {
            o.logger.Printf("не удалось освободить товар %s: %v", item.ProductID, err)
        }
    }
}
```

**Наблюдатель аналитики:**

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

### Сборка вместе

```go
func main() {
    // Инициализируем сервисы
    emailService := NewEmailService()
    inventoryService := NewInventoryService()
    analyticsService := NewAnalyticsService()
    orderRepo := NewOrderRepository()
    
    logger := log.New(os.Stdout, "ORDER: ", log.LstdFlags)
    
    // Создаём сервис заказов
    orderService := NewOrderService(orderRepo)
    
    // Подписываем наблюдателей
    orderService.Attach(NewEmailNotifier(emailService, logger))
    orderService.Attach(NewInventoryObserver(inventoryService, logger))
    orderService.Attach(NewAnalyticsObserver(analyticsService))
    
    // Создаём заказ - все наблюдатели уведомлены автоматически
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
        logger.Fatalf("не удалось создать заказ: %v", err)
    }
    
    // Обновляем статус - наблюдатели снова уведомлены
    if err := orderService.UpdateStatus("ORD-001", StatusConfirmed); err != nil {
        logger.Fatalf("не удалось обновить статус: %v", err)
    }
}
```

## Продвинуто: Асинхронные уведомления

Для лучшей производительности уведомляйте наблюдателей асинхронно:

```go
// AsyncSubject уведомляет наблюдателей в горутинах
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

## Продвинуто: Приоритетные наблюдатели

Выполнение наблюдателей в определённом порядке:

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
    
    // Сортируем по приоритету (выше первым)
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

## Продвинуто: Фильтрация событий

Наблюдатели подписываются на конкретные типы событий:

```go
type FilteredObserver struct {
    Observer
    EventTypes []string
}

func (o *FilteredObserver) ShouldNotify(eventType string) bool {
    if len(o.EventTypes) == 0 {
        return true // Подписка на все
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

## Тестирование

```go
func TestOrderService_CreateOrder(t *testing.T) {
    // Мок наблюдателя
    mockObserver := &MockObserver{
        events: make([]observer.Event, 0),
    }
    
    // Настройка
    repo := NewInMemoryOrderRepository()
    service := NewOrderService(repo)
    service.Attach(mockObserver)
    
    // Тест
    order := &Order{
        ID:          "TEST-001",
        CustomerID:  "CUST-001",
        TotalAmount: 100.0,
        Status:      StatusPending,
    }
    
    err := service.CreateOrder(order)
    
    // Проверка
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

## Когда использовать Observer Pattern

**Используйте когда:**

- Множество объектов должны реагировать на изменения состояния
- Нужна слабая связанность между компонентами
- Количество наблюдателей может меняться в runtime
- Нужно транслировать уведомления

**Не используйте когда:**

- Простые отношения один-к-одному
- Критична производительность (рассмотрите каналы)
- Строго важен порядок уведомлений
- Нужна гарантированная доставка

## Observer vs Pub/Sub

**Observer:**

- Прямая ссылка между субъектом и наблюдателями
- Синхронный по умолчанию
- Субъект знает о существовании наблюдателей
- Проще реализация

**Pub/Sub:**

- Брокер сообщений между издателями и подписчиками
- Асинхронный по умолчанию
- Издатели не знают подписчиков
- Сложнее, но гибче

## Заключение

Observer pattern предоставляет чистый способ реализации событийно-ориентированной архитектуры в Go.

**Ключевые преимущества:**

- Слабая связанность
- Легко добавлять новых наблюдателей
- Разделение ответственности
- Тестируемые компоненты

**Советы по реализации:**

- Используйте интерфейсы для гибкости
- Рассмотрите асинхронные уведомления для производительности
- Добавьте фильтрацию для сложных систем
- Тестируйте наблюдателей независимо

**Реальные применения:**

- Системы событий
- Обновления UI
- Логирование и мониторинг
- Системы уведомлений
- Синхронизация состояния

Observer pattern фундаментален для построения реактивных, поддерживаемых систем в Go.

---

*Как вы реализуете обработку событий в ваших Go-приложениях? Делитесь подходом в комментариях или пишите напрямую.*
