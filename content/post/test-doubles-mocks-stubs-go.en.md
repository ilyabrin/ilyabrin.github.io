---
title: "Test Doubles: Mocks, Stubs and Dependency Injection in Go"
date: 2025-05-09T14:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'testing', 'quality-assurance']
tags: ['testing', 'mocks', 'stubs', 'dependency-injection', 'golang', 'unit-testing', 'tdd', 'test-doubles']
---

Hey tester! 👋

Are your tests **slow**, **brittle**, and **dependent on external services**? Every time the database is unavailable, half your tests fail?

**Test Doubles** are your salvation. Instead of real dependencies, use **fakes**: mocks, stubs, fakes.

Let's break down how to properly isolate code for testing and write **fast**, **reliable** unit tests in Go 🚀

<!--more-->

## 1. What are Test Doubles and why do you need them

### The problem with real dependencies

```go
// Bad: test depends on real database
func TestUserService_CreateUser(t *testing.T) {
    db := connectToRealDatabase() // Slow!
    service := NewUserService(db)
    
    user, err := service.CreateUser("john@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "john@example.com", user.Email)
}
```

**Problems:**

- 🐌 **Slow** - database connection takes time
- 💥 **Brittle** - test fails if database is unavailable
- 🔄 **Side effects** - test changes database state
- 🚫 **Hard to test errors** - how to simulate database failure?

### Test Doubles: types of fakes

**Dummy** - placeholder object, not used in test
**Stub** - returns predefined values
**Mock** - verifies that methods were called correctly
**Fake** - simplified working implementation
**Spy** - records information about calls

## 2. Dependency Injection in Go

### The problem with hard dependencies

```go
// Bad: hard dependency
type UserService struct {}

func (s *UserService) CreateUser(email string) (*User, error) {
    db := postgres.Connect() // Can't replace in tests!
    return db.CreateUser(email)
}
```

### Solution: dependency injection

```go
// Good: dependency through interface
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

## 3. Stubs: simple placeholders

### Manual stubs

```go
// Stub implementation
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

### Test with stub

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

## 4. Mocks: verifying interactions

### Manual mocks

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

### Test with mock

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

## 5. Testify/mock: automatic mocks

### Installation and generation

```bash
go install github.com/vektra/mockery/v2@latest
mockery --name=UserRepository
```

### Generated mock

```go
//go:generate mockery --name=UserRepository
type UserRepository interface {
    CreateUser(email string) (*User, error)
    GetUser(id string) (*User, error)
}
```

### Using testify mocks

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

## 6. Advanced patterns

### Builder for test data

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

// Usage
func TestUserService_UpdateUser(t *testing.T) {
    user := NewUserBuilder().
        WithID("123").
        WithEmail("john@example.com").
        Build()
    
    // test...
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

## 7. HTTP clients and external APIs

### Testing HTTP clients

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

### Mock HTTP client

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

## 8. Integration tests with testcontainers

### Real database for integration tests

```go
func TestUserRepository_Integration(t *testing.T) {
    // Start PostgreSQL in Docker
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
    
    // Get port and connect
    port, _ := postgres.MappedPort(ctx, "5432")
    dsn := fmt.Sprintf("postgres://postgres:password@localhost:%s/testdb?sslmode=disable", port.Port())
    
    db, err := sql.Open("postgres", dsn)
    require.NoError(t, err)
    
    // Test real implementation
    repo := NewPostgresUserRepository(db)
    user, err := repo.CreateUser("john@example.com")
    
    assert.NoError(t, err)
    assert.NotEmpty(t, user.ID)
}
```

## 9. Best practices

### Test pyramid rule

```sh
        /\
       /  \
      / UI \     <- Few (E2E tests)
     /______\
    /        \
   /Integration\ <- Some (with real components)
  /__________\
 /            \
/  Unit Tests  \  <- Many (with test doubles)
/______________\
```

### When to use each type

**Unit tests (70%):** Test doubles for all dependencies
**Integration tests (20%):** Real components (database, queues)
**E2E tests (10%):** Full system

### Principles of good tests

```go
// FIRST principles:
// Fast - fast
// Independent - independent
// Repeatable - repeatable
// Self-validating - self-validating
// Timely - timely

func TestUserService_CreateUser_FIRST(t *testing.T) {
    // Fast: use mock instead of real database
    mock := &MockUserRepository{}
    
    // Independent: doesn't depend on other tests
    service := NewUserService(mock)
    
    // Repeatable: always same result
    mock.createUserResult = &User{ID: "123"}
    
    // Self-validating: clear assertions
    user, err := service.CreateUser("test@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "123", user.ID)
    
    // Timely: written together with code
}
```

## Conclusion: Test Doubles = fast and reliable tests

**Proper use of test doubles:**
🚀 **Speeds up tests** - no external dependencies  
🛡️ **Increases reliability** - tests don't fail due to network  
🎯 **Improves focus** - test only your code  
🔧 **Simplifies debugging** - controlled behavior  

**Golden rules:**

- Use **interfaces** for all dependencies
- **Unit tests** = test doubles, **integration** = real components
- **Don't mock** what you don't own (external libraries)
- **Test behavior**, not implementation

**P.S. How do you test complex dependencies? Share your experience!** 🚀

```go
// Additional resources:
// - "Test Doubles" by Martin Fowler
// - testify/mock: https://github.com/stretchr/testify
// - mockery: https://github.com/vektra/mockery
// - testcontainers-go: https://github.com/testcontainers/testcontainers-go
```
