---
title: "Command Pattern в Go: инкапсуляция запросов в объекты"
date: 2025-09-29T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "command"]
categories: ["Patterns"]
---

Command Pattern превращает запросы в объекты. Вместо прямого вызова метода вы создаёте объект-команду, который инкапсулирует всю информацию о действии: что делать, с какими параметрами, на каком объекте.

Это как заказ в ресторане: официант не готовит еду сам, он записывает заказ на бумажке и передаёт на кухню. Бумажка - это команда. Её можно отложить, отменить, повторить или передать другому повару.

<!--more-->

## Зачем инкапсулировать запросы

Прямой вызов метода жёстко связывает отправителя и получателя:

```go
button.OnClick(func() {
    document.Save()
})
```

Проблемы такого подхода:

- Нельзя отменить действие
- Нельзя отложить выполнение
- Нельзя записать историю
- Нельзя передать действие в очередь
- Сложно логировать и отслеживать

Command Pattern решает эти проблемы, превращая действие в объект.

## Базовая структура

```go
type Command interface {
    Execute() error
    Undo() error
}
```

Команда знает, что делать и как отменить. Отправитель не знает деталей реализации.

## Реальный пример 1: текстовый редактор с Undo/Redo

Классический пример - редактор с возможностью отмены действий. Каждое действие пользователя - это команда.

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

Команда удаления текста:

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

История команд для Undo/Redo:

```go
type CommandHistory struct {
    commands []Command
    current  int
}

func (h *CommandHistory) Execute(cmd Command) error {
    if err := cmd.Execute(); err != nil {
        return err
    }
    
    // Удалить команды после текущей позиции
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

Использование:

```go
editor := &Editor{}
history := &CommandHistory{}

// Пользователь вводит текст
history.Execute(&InsertTextCommand{
    editor: editor,
    text:   "Hello",
})

history.Execute(&InsertTextCommand{
    editor: editor,
    text:   " World",
})

// Отменить последнее действие
history.Undo() // Удалит " World"

// Вернуть обратно
history.Redo() // Вернёт " World"
```

## Реальный пример 2: система задач и очередей

В распределённых системах команды используются для асинхронной обработки задач.

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
    // Отправка email
    return emailService.Send(c.To, c.Subject, c.Body)
}

func (c *SendEmailCommand) GetID() string {
    return c.ID
}

func (c *SendEmailCommand) GetPriority() int {
    return c.Priority
}
```

Команда обработки изображения:

```go
type ProcessImageCommand struct {
    ID       string
    ImageURL string
    Width    int
    Height   int
    Priority int
}

func (c *ProcessImageCommand) Execute(ctx context.Context) error {
    // Скачать изображение
    img, err := downloadImage(c.ImageURL)
    if err != nil {
        return err
    }
    
    // Изменить размер
    resized := resize(img, c.Width, c.Height)
    
    // Загрузить обратно
    return uploadImage(resized)
}

func (c *ProcessImageCommand) GetID() string {
    return c.ID
}

func (c *ProcessImageCommand) GetPriority() int {
    return c.Priority
}
```

Очередь команд с приоритетами:

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

Использование:

```go
queue := &CommandQueue{workers: 5}
queue.Process(context.Background())

// Добавить задачи
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

## Реальный пример 3: транзакции и откат изменений

В системах с базами данных команды используются для управления транзакциями.

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

Команда создания профиля:

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

Менеджер транзакций:

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
            // Откатить все команды
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

Использование:

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
    // Все изменения откачены
}
```

## Реальный пример 4: макросы и пакетные операции

Команды можно группировать для выполнения серии действий.

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
    // Отменить в обратном порядке
    for i := len(m.commands) - 1; i >= 0; i-- {
        if err := m.commands[i].Undo(); err != nil {
            return err
        }
    }
    return nil
}
```

Пример: форматирование документа:

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

// Использование
history.Execute(FormatDocument(editor))

// Отменить всё форматирование одной командой
history.Undo()
```

## Реальный пример 5: планировщик задач

Команды с отложенным выполнением и повторами.

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

Использование:

```go
scheduler := &Scheduler{}
go scheduler.Run(context.Background())

// Отправить email через 5 минут
scheduler.Schedule(&SendEmailCommand{
    To:      "user@example.com",
    Subject: "Reminder",
    Body:    "Don't forget!",
}, 5*time.Minute)

// Обработать изображение через час
scheduler.Schedule(&ProcessImageCommand{
    ImageURL: "https://example.com/image.jpg",
    Width:    1920,
    Height:   1080,
}, time.Hour)
```

## Реальный пример 6: логирование и аудит

Команды автоматически логируют все действия.

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

Обёртка для добавления логирования:

```go
func WithLogging(cmd Command, userID string, logger *log.Logger) Command {
    return &LoggingCommand{
        command: cmd,
        logger:  logger,
        userID:  userID,
    }
}

// Использование
history.Execute(WithLogging(
    &DeleteTextCommand{editor: editor, length: 5},
    "user-123",
    logger,
))
```

## Когда использовать Command Pattern

1. **Undo/Redo** - когда нужна история действий с возможностью отмены
2. **Очереди задач** - когда действия нужно выполнять асинхронно
3. **Транзакции** - когда нужен откат изменений при ошибке
4. **Логирование** - когда нужно записывать все действия пользователя
5. **Макросы** - когда нужно группировать команды
6. **Отложенное выполнение** - когда действие нужно выполнить позже

## Преимущества

- Разделение отправителя и получателя
- Возможность отмены и повтора
- Логирование и аудит
- Очереди и планирование
- Композиция команд
- Тестируемость

## Недостатки

- Увеличение количества классов
- Дополнительная сложность для простых операций
- Overhead на создание объектов

## Command vs Strategy

Strategy выбирает алгоритм. Command инкапсулирует действие.

```go
// Strategy: выбор алгоритма
type SortStrategy interface {
    Sort([]int) []int
}

// Command: действие с отменой
type Command interface {
    Execute() error
    Undo() error
}
```

## Заключение

Command Pattern в Go:

- Превращает действия в объекты
- Позволяет отменять и повторять операции
- Упрощает логирование и аудит
- Поддерживает очереди и планирование
- Делает код более гибким и тестируемым

Команды - это не усложнение. Это мощный инструмент для управления действиями в приложении. Если вам нужна история, отмена, очереди или логирование - используйте Command Pattern.

В современных приложениях команды везде: текстовые редакторы, системы задач, транзакции, планировщики, аудит. Они делают сложные операции управляемыми.
