---
title: "Управление временем в глобальных сервисах: PostgreSQL + Go"
date: 2025-09-24T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "postgresql", "время", "часовые-пояса", "глобальные-сервисы"]
categories: ["Разработка"]
---

Ваш сервис работает глобально. Пользователи в Токио видят одну дату, в Лондоне - другую. Запланированные задачи срабатывают не вовремя. Отчёты показывают несогласованные данные.

Вот как правильно обрабатывать время в распределённых системах.

<!--more-->

## Проблема

**Реальные сценарии:**

Вы строите глобальный сервис. Пользователи в разных часовых поясах:

- Создают события
- Планируют задачи
- Генерируют отчёты
- Отслеживают активность

**Что идёт не так:**

**Наивный подход:**

```go
// Хранение локального времени - НЕПРАВИЛЬНО
event.CreatedAt = time.Now() // Локальное время сервера
```

**Проблемы:**

- Сервер в Нью-Йорке хранит EST
- Сервер в Токио хранит JST
- Репликация базы данных ломается
- Сортировка событий не работает
- Отчёты показывают неверные данные

**Пример провала:**

Пользователь в Лондоне создаёт событие в 2024-01-15 10:00 GMT. Сервер в Нью-Йорке сохраняет как 2024-01-15 05:00 EST. Пользователь в Токио видит 2024-01-15 19:00 JST. Что правильно? Ничего из этого не согласовано.

## Решение: UTC везде

**Золотое правило:**

> Храни в UTC. Показывай в локальном времени.

**Почему UTC:**

- Нет перехода на летнее/зимнее время
- Нет неоднозначности
- Согласованность на всех серверах
- Простая конвертация в любой часовой пояс

### Основной принцип

```go
// Структура события с правильной обработкой времени
type Event struct {
    ID          string    `json:"id"`
    UserID      string    `json:"user_id"`
    Type        string    `json:"type"`
    Data        string    `json:"data"`
    CreatedAt   time.Time `json:"created_at"`   // ВСЕГДА UTC
    UpdatedAt   time.Time `json:"updated_at"`   // ВСЕГДА UTC
    ScheduledAt time.Time `json:"scheduled_at"` // ВСЕГДА UTC
}

// Правильное создание события
func CreateEvent(userID, eventType, data string) *Event {
    now := time.Now().UTC() // Принудительно UTC
    
    return &Event{
        ID:        generateID(),
        UserID:    userID,
        Type:      eventType,
        Data:      data,
        CreatedAt: now,
        UpdatedAt: now,
    }
}
```

**Ключевые моменты:**

- Всегда вызывайте `.UTC()` при сохранении времени
- Никогда не храните локальное время сервера
- Никогда не храните локальное время пользователя
- Конвертируйте в локальное время только для отображения

## Конфигурация PostgreSQL

### Настройка базы данных

```sql
-- Устанавливаем UTC для всей базы
ALTER DATABASE myapp SET timezone = 'UTC';

-- Создаём таблицу с правильными типами
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ,
    CONSTRAINT valid_times CHECK (created_at <= updated_at)
);

-- Индексы для запросов по времени
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_user_created ON events (user_id, created_at DESC);
CREATE INDEX idx_events_scheduled ON events (scheduled_at) WHERE scheduled_at IS NOT NULL;
```

**Почему TIMESTAMPTZ:**

- Хранит время с информацией о часовом поясе
- PostgreSQL конвертирует в UTC внутренне
- Возвращает время в часовом поясе сессии
- Автоматически обрабатывает переход на летнее время

**Важно:** Несмотря на название TIMESTAMPTZ, PostgreSQL хранит всё в UTC. "TZ" означает, что тип учитывает часовые пояса, а не то, что он хранит часовой пояс.

## Реализация Time Service

### Централизованное управление временем

```go
package timeservice

import (
    "fmt"
    "time"
)

type TimeService struct {
    location *time.Location
}

func NewTimeService() *TimeService {
    return &TimeService{
        location: time.UTC,
    }
}

// Now возвращает текущее время в UTC
func (ts *TimeService) Now() time.Time {
    return time.Now().UTC()
}

// ParseTime парсит строку времени в UTC
func (ts *TimeService) ParseTime(timeStr string) (time.Time, error) {
    formats := []string{
        time.RFC3339,
        "2006-01-02T15:04:05Z",
        "2006-01-02 15:04:05",
        "2006-01-02",
    }
    
    for _, format := range formats {
        if t, err := time.Parse(format, timeStr); err == nil {
            return t.UTC(), nil
        }
    }
    
    return time.Time{}, fmt.Errorf("не удалось распарсить время: %s", timeStr)
}

// CreateUTC создаёт время для конкретной даты в UTC
func (ts *TimeService) CreateUTC(year int, month time.Month, day, hour, min, sec int) time.Time {
    return time.Date(year, month, day, hour, min, sec, 0, time.UTC)
}

// ConvertToTimezone конвертирует UTC время в конкретный часовой пояс
func (ts *TimeService) ConvertToTimezone(t time.Time, timezone string) (time.Time, error) {
    loc, err := time.LoadLocation(timezone)
    if err != nil {
        return time.Time{}, fmt.Errorf("неверный часовой пояс: %w", err)
    }
    
    return t.In(loc), nil
}

// StartOfDay возвращает начало дня в UTC для заданного часового пояса
func (ts *TimeService) StartOfDay(t time.Time, timezone string) (time.Time, error) {
    loc, err := time.LoadLocation(timezone)
    if err != nil {
        return time.Time{}, err
    }
    
    // Конвертируем в часовой пояс пользователя
    localTime := t.In(loc)
    
    // Получаем начало дня в часовом поясе пользователя
    startOfDay := time.Date(
        localTime.Year(),
        localTime.Month(),
        localTime.Day(),
        0, 0, 0, 0,
        loc,
    )
    
    // Конвертируем обратно в UTC
    return startOfDay.UTC(), nil
}
```

**Почему централизованный сервис:**

- Единый источник истины
- Согласованная обработка времени
- Легко тестировать
- Просто мокировать

## Repository с правильной обработкой времени

### Event Repository

```go
package repository

import (
    "database/sql"
    "fmt"
    "time"
)

type EventRepository struct {
    db          *sql.DB
    timeService *TimeService
}

func NewEventRepository(db *sql.DB, ts *TimeService) *EventRepository {
    return &EventRepository{
        db:          db,
        timeService: ts,
    }
}

// Create сохраняет событие с UTC временными метками
func (r *EventRepository) Create(event *Event) error {
    now := r.timeService.Now()
    event.CreatedAt = now
    event.UpdatedAt = now
    
    query := `
        INSERT INTO events (id, user_id, type, data, created_at, updated_at, scheduled_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `
    
    _, err := r.db.Exec(query,
        event.ID,
        event.UserID,
        event.Type,
        event.Data,
        event.CreatedAt,
        event.UpdatedAt,
        event.ScheduledAt,
    )
    
    return err
}

// FindByTimeRange получает события во временном диапазоне
func (r *EventRepository) FindByTimeRange(userID string, from, to time.Time) ([]*Event, error) {
    // Убеждаемся в UTC
    fromUTC := from.UTC()
    toUTC := to.UTC()
    
    query := `
        SELECT id, user_id, type, data, created_at, updated_at, scheduled_at
        FROM events
        WHERE user_id = $1 
          AND created_at >= $2 
          AND created_at < $3
        ORDER BY created_at DESC
    `
    
    rows, err := r.db.Query(query, userID, fromUTC, toUTC)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var events []*Event
    for rows.Next() {
        event := &Event{}
        var scheduledAt sql.NullTime
        
        err := rows.Scan(
            &event.ID,
            &event.UserID,
            &event.Type,
            &event.Data,
            &event.CreatedAt,
            &event.UpdatedAt,
            &scheduledAt,
        )
        if err != nil {
            return nil, err
        }
        
        // Убеждаемся в UTC
        event.CreatedAt = event.CreatedAt.UTC()
        event.UpdatedAt = event.UpdatedAt.UTC()
        if scheduledAt.Valid {
            event.ScheduledAt = scheduledAt.Time.UTC()
        }
        
        events = append(events, event)
    }
    
    return events, rows.Err()
}

// FindScheduled получает события, запланированные для выполнения
func (r *EventRepository) FindScheduled(before time.Time) ([]*Event, error) {
    beforeUTC := before.UTC()
    
    query := `
        SELECT id, user_id, type, data, created_at, updated_at, scheduled_at
        FROM events
        WHERE scheduled_at IS NOT NULL
          AND scheduled_at <= $1
        ORDER BY scheduled_at ASC
        LIMIT 100
    `
    
    rows, err := r.db.Query(query, beforeUTC)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var events []*Event
    for rows.Next() {
        event := &Event{}
        var scheduledAt sql.NullTime
        
        err := rows.Scan(
            &event.ID,
            &event.UserID,
            &event.Type,
            &event.Data,
            &event.CreatedAt,
            &event.UpdatedAt,
            &scheduledAt,
        )
        if err != nil {
            return nil, err
        }
        
        event.CreatedAt = event.CreatedAt.UTC()
        event.UpdatedAt = event.UpdatedAt.UTC()
        if scheduledAt.Valid {
            event.ScheduledAt = scheduledAt.Time.UTC()
        }
        
        events = append(events, event)
    }
    
    return events, rows.Err()
}
```

## API с поддержкой часовых поясов

### HTTP Handlers

```go
package api

import (
    "encoding/json"
    "net/http"
    "time"
)

type EventAPI struct {
    repo        *EventRepository
    timeService *TimeService
}

// EventResponse включает UTC и локальное время
type EventResponse struct {
    ID          string `json:"id"`
    UserID      string `json:"user_id"`
    Type        string `json:"type"`
    Data        string `json:"data"`
    CreatedAt   string `json:"created_at"`    // ISO 8601 UTC
    UpdatedAt   string `json:"updated_at"`    // ISO 8601 UTC
    LocalTime   string `json:"local_time"`    // Часовой пояс пользователя
    Timezone    string `json:"timezone"`      // Название часового пояса
}

func (api *EventAPI) GetEvents(w http.ResponseWriter, r *http.Request) {
    userID := r.URL.Query().Get("user_id")
    
    // Клиент отправляет свой часовой пояс
    timezone := r.Header.Get("X-Timezone")
    if timezone == "" {
        timezone = "UTC" // Fallback
    }
    
    // Парсим временной диапазон
    fromStr := r.URL.Query().Get("from")
    toStr := r.URL.Query().Get("to")
    
    from, err := api.timeService.ParseTime(fromStr)
    if err != nil {
        http.Error(w, "Неверное время from", http.StatusBadRequest)
        return
    }
    
    to, err := api.timeService.ParseTime(toStr)
    if err != nil {
        http.Error(w, "Неверное время to", http.StatusBadRequest)
        return
    }
    
    // Получаем события из базы (всё в UTC)
    events, err := api.repo.FindByTimeRange(userID, from, to)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    // Конвертируем в ответ с локальным временем
    response := make([]*EventResponse, len(events))
    userLocation, err := time.LoadLocation(timezone)
    if err != nil {
        userLocation = time.UTC
    }
    
    for i, event := range events {
        localTime := event.CreatedAt.In(userLocation)
        
        response[i] = &EventResponse{
            ID:        event.ID,
            UserID:    event.UserID,
            Type:      event.Type,
            Data:      event.Data,
            CreatedAt: event.CreatedAt.Format(time.RFC3339),
            UpdatedAt: event.UpdatedAt.Format(time.RFC3339),
            LocalTime: localTime.Format(time.RFC3339),
            Timezone:  timezone,
        }
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func (api *EventAPI) CreateEvent(w http.ResponseWriter, r *http.Request) {
    var req struct {
        UserID      string `json:"user_id"`
        Type        string `json:"type"`
        Data        string `json:"data"`
        ScheduledAt string `json:"scheduled_at,omitempty"`
    }
    
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    event := &Event{
        ID:     generateID(),
        UserID: req.UserID,
        Type:   req.Type,
        Data:   req.Data,
    }
    
    // Парсим запланированное время если указано
    if req.ScheduledAt != "" {
        scheduledAt, err := api.timeService.ParseTime(req.ScheduledAt)
        if err != nil {
            http.Error(w, "Неверное время scheduled_at", http.StatusBadRequest)
            return
        }
        event.ScheduledAt = scheduledAt
    }
    
    if err := api.repo.Create(event); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(event)
}
```

## Планировщик отложенных задач

### Task Scheduler

```go
package scheduler

import (
    "context"
    "log"
    "time"
)

type Scheduler struct {
    repo        *EventRepository
    timeService *TimeService
    interval    time.Duration
    logger      *log.Logger
}

func NewScheduler(repo *EventRepository, ts *TimeService, logger *log.Logger) *Scheduler {
    return &Scheduler{
        repo:        repo,
        timeService: ts,
        interval:    1 * time.Minute,
        logger:      logger,
    }
}

func (s *Scheduler) Start(ctx context.Context) {
    ticker := time.NewTicker(s.interval)
    defer ticker.Stop()
    
    s.logger.Println("Планировщик запущен")
    
    for {
        select {
        case <-ctx.Done():
            s.logger.Println("Планировщик остановлен")
            return
            
        case <-ticker.C:
            s.processScheduledEvents()
        }
    }
}

func (s *Scheduler) processScheduledEvents() {
    now := s.timeService.Now()
    
    events, err := s.repo.FindScheduled(now)
    if err != nil {
        s.logger.Printf("Ошибка поиска запланированных событий: %v", err)
        return
    }
    
    for _, event := range events {
        s.logger.Printf("Обработка запланированного события: %s в %s", 
            event.ID, 
            event.ScheduledAt.Format(time.RFC3339))
        
        // Обрабатываем событие
        if err := s.processEvent(event); err != nil {
            s.logger.Printf("Ошибка обработки события %s: %v", event.ID, err)
            continue
        }
        
        // Помечаем как обработанное или удаляем
        if err := s.repo.Delete(event.ID); err != nil {
            s.logger.Printf("Ошибка удаления события %s: %v", event.ID, err)
        }
    }
}

func (s *Scheduler) processEvent(event *Event) error {
    // Реализуйте вашу логику обработки события
    s.logger.Printf("Событие %s успешно обработано", event.ID)
    return nil
}
```

## Тестирование кода, зависящего от времени

### Mock Time Service

```go
package timeservice

import "time"

type MockTimeService struct {
    currentTime time.Time
}

func NewMockTimeService(t time.Time) *MockTimeService {
    return &MockTimeService{
        currentTime: t.UTC(),
    }
}

func (m *MockTimeService) Now() time.Time {
    return m.currentTime
}

func (m *MockTimeService) SetTime(t time.Time) {
    m.currentTime = t.UTC()
}

func (m *MockTimeService) Advance(d time.Duration) {
    m.currentTime = m.currentTime.Add(d)
}

// Пример теста
func TestEventCreation(t *testing.T) {
    // Фиксированное время для тестирования
    fixedTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
    mockTime := NewMockTimeService(fixedTime)
    
    repo := NewEventRepository(db, mockTime)
    
    event := &Event{
        ID:     "test-1",
        UserID: "user-1",
        Type:   "test",
        Data:   "тестовые данные",
    }
    
    err := repo.Create(event)
    assert.NoError(t, err)
    assert.Equal(t, fixedTime, event.CreatedAt)
    assert.Equal(t, fixedTime, event.UpdatedAt)
}
```

## Распространённые ошибки

### Ошибка 1: Использование локального времени

```go
// НЕПРАВИЛЬНО
event.CreatedAt = time.Now()

// ПРАВИЛЬНО
event.CreatedAt = time.Now().UTC()
```

### Ошибка 2: Сравнение времени без нормализации

```go
// НЕПРАВИЛЬНО
if time1 == time2 {
    // Может не сработать из-за различий в часовых поясах
}

// ПРАВИЛЬНО
if time1.UTC().Equal(time2.UTC()) {
    // Надёжное сравнение
}
```

### Ошибка 3: Хранение часового пояса в базе данных

```go
// НЕПРАВИЛЬНО - Не храните часовой пояс пользователя со временем
type Event struct {
    CreatedAt time.Time
    Timezone  string // Не делайте так
}

// ПРАВИЛЬНО - Храните UTC, конвертируйте при отображении
type Event struct {
    CreatedAt time.Time // Всегда UTC
}

type User struct {
    Timezone string // Храните предпочтение пользователя отдельно
}
```

## Лучшие практики

**Хранение:**

- Всегда храните в UTC
- Используйте TIMESTAMPTZ в PostgreSQL
- Никогда не храните локальное время
- Никогда не храните часовой пояс с временной меткой

**Обработка:**

- Конвертируйте в UTC немедленно на входе
- Держите UTC на протяжении всей обработки
- Конвертируйте в локальное время только для отображения

**API:**

- Принимайте время в формате ISO 8601
- Возвращайте время в UTC
- Предоставляйте локальное время отдельно при необходимости
- Позвольте клиенту обрабатывать конвертацию часовых поясов

**Тестирование:**

- Используйте mock time service
- Тестируйте с разными часовыми поясами
- Тестируйте переходы на летнее время
- Тестируйте граничные случаи (полночь, границы года)

## Заключение

Управление временем в глобальных сервисах требует дисциплины.

**Ключевые принципы:**

- Храните в UTC везде
- Конвертируйте в локальное время только для отображения
- Используйте централизованный time service
- Тестируйте с множеством часовых поясов

**Преимущества:**

- Согласованные данные на всех серверах
- Надёжная сортировка событий
- Корректные отчёты
- Простая отладка

**Реализация:**

- PostgreSQL с TIMESTAMPTZ
- Go с time.UTC
- Централизованный TimeService
- Правильный дизайн API

Время сложно. Но с правильной архитектурой оно становится управляемым.

---

*Как вы обрабатываете время в ваших глобальных сервисах? Делитесь подходом в комментариях или пишите напрямую.*
