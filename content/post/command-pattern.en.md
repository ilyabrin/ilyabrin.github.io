---
title: "Command Pattern in Go: Encapsulating Requests as Objects"
date: 2025-09-29T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "command"]
categories: ["Patterns"]
---

Command Pattern turns requests into objects. Instead of directly calling a method, you create a command object that encapsulates all information about the action: what to do, with what parameters, on which object.

It's like an order in a restaurant: the waiter doesn't cook the food themselves, they write the order on paper and pass it to the kitchen. The paper is the command. It can be delayed, canceled, repeated, or passed to another cook.

<!--more-->

## Why Encapsulate Requests

Direct method calls tightly couple sender and receiver:

```go
button.OnClick(func() {
    document.Save()
})
```

Problems with this approach:

- Can't undo the action
- Can't delay execution
- Can't record history
- Can't queue the action
- Difficult to log and track

Command Pattern solves these problems by turning actions into objects.

## Basic Structure

```go
type Command interface {
    Execute() error
    Undo() error
}
```

Command knows what to do and how to undo. Sender doesn't know implementation details.

## Real Example 1: Text Editor with Undo/Redo

Classic example - editor with undo capability. Each user action is a command.

```go
type Editor struct {
    content string
    cursor  int
}

type InsertTextCommand struct {
    editor   *Editor
    text     string
    position int
}

func (c *InsertTextCommand) Execute() error {
    c.position = c.editor.cursor
    before := c.editor.content[:c.position]
    after := c.editor.content[c.position:]
    c.editor.content = before + c.text + after
    c.editor.cursor = c.position + len(c.text)
    return nil
}

func (c *InsertTextCommand) Undo() error {
    before := c.editor.content[:c.position]
    after := c.editor.content[c.position+len(c.text):]
    c.editor.content = before + after
    c.editor.cursor = c.position
    return nil
}
```

Delete text command:

```go
type DeleteTextCommand struct {
    editor      *Editor
    deletedText string
    position    int
    length      int
}

func (c *DeleteTextCommand) Execute() error {
    c.position = c.editor.cursor
    c.deletedText = c.editor.content[c.position:c.position+c.length]
    
    before := c.editor.content[:c.position]
    after := c.editor.content[c.position+c.length:]
    c.editor.content = before + after
    
    return nil
}

func (c *DeleteTextCommand) Undo() error {
    before := c.editor.content[:c.position]
    after := c.editor.content[c.position:]
    c.editor.content = before + c.deletedText + after
    c.editor.cursor = c.position + len(c.deletedText)
    return nil
}
```

Command history for Undo/Redo:

```go
type CommandHistory struct {
    commands []Command
    current  int
}

func (h *CommandHistory) Execute(cmd Command) error {
    if err := cmd.Execute(); err != nil {
        return err
    }
    
    // Remove commands after current position
    h.commands = h.commands[:h.current]
    h.commands = append(h.commands, cmd)
    h.current++
    
    return nil
}

func (h *CommandHistory) Undo() error {
    if h.current == 0 {
        return errors.New("nothing to undo")
    }
    
    h.current--
    return h.commands[h.current].Undo()
}

func (h *CommandHistory) Redo() error {
    if h.current >= len(h.commands) {
        return errors.New("nothing to redo")
    }
    
    cmd := h.commands[h.current]
    h.current++
    return cmd.Execute()
}
```

Usage:

```go
editor := &Editor{}
history := &CommandHistory{}

// User types text
history.Execute(&InsertTextCommand{
    editor: editor,
    text:   "Hello",
})

history.Execute(&InsertTextCommand{
    editor: editor,
    text:   " World",
})

// Undo last action
history.Undo() // Removes " World"

// Redo
history.Redo() // Returns " World"
```

## Real Example 2: Task System and Queues

In distributed systems, commands are used for asynchronous task processing.

```go
type TaskCommand interface {
    Execute(ctx context.Context) error
    GetID() string
    GetPriority() int
}

type SendEmailCommand struct {
    ID       string
    To       string
    Subject  string
    Body     string
    Priority int
}

func (c *SendEmailCommand) Execute(ctx context.Context) error {
    // Send email
    return emailService.Send(c.To, c.Subject, c.Body)
}

func (c *SendEmailCommand) GetID() string {
    return c.ID
}

func (c *SendEmailCommand) GetPriority() int {
    return c.Priority
}
```

Image processing command:

```go
type ProcessImageCommand struct {
    ID       string
    ImageURL string
    Width    int
    Height   int
    Priority int
}

func (c *ProcessImageCommand) Execute(ctx context.Context) error {
    // Download image
    img, err := downloadImage(c.ImageURL)
    if err != nil {
        return err
    }
    
    // Resize
    resized := resize(img, c.Width, c.Height)
    
    // Upload back
    return uploadImage(resized)
}

func (c *ProcessImageCommand) GetID() string {
    return c.ID
}

func (c *ProcessImageCommand) GetPriority() int {
    return c.Priority
}
```

Priority command queue:

```go
type CommandQueue struct {
    commands []TaskCommand
    mu       sync.Mutex
    workers  int
}

func (q *CommandQueue) Add(cmd TaskCommand) {
    q.mu.Lock()
    defer q.mu.Unlock()
    
    q.commands = append(q.commands, cmd)
    sort.Slice(q.commands, func(i, j int) bool {
        return q.commands[i].GetPriority() > q.commands[j].GetPriority()
    })
}

func (q *CommandQueue) Process(ctx context.Context) {
    for i := 0; i < q.workers; i++ {
        go q.worker(ctx)
    }
}

func (q *CommandQueue) worker(ctx context.Context) {
    for {
        cmd := q.next()
        if cmd == nil {
            time.Sleep(100 * time.Millisecond)
            continue
        }
        
        if err := cmd.Execute(ctx); err != nil {
            log.Printf("Command %s failed: %v", cmd.GetID(), err)
        }
    }
}

func (q *CommandQueue) next() TaskCommand {
    q.mu.Lock()
    defer q.mu.Unlock()
    
    if len(q.commands) == 0 {
        return nil
    }
    
    cmd := q.commands[0]
    q.commands = q.commands[1:]
    return cmd
}
```

Usage:

```go
queue := &CommandQueue{workers: 5}
queue.Process(context.Background())

// Add tasks
queue.Add(&SendEmailCommand{
    ID:       "email-1",
    To:       "user@example.com",
    Subject:  "Welcome",
    Body:     "Hello!",
    Priority: 10,
})

queue.Add(&ProcessImageCommand{
    ID:       "img-1",
    ImageURL: "https://example.com/image.jpg",
    Width:    800,
    Height:   600,
    Priority: 5,
})
```

## Real Example 3: Transactions and Rollback

In database systems, commands are used for transaction management.

```go
type DatabaseCommand interface {
    Execute(tx *sql.Tx) error
    Rollback(tx *sql.Tx) error
}

type CreateUserCommand struct {
    UserID   string
    Email    string
    Password string
}

func (c *CreateUserCommand) Execute(tx *sql.Tx) error {
    _, err := tx.Exec(
        "INSERT INTO users (id, email, password) VALUES ($1, $2, $3)",
        c.UserID, c.Email, c.Password,
    )
    return err
}

func (c *CreateUserCommand) Rollback(tx *sql.Tx) error {
    _, err := tx.Exec("DELETE FROM users WHERE id = $1", c.UserID)
    return err
}
```

Create profile command:

```go
type CreateProfileCommand struct {
    UserID string
    Name   string
    Bio    string
}

func (c *CreateProfileCommand) Execute(tx *sql.Tx) error {
    _, err := tx.Exec(
        "INSERT INTO profiles (user_id, name, bio) VALUES ($1, $2, $3)",
        c.UserID, c.Name, c.Bio,
    )
    return err
}

func (c *CreateProfileCommand) Rollback(tx *sql.Tx) error {
    _, err := tx.Exec("DELETE FROM profiles WHERE user_id = $1", c.UserID)
    return err
}
```

Transaction manager:

```go
type TransactionManager struct {
    db       *sql.DB
    commands []DatabaseCommand
}

func (m *TransactionManager) Execute(commands ...DatabaseCommand) error {
    tx, err := m.db.Begin()
    if err != nil {
        return err
    }
    
    m.commands = commands
    
    for _, cmd := range commands {
        if err := cmd.Execute(tx); err != nil {
            // Rollback all commands
            for i := len(m.commands) - 1; i >= 0; i-- {
                m.commands[i].Rollback(tx)
            }
            tx.Rollback()
            return err
        }
    }
    
    return tx.Commit()
}
```

Usage:

```go
manager := &TransactionManager{db: db}

err := manager.Execute(
    &CreateUserCommand{
        UserID:   "user-123",
        Email:    "user@example.com",
        Password: "hashed",
    },
    &CreateProfileCommand{
        UserID: "user-123",
        Name:   "John Doe",
        Bio:    "Software Engineer",
    },
)

if err != nil {
    // All changes rolled back
}
```

## Real Example 4: Macros and Batch Operations

Commands can be grouped to execute series of actions.

```go
type MacroCommand struct {
    commands []Command
}

func (m *MacroCommand) Execute() error {
    for _, cmd := range m.commands {
        if err := cmd.Execute(); err != nil {
            return err
        }
    }
    return nil
}

func (m *MacroCommand) Undo() error {
    // Undo in reverse order
    for i := len(m.commands) - 1; i >= 0; i-- {
        if err := m.commands[i].Undo(); err != nil {
            return err
        }
    }
    return nil
}
```

Example: document formatting:

```go
func FormatDocument(editor *Editor) Command {
    return &MacroCommand{
        commands: []Command{
            &SelectAllCommand{editor: editor},
            &SetFontCommand{editor: editor, font: "Arial"},
            &SetSizeCommand{editor: editor, size: 12},
            &AlignCommand{editor: editor, align: "left"},
        },
    }
}

// Usage
history.Execute(FormatDocument(editor))

// Undo all formatting with one command
history.Undo()
```

## Real Example 5: Task Scheduler

Commands with delayed execution and retries.

```go
type ScheduledCommand struct {
    command   Command
    executeAt time.Time
    retry     int
    maxRetry  int
}

type Scheduler struct {
    commands []*ScheduledCommand
    mu       sync.Mutex
}

func (s *Scheduler) Schedule(cmd Command, delay time.Duration) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    s.commands = append(s.commands, &ScheduledCommand{
        command:   cmd,
        executeAt: time.Now().Add(delay),
        maxRetry:  3,
    })
}

func (s *Scheduler) Run(ctx context.Context) {
    ticker := time.NewTicker(100 * time.Millisecond)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            s.processCommands()
        }
    }
}

func (s *Scheduler) processCommands() {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    now := time.Now()
    remaining := make([]*ScheduledCommand, 0)
    
    for _, sc := range s.commands {
        if now.Before(sc.executeAt) {
            remaining = append(remaining, sc)
            continue
        }
        
        if err := sc.command.Execute(); err != nil {
            sc.retry++
            if sc.retry < sc.maxRetry {
                sc.executeAt = now.Add(time.Second * time.Duration(sc.retry))
                remaining = append(remaining, sc)
            }
        }
    }
    
    s.commands = remaining
}
```

Usage:

```go
scheduler := &Scheduler{}
go scheduler.Run(context.Background())

// Send email in 5 minutes
scheduler.Schedule(&SendEmailCommand{
    To:      "user@example.com",
    Subject: "Reminder",
    Body:    "Don't forget!",
}, 5*time.Minute)

// Process image in an hour
scheduler.Schedule(&ProcessImageCommand{
    ImageURL: "https://example.com/image.jpg",
    Width:    1920,
    Height:   1080,
}, time.Hour)
```

## Real Example 6: Logging and Audit

Commands automatically log all actions.

```go
type LoggingCommand struct {
    command Command
    logger  *log.Logger
    userID  string
}

func (c *LoggingCommand) Execute() error {
    c.logger.Printf("User %s executing command: %T", c.userID, c.command)
    
    start := time.Now()
    err := c.command.Execute()
    duration := time.Since(start)
    
    if err != nil {
        c.logger.Printf("Command failed after %v: %v", duration, err)
    } else {
        c.logger.Printf("Command succeeded in %v", duration)
    }
    
    return err
}

func (c *LoggingCommand) Undo() error {
    c.logger.Printf("User %s undoing command: %T", c.userID, c.command)
    return c.command.Undo()
}
```

Wrapper to add logging:

```go
func WithLogging(cmd Command, userID string, logger *log.Logger) Command {
    return &LoggingCommand{
        command: cmd,
        logger:  logger,
        userID:  userID,
    }
}

// Usage
history.Execute(WithLogging(
    &DeleteTextCommand{editor: editor, length: 5},
    "user-123",
    logger,
))
```

## When to Use Command Pattern

1. **Undo/Redo** - when you need action history with undo capability
2. **Task queues** - when actions need to be executed asynchronously
3. **Transactions** - when you need to rollback changes on error
4. **Logging** - when you need to record all user actions
5. **Macros** - when you need to group commands
6. **Delayed execution** - when action needs to be executed later

## Advantages

- Decouples sender and receiver
- Undo and redo capability
- Logging and audit
- Queues and scheduling
- Command composition
- Testability

## Disadvantages

- Increased number of classes
- Additional complexity for simple operations
- Object creation overhead

## Command vs Strategy

Strategy selects algorithm. Command encapsulates action.

```go
// Strategy: algorithm selection
type SortStrategy interface {
    Sort([]int) []int
}

// Command: action with undo
type Command interface {
    Execute() error
    Undo() error
}
```

## Conclusion

Command Pattern in Go:

- Turns actions into objects
- Allows undoing and redoing operations
- Simplifies logging and audit
- Supports queues and scheduling
- Makes code more flexible and testable

Commands aren't complication. They're a powerful tool for managing actions in applications. If you need history, undo, queues, or logging - use Command Pattern.

In modern applications, commands are everywhere: text editors, task systems, transactions, schedulers, audit. They make complex operations manageable.
