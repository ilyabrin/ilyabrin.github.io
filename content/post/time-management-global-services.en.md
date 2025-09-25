---
title: "Time Management in Global Services: PostgreSQL + Go"
date: 2025-09-24T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "postgresql", "time", "timezone", "global-services"]
categories: ["Development"]
---

Your service operates globally. Users in Tokyo see one date, users in London see another. Scheduled tasks fire at wrong times. Reports show inconsistent data.

Here's how to handle time correctly in distributed systems.

<!--more-->

## The Problem

**Real-world scenarios:**

You're building a global service. Users across timezones:

- Create events
- Schedule tasks
- Generate reports
- Track activity

**What goes wrong:**

**Naive approach:**

```go
// Storing local time - WRONG
event.CreatedAt = time.Now() // Server's local time
```

**Problems:**

- Server in New York stores EST
- Server in Tokyo stores JST
- Database replication breaks
- Sorting events fails
- Reports show wrong data

**Example failure:**

User in London creates event at 2024-01-15 10:00 GMT. Server in New York stores it as 2024-01-15 05:00 EST. User in Tokyo sees 2024-01-15 19:00 JST. Which is correct? None of them are consistent.

## The Solution: UTC Everywhere

**Golden rule:**

> Store in UTC. Display in local time.

**Why UTC:**

- No daylight saving time
- No ambiguity
- Consistent across all servers
- Easy conversion to any timezone

### Core Principle

```go
// Event structure with proper time handling
type Event struct {
    ID          string    `json:"id"`
    UserID      string    `json:"user_id"`
    Type        string    `json:"type"`
    Data        string    `json:"data"`
    CreatedAt   time.Time `json:"created_at"`   // ALWAYS UTC
    UpdatedAt   time.Time `json:"updated_at"`   // ALWAYS UTC
    ScheduledAt time.Time `json:"scheduled_at"` // ALWAYS UTC
}

// Correct event creation
func CreateEvent(userID, eventType, data string) *Event {
    now := time.Now().UTC() // Force UTC
    
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

**Key points:**

- Always call `.UTC()` when storing time
- Never store server's local time
- Never store user's local time
- Convert to local time only for display

## PostgreSQL Configuration

### Database Setup

```sql
-- Set UTC for entire database
ALTER DATABASE myapp SET timezone = 'UTC';

-- Create table with proper types
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

-- Indexes for time-based queries
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_user_created ON events (user_id, created_at DESC);
CREATE INDEX idx_events_scheduled ON events (scheduled_at) WHERE scheduled_at IS NOT NULL;
```

**Why TIMESTAMPTZ:**

- Stores time with timezone information
- PostgreSQL converts to UTC internally
- Returns time in session timezone
- Handles DST automatically

**Important:** Even though it's called TIMESTAMPTZ, PostgreSQL stores everything in UTC. The "TZ" means it's timezone-aware, not that it stores the timezone.

## Time Service Implementation

### Central Time Management

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

// Now returns current time in UTC
func (ts *TimeService) Now() time.Time {
    return time.Now().UTC()
}

// ParseTime parses time string to UTC
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
    
    return time.Time{}, fmt.Errorf("unable to parse time: %s", timeStr)
}

// CreateUTC creates time for specific date in UTC
func (ts *TimeService) CreateUTC(year int, month time.Month, day, hour, min, sec int) time.Time {
    return time.Date(year, month, day, hour, min, sec, 0, time.UTC)
}

// ConvertToTimezone converts UTC time to specific timezone
func (ts *TimeService) ConvertToTimezone(t time.Time, timezone string) (time.Time, error) {
    loc, err := time.LoadLocation(timezone)
    if err != nil {
        return time.Time{}, fmt.Errorf("invalid timezone: %w", err)
    }
    
    return t.In(loc), nil
}

// StartOfDay returns start of day in UTC for given timezone
func (ts *TimeService) StartOfDay(t time.Time, timezone string) (time.Time, error) {
    loc, err := time.LoadLocation(timezone)
    if err != nil {
        return time.Time{}, err
    }
    
    // Convert to user's timezone
    localTime := t.In(loc)
    
    // Get start of day in user's timezone
    startOfDay := time.Date(
        localTime.Year(),
        localTime.Month(),
        localTime.Day(),
        0, 0, 0, 0,
        loc,
    )
    
    // Convert back to UTC
    return startOfDay.UTC(), nil
}
```

**Why centralized service:**

- Single source of truth
- Consistent time handling
- Easy to test
- Simple to mock

## Repository with Proper Time Handling

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

// Create stores event with UTC timestamps
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

// FindByTimeRange retrieves events in time range
func (r *EventRepository) FindByTimeRange(userID string, from, to time.Time) ([]*Event, error) {
    // Ensure UTC
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
        
        // Ensure UTC
        event.CreatedAt = event.CreatedAt.UTC()
        event.UpdatedAt = event.UpdatedAt.UTC()
        if scheduledAt.Valid {
            event.ScheduledAt = scheduledAt.Time.UTC()
        }
        
        events = append(events, event)
    }
    
    return events, rows.Err()
}

// FindScheduled retrieves events scheduled for execution
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

## API with Timezone Support

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

// EventResponse includes both UTC and local time
type EventResponse struct {
    ID          string `json:"id"`
    UserID      string `json:"user_id"`
    Type        string `json:"type"`
    Data        string `json:"data"`
    CreatedAt   string `json:"created_at"`    // ISO 8601 UTC
    UpdatedAt   string `json:"updated_at"`    // ISO 8601 UTC
    LocalTime   string `json:"local_time"`    // User's timezone
    Timezone    string `json:"timezone"`      // User's timezone name
}

func (api *EventAPI) GetEvents(w http.ResponseWriter, r *http.Request) {
    userID := r.URL.Query().Get("user_id")
    
    // Client sends their timezone
    timezone := r.Header.Get("X-Timezone")
    if timezone == "" {
        timezone = "UTC" // Fallback
    }
    
    // Parse time range
    fromStr := r.URL.Query().Get("from")
    toStr := r.URL.Query().Get("to")
    
    from, err := api.timeService.ParseTime(fromStr)
    if err != nil {
        http.Error(w, "Invalid from time", http.StatusBadRequest)
        return
    }
    
    to, err := api.timeService.ParseTime(toStr)
    if err != nil {
        http.Error(w, "Invalid to time", http.StatusBadRequest)
        return
    }
    
    // Get events from database (all in UTC)
    events, err := api.repo.FindByTimeRange(userID, from, to)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    // Convert to response with local time
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
    
    // Parse scheduled time if provided
    if req.ScheduledAt != "" {
        scheduledAt, err := api.timeService.ParseTime(req.ScheduledAt)
        if err != nil {
            http.Error(w, "Invalid scheduled_at time", http.StatusBadRequest)
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

## Scheduler for Delayed Tasks

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
    
    s.logger.Println("Scheduler started")
    
    for {
        select {
        case <-ctx.Done():
            s.logger.Println("Scheduler stopped")
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
        s.logger.Printf("Error finding scheduled events: %v", err)
        return
    }
    
    for _, event := range events {
        s.logger.Printf("Processing scheduled event: %s at %s", 
            event.ID, 
            event.ScheduledAt.Format(time.RFC3339))
        
        // Process event
        if err := s.processEvent(event); err != nil {
            s.logger.Printf("Error processing event %s: %v", event.ID, err)
            continue
        }
        
        // Mark as processed or delete
        if err := s.repo.Delete(event.ID); err != nil {
            s.logger.Printf("Error deleting event %s: %v", event.ID, err)
        }
    }
}

func (s *Scheduler) processEvent(event *Event) error {
    // Implement your event processing logic
    s.logger.Printf("Event %s processed successfully", event.ID)
    return nil
}
```

## Testing Time-Dependent Code

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

// Test example
func TestEventCreation(t *testing.T) {
    // Fixed time for testing
    fixedTime := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
    mockTime := NewMockTimeService(fixedTime)
    
    repo := NewEventRepository(db, mockTime)
    
    event := &Event{
        ID:     "test-1",
        UserID: "user-1",
        Type:   "test",
        Data:   "test data",
    }
    
    err := repo.Create(event)
    assert.NoError(t, err)
    assert.Equal(t, fixedTime, event.CreatedAt)
    assert.Equal(t, fixedTime, event.UpdatedAt)
}
```

## Common Pitfalls

### Mistake 1: Using Local Time

```go
// WRONG
event.CreatedAt = time.Now()

// CORRECT
event.CreatedAt = time.Now().UTC()
```

### Mistake 2: Comparing Times Without Normalization

```go
// WRONG
if time1 == time2 {
    // May fail due to timezone differences
}

// CORRECT
if time1.UTC().Equal(time2.UTC()) {
    // Reliable comparison
}
```

### Mistake 3: Storing Timezone in Database

```go
// WRONG - Don't store user's timezone with time
type Event struct {
    CreatedAt time.Time
    Timezone  string // Don't do this
}

// CORRECT - Store UTC, convert on display
type Event struct {
    CreatedAt time.Time // Always UTC
}

type User struct {
    Timezone string // Store user preference separately
}
```

## Best Practices

**Storage:**

- Always store in UTC
- Use TIMESTAMPTZ in PostgreSQL
- Never store local time
- Never store timezone with timestamp

**Processing:**

- Convert to UTC immediately on input
- Keep UTC throughout processing
- Convert to local time only for display

**API:**

- Accept times in ISO 8601 format
- Return times in UTC
- Provide local time separately if needed
- Let client handle timezone conversion

**Testing:**

- Use mock time service
- Test with different timezones
- Test DST transitions
- Test edge cases (midnight, year boundaries)

## Conclusion

Time management in global services requires discipline.

**Key principles:**

- Store in UTC everywhere
- Convert to local time only for display
- Use centralized time service
- Test with multiple timezones

**Benefits:**

- Consistent data across servers
- Reliable event ordering
- Correct reports
- Easy debugging

**Implementation:**

- PostgreSQL with TIMESTAMPTZ
- Go with time.UTC
- Centralized TimeService
- Proper API design

Time is complex. But with right architecture, it becomes manageable.

---

*How do you handle time in your global services? Share your approach in comments or reach out directly.*
