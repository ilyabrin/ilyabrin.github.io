---
title: "Test Doubles: mocks, stubs и dependency injection в Go"
date: 2025-05-09T14:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'testing', 'quality-assurance']
tags: ['testing', 'mocks', 'stubs', 'dependency-injection', 'golang', 'unit-testing', 'tdd', 'test-doubles']
---

Привет, тестировщик! 👋

Твои тесты **медленные**, **хрупкие** и **зависят от внешних сервисов**? Каждый раз когда база данных недоступна, половина тестов падает?

**Test Doubles** - это твоё спасение. Вместо реальных зависимостей используй **подделки**: моки, стабы, фейки.

Разбираем, как правильно изолировать код для тестирования и писать **быстрые**, **надёжные** unit-тесты в Go 🚀

<!--more-->

## 1. Что такое Test Doubles и зачем они нужны

### Проблема реальных зависимостей

```go
// Плохо: тест зависит от реальной базы данных
func TestUserService_CreateUser(t *testing.T) {
    db := connectToRealDatabase() // Медленно!
    service := NewUserService(db)
    
    user, err := service.CreateUser("john@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "john@example.com", user.Email)
}
```

**Проблемы:**

- 🐌 **Медленно** - подключение к базе занимает время
- 💥 **Хрупко** - тест падает если база недоступна
- 🔄 **Побочные эффекты** - тест изменяет состояние базы
- 🚫 **Сложно тестировать ошибки** - как симулировать сбой базы?

### Test Doubles: типы подделок

**Dummy** - объект-заглушка, не используется в тесте
**Stub** - возвращает заранее определённые значения
**Mock** - проверяет, что методы вызывались правильно
**Fake** - упрощённая рабочая реализация
**Spy** - записывает информацию о вызовах

## 2. Dependency Injection в Go

### Проблема жёстких зависимостей

```go
// Плохо: жёсткая зависимость
type UserService struct {}

func (s *UserService) CreateUser(email string) (*User, error) {
    db := postgres.Connect() // Нельзя заменить в тестах!
    return db.CreateUser(email)
}
```

### Решение: внедрение зависимостей

```go
// Хорошо: зависимость через интерфейс
type UserRepository interface {
    CreateUser(email string) (*User, error)
    GetUser(id string) (*User, error)
}

type UserService struct {
    repo UserRepository
}

func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}

func (s *UserService) CreateUser(email string) (*User, error) {
    return s.repo.CreateUser(email)
}
```

## 3. Stubs: простые заглушки

### Ручные стubs

```go
// Stub реализация
type StubUserRepository struct {
    users map[string]*User
    err   error
}

func (s *StubUserRepository) CreateUser(email string) (*User, error) {
    if s.err != nil {
        return nil, s.err
    }
    
    user := &User{ID: "123", Email: email}
    s.users[user.ID] = user
    return user, nil
}

func (s *StubUserRepository) GetUser(id string) (*User, error) {
    if s.err != nil {
        return nil, s.err
    }
    return s.users[id], nil
}
```

### Тест со stub

```go
func TestUserService_CreateUser_Success(t *testing.T) {
    // Arrange
    stub := &StubUserRepository{
        users: make(map[string]*User),
    }
    service := NewUserService(stub)
    
    // Act
    user, err := service.CreateUser("john@example.com")
    
    // Assert
    assert.NoError(t, err)
    assert.Equal(t, "john@example.com", user.Email)
}

func TestUserService_CreateUser_Error(t *testing.T) {
    // Arrange
    stub := &StubUserRepository{
        err: errors.New("database error"),
    }
    service := NewUserService(stub)
    
    // Act
    user, err := service.CreateUser("john@example.com")
    
    // Assert
    assert.Error(t, err)
    assert.Nil(t, user)
}
```

## 4. Mocks: проверка взаимодействий

### Ручные mocks

```go
type MockUserRepository struct {
    createUserCalled bool
    createUserEmail  string
    createUserResult *User
    createUserError  error
}

func (m *MockUserRepository) CreateUser(email string) (*User, error) {
    m.createUserCalled = true
    m.createUserEmail = email
    return m.createUserResult, m.createUserError
}

func (m *MockUserRepository) GetUser(id string) (*User, error) {
    return nil, nil
}

func (m *MockUserRepository) AssertCreateUserCalled(t *testing.T, email string) {
    assert.True(t, m.createUserCalled, "CreateUser should be called")
    assert.Equal(t, email, m.createUserEmail)
}
```

### Тест с mock

```go
func TestUserService_CreateUser_CallsRepository(t *testing.T) {
    // Arrange
    mock := &MockUserRepository{
        createUserResult: &User{ID: "123", Email: "john@example.com"},
    }
    service := NewUserService(mock)
    
    // Act
    service.CreateUser("john@example.com")
    
    // Assert
    mock.AssertCreateUserCalled(t, "john@example.com")
}
```

## 5. Testify/mock: автоматические mocks

### Установка и генерация

```bash
go install github.com/vektra/mockery/v2@latest
mockery --name=UserRepository
```

### Сгенерированный mock

```go
//go:generate mockery --name=UserRepository
type UserRepository interface {
    CreateUser(email string) (*User, error)
    GetUser(id string) (*User, error)
}
```

### Использование testify mocks

```go
func TestUserService_CreateUser_WithTestify(t *testing.T) {
    // Arrange
    mockRepo := mocks.NewUserRepository(t)
    mockRepo.On("CreateUser", "john@example.com").
        Return(&User{ID: "123", Email: "john@example.com"}, nil)
    
    service := NewUserService(mockRepo)
    
    // Act
    user, err := service.CreateUser("john@example.com")
    
    // Assert
    assert.NoError(t, err)
    assert.Equal(t, "john@example.com", user.Email)
    mockRepo.AssertExpectations(t)
}
```

## 6. Продвинутые паттерны

### Builder для test data

```go
type UserBuilder struct {
    user *User
}

func NewUserBuilder() *UserBuilder {
    return &UserBuilder{
        user: &User{
            ID:    "default-id",
            Email: "default@example.com",
        },
    }
}

func (b *UserBuilder) WithID(id string) *UserBuilder {
    b.user.ID = id
    return b
}

func (b *UserBuilder) WithEmail(email string) *UserBuilder {
    b.user.Email = email
    return b
}

func (b *UserBuilder) Build() *User {
    return b.user
}

// Использование
func TestUserService_UpdateUser(t *testing.T) {
    user := NewUserBuilder().
        WithID("123").
        WithEmail("john@example.com").
        Build()
    
    // тест...
}
```

### Spy pattern

```go
type SpyUserRepository struct {
    calls []string
    StubUserRepository
}

func (s *SpyUserRepository) CreateUser(email string) (*User, error) {
    s.calls = append(s.calls, fmt.Sprintf("CreateUser(%s)", email))
    return s.StubUserRepository.CreateUser(email)
}

func (s *SpyUserRepository) GetCallHistory() []string {
    return s.calls
}

func TestUserService_CallOrder(t *testing.T) {
    spy := &SpyUserRepository{}
    service := NewUserService(spy)
    
    service.CreateUser("john@example.com")
    service.GetUser("123")
    
    expected := []string{
        "CreateUser(john@example.com)",
        "GetUser(123)",
    }
    assert.Equal(t, expected, spy.GetCallHistory())
}
```

## 7. HTTP клиенты и внешние API

### Тестирование HTTP клиентов

```go
type HTTPClient interface {
    Do(req *http.Request) (*http.Response, error)
}

type APIClient struct {
    client HTTPClient
    baseURL string
}

func (c *APIClient) GetUser(id string) (*User, error) {
    req, _ := http.NewRequest("GET", c.baseURL+"/users/"+id, nil)
    resp, err := c.client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var user User
    json.NewDecoder(resp.Body).Decode(&user)
    return &user, nil
}
```

### Mock HTTP клиента

```go
type MockHTTPClient struct {
    response *http.Response
    err      error
}

func (m *MockHTTPClient) Do(req *http.Request) (*http.Response, error) {
    return m.response, m.err
}

func TestAPIClient_GetUser(t *testing.T) {
    // Arrange
    responseBody := `{"id":"123","email":"john@example.com"}`
    mockClient := &MockHTTPClient{
        response: &http.Response{
            StatusCode: 200,
            Body:       io.NopCloser(strings.NewReader(responseBody)),
        },
    }
    
    client := &APIClient{
        client:  mockClient,
        baseURL: "https://api.example.com",
    }
    
    // Act
    user, err := client.GetUser("123")
    
    // Assert
    assert.NoError(t, err)
    assert.Equal(t, "123", user.ID)
}
```

## 8. Интеграционные тесты с testcontainers

### Реальная база для интеграционных тестов

```go
func TestUserRepository_Integration(t *testing.T) {
    // Запускаем PostgreSQL в Docker
    ctx := context.Background()
    postgres, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image:        "postgres:13",
            ExposedPorts: []string{"5432/tcp"},
            Env: map[string]string{
                "POSTGRES_PASSWORD": "password",
                "POSTGRES_DB":       "testdb",
            },
        },
        Started: true,
    })
    require.NoError(t, err)
    defer postgres.Terminate(ctx)
    
    // Получаем порт и подключаемся
    port, _ := postgres.MappedPort(ctx, "5432")
    dsn := fmt.Sprintf("postgres://postgres:password@localhost:%s/testdb?sslmode=disable", port.Port())
    
    db, err := sql.Open("postgres", dsn)
    require.NoError(t, err)
    
    // Тестируем реальную реализацию
    repo := NewPostgresUserRepository(db)
    user, err := repo.CreateUser("john@example.com")
    
    assert.NoError(t, err)
    assert.NotEmpty(t, user.ID)
}
```

## 9. Лучшие практики

### Правило пирамиды тестов

```sh
        /\
       /  \
      / UI \     <- Мало (E2E тесты)
     /______\
    /        \
   /Integration\ <- Средне (с реальными компонентами)
  /__________\
 /            \
/  Unit Tests  \  <- Много (с test doubles)
/______________\
```

### Когда использовать каждый тип

**Unit тесты (70%):** Test doubles для всех зависимостей
**Integration тесты (20%):** Реальные компоненты (база, очереди)
**E2E тесты (10%):** Полная система

### Принципы хороших тестов

```go
// FIRST принципы:
// Fast - быстрые
// Independent - независимые
// Repeatable - повторяемые
// Self-validating - самопроверяющиеся
// Timely - своевременные

func TestUserService_CreateUser_FIRST(t *testing.T) {
    // Fast: используем mock вместо реальной базы
    mock := &MockUserRepository{}
    
    // Independent: не зависит от других тестов
    service := NewUserService(mock)
    
    // Repeatable: всегда один результат
    mock.createUserResult = &User{ID: "123"}
    
    // Self-validating: чёткие assertions
    user, err := service.CreateUser("test@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "123", user.ID)
    
    // Timely: написан вместе с кодом
}
```

## Вывод: Test Doubles = быстрые и надёжные тесты

**Правильное использование test doubles:**
🚀 **Ускоряет тесты** - никаких внешних зависимостей  
🛡️ **Повышает надёжность** - тесты не падают из-за сети  
🎯 **Улучшает фокус** - тестируем только свой код  
🔧 **Упрощает отладку** - контролируемое поведение  

**Золотые правила:**

- Используй **интерфейсы** для всех зависимостей
- **Unit тесты** = test doubles, **интеграционные** = реальные компоненты
- **Не мокай** то, чем не владеешь (внешние библиотеки)
- **Тестируй поведение**, а не реализацию

**P.S. Как вы тестируете сложные зависимости? Делитесь опытом!** 🚀

```go
// Дополнительные ресурсы:
// - "Test Doubles" by Martin Fowler
// - testify/mock: https://github.com/stretchr/testify
// - mockery: https://github.com/vektra/mockery
// - testcontainers-go: https://github.com/testcontainers/testcontainers-go
```
