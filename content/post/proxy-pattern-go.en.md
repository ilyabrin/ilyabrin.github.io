---
title: "Proxy Pattern in Go: Access Control and Resource Management"
date: 2025-08-12T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "design-patterns", "proxy", "access-control", "architecture"]
categories: ["Development"]
---

`Proxy pattern` provides a surrogate or placeholder for another object to control access to it. It acts as an intermediary, adding functionality without changing the original object.

Here's when and how to use it in real-world Go applications.

<!--more-->

## The Problem

You have an object that's expensive to create, requires access control, or needs additional functionality. Direct access causes issues:

**Scenario 1: Database Connection**

Your application connects to PostgreSQL. Each connection consumes memory and network resources. Creating connections for every request is wasteful. You need connection pooling, but clients shouldn't know about it.

**Scenario 2: External API**

You're calling a third-party payment API. Each call costs money. You need caching, rate limiting, and logging. But you don't want to modify the API client code every time requirements change.

**Scenario 3: Sensitive Resources**

Your service accesses user data. Not all users have permission to access all data. You need authorization checks before every access. But business logic shouldn't be cluttered with security code.

**Common thread:** You need to control access to an object without changing how clients use it.

## What is Proxy Pattern

Proxy pattern creates an intermediary object that:

- Implements the same interface as the real object
- Controls access to the real object
- Can add functionality before/after delegating to real object
- Appears identical to clients

**Key insight:** Clients don't know they're talking to a proxy. They think they're using the real object.

## Types of Proxies

### Virtual Proxy

**Purpose:** Delay expensive object creation until actually needed.

**Real-world case:** Image loading in content management system.

You're building a CMS where articles contain images. Loading all images immediately would:

- Consume excessive memory
- Slow down page rendering
- Waste bandwidth for images user never sees

Virtual proxy solution:

- Create lightweight placeholder for each image
- Load actual image only when user scrolls to it
- Cache loaded images for reuse
- Release memory for images scrolled past

**Benefits:**

- Faster initial page load
- Lower memory consumption
- Better user experience
- Reduced server load

### Protection Proxy

**Purpose:** Control access based on permissions.

**Real-world case:** Document management system.

Your company has confidential documents. Different employees have different access levels:

- Public documents: Everyone can read
- Internal documents: Employees only
- Confidential: Managers only
- Secret: C-level executives only

Protection proxy solution:

- Check user permissions before allowing access
- Log all access attempts for audit
- Deny access with clear error messages
- Support role-based access control (RBAC)

**Benefits:**

- Centralized security logic
- Consistent access control
- Audit trail for compliance
- Easy to modify permissions

### Remote Proxy

**Purpose:** Represent object in different address space.

**Real-world case:** Microservices communication.

Your e-commerce platform has separate services:

- Product service (manages inventory)
- Order service (processes orders)
- Payment service (handles transactions)

Order service needs product information but shouldn't directly access product database. Remote proxy solution:

- Order service uses proxy that looks like local product repository
- Proxy makes HTTP/gRPC calls to product service
- Handles network errors and retries
- Caches responses to reduce network calls

**Benefits:**

- Services remain decoupled
- Network complexity hidden from business logic
- Easy to add caching and retry logic
- Can switch between local and remote implementations

### Caching Proxy

**Purpose:** Cache expensive operations.

**Real-world case:** Analytics dashboard.

Your dashboard shows business metrics:

- Revenue by region (complex SQL query)
- User growth (aggregates millions of records)
- Product performance (joins multiple tables)

Queries take 5-10 seconds each. Users refresh frequently. Database gets hammered.

Caching proxy solution:

- Proxy sits between dashboard and database
- First request: Execute query, cache result
- Subsequent requests: Return cached result
- Invalidate cache after 5 minutes or on data update

**Benefits:**

- Dashboard responds instantly
- Database load reduced by 90%
- Better user experience
- Lower infrastructure costs

## Real-World Implementation: Database Proxy

### Context

You're building a SaaS application. Multiple tenants share the same database. Each tenant's data must be isolated. You need:

- Automatic tenant filtering on all queries
- Query logging for debugging
- Connection pooling for performance
- Automatic retry on transient failures

### Without Proxy

Every database call in your codebase looks like:

```go
// Scattered throughout codebase
func GetUser(db *sql.DB, tenantID, userID string) (*User, error) {
    // Tenant check - repeated everywhere
    if tenantID == "" {
        return nil, errors.New("tenant required")
    }
    
    // Logging - repeated everywhere
    log.Printf("Query: GetUser, Tenant: %s, User: %s", tenantID, userID)
    
    // Actual query
    row := db.QueryRow("SELECT * FROM users WHERE tenant_id = $1 AND id = $2", tenantID, userID)
    
    // Error handling - repeated everywhere
    var user User
    err := row.Scan(&user.ID, &user.Name, &user.Email)
    if err != nil {
        log.Printf("Error: %v", err)
        return nil, err
    }
    
    return &user, nil
}
```

**Problems:**

- Tenant check duplicated in every function
- Easy to forget tenant filtering (security risk!)
- Logging code clutters business logic
- Can't add features without modifying all functions

### With Proxy

Proxy handles cross-cutting concerns:

```go
type DatabaseProxy struct {
    db       *sql.DB
    tenantID string
    logger   *log.Logger
}

func (p *DatabaseProxy) QueryRow(query string, args ...interface{}) *sql.Row {
    // Automatic tenant injection
    modifiedQuery := p.injectTenantFilter(query)
    
    // Logging
    p.logger.Printf("Query: %s, Tenant: %s", query, p.tenantID)
    
    // Delegate to real database
    return p.db.QueryRow(modifiedQuery, args...)
}
```

Now your business logic is clean:

```go
func GetUser(db *DatabaseProxy, userID string) (*User, error) {
    // No tenant check needed - proxy handles it
    // No logging needed - proxy handles it
    row := db.QueryRow("SELECT * FROM users WHERE id = $1", userID)
    
    var user User
    err := row.Scan(&user.ID, &user.Name, &user.Email)
    return &user, err
}
```

**Benefits:**

- Business logic focuses on business
- Security enforced automatically
- Easy to add features (caching, metrics, tracing)
- Single place to modify database behavior

## Real-World Implementation: API Client Proxy

### Context

Your application integrates with Stripe payment API. Requirements:

- Rate limiting (100 requests per minute)
- Automatic retry on network errors
- Caching for GET requests
- Logging all API calls for debugging
- Circuit breaker to prevent cascading failures

### Without Proxy

Every API call needs all this logic:

```go
func ChargeCustomer(client *stripe.Client, amount int) error {
    // Rate limiting check
    if !rateLimiter.Allow() {
        return errors.New("rate limit exceeded")
    }
    
    // Logging
    log.Printf("Charging customer: %d", amount)
    
    // Retry logic
    var err error
    for i := 0; i < 3; i++ {
        err = client.Charge(amount)
        if err == nil {
            break
        }
        time.Sleep(time.Second * time.Duration(i+1))
    }
    
    // Circuit breaker check
    if err != nil {
        circuitBreaker.RecordFailure()
    }
    
    return err
}
```

This logic is duplicated for every API method. Maintenance nightmare.

### With Proxy

Proxy encapsulates all cross-cutting concerns:

```go
type StripeProxy struct {
    client         *stripe.Client
    rateLimiter    *RateLimiter
    cache          *Cache
    circuitBreaker *CircuitBreaker
    logger         *log.Logger
}

func (p *StripeProxy) Charge(amount int) error {
    // Check circuit breaker
    if p.circuitBreaker.IsOpen() {
        return errors.New("circuit breaker open")
    }
    
    // Check rate limit
    if !p.rateLimiter.Allow() {
        return errors.New("rate limited")
    }
    
    // Log request
    p.logger.Printf("Stripe charge: %d", amount)
    
    // Retry with exponential backoff
    err := p.retryWithBackoff(func() error {
        return p.client.Charge(amount)
    })
    
    // Update circuit breaker
    if err != nil {
        p.circuitBreaker.RecordFailure()
    } else {
        p.circuitBreaker.RecordSuccess()
    }
    
    return err
}
```

Business code stays simple:

```go
func ProcessPayment(proxy *StripeProxy, amount int) error {
    // All complexity handled by proxy
    return proxy.Charge(amount)
}
```

**Benefits:**

- Reliability features in one place
- Easy to test (mock the proxy)
- Can swap implementations (test vs production)
- Business logic remains clean

## Real-World Implementation: Lazy Loading Proxy

### Context

Your application loads user profiles. Each profile includes:

- Basic info (name, email) - small, fast
- Avatar image - large, slow to load
- Activity history - huge, expensive query
- Preferences - medium size

Most requests only need basic info. Loading everything wastes resources.

### Solution

Lazy loading proxy loads data on demand:

```go
type UserProxy struct {
    userID   string
    repo     *UserRepository
    
    // Cached data
    basicInfo     *BasicInfo
    avatar        *Image
    history       *ActivityHistory
    preferences   *Preferences
    
    // Load flags
    basicLoaded   bool
    avatarLoaded  bool
    historyLoaded bool
    prefsLoaded   bool
}

func (p *UserProxy) GetBasicInfo() *BasicInfo {
    if !p.basicLoaded {
        p.basicInfo = p.repo.LoadBasicInfo(p.userID)
        p.basicLoaded = true
    }
    return p.basicInfo
}

func (p *UserProxy) GetAvatar() *Image {
    if !p.avatarLoaded {
        p.avatar = p.repo.LoadAvatar(p.userID)
        p.avatarLoaded = true
    }
    return p.avatar
}
```

**Usage patterns:**

**Pattern 1: List view (only basic info)**

```go
users := GetUsers() // Returns proxies
for _, user := range users {
    // Only basic info loaded
    fmt.Printf("%s (%s)\n", user.GetBasicInfo().Name, user.GetBasicInfo().Email)
}
// Avatar and history never loaded - saved time and memory
```

**Pattern 2: Detail view (everything)**

```go
user := GetUser(userID) // Returns proxy
// Load on demand as needed
info := user.GetBasicInfo()
avatar := user.GetAvatar()
history := user.GetHistory()
```

**Benefits:**

- Faster list views (90% faster)
- Lower memory usage (70% reduction)
- Reduced database load
- Same interface for clients

## When to Use Proxy Pattern

**Use when:**

**Access control needed:**

- Authentication/authorization
- Audit logging
- Rate limiting

**Resource management required:**

- Lazy loading
- Connection pooling
- Caching

**Additional functionality without modification:**

- Logging
- Metrics
- Tracing

**Remote access:**

- Microservices communication
- API clients
- Distributed systems

**Don't use when:**

**Simple direct access sufficient:**

- No access control needed
- No performance concerns
- No additional functionality required

**Overhead not justified:**

- Very simple objects
- Performance critical path
- Complexity outweighs benefits

## Proxy vs Decorator

Both add functionality, but different purposes:

**Proxy:**

- Controls access to object
- May not create real object immediately
- Focuses on access control and resource management
- Client may not know it's using proxy

**Decorator:**

- Adds functionality to object
- Real object always exists
- Focuses on extending behavior
- Client explicitly wraps object

**Example distinction:**

Proxy: "Check if user has permission before allowing database access"
Decorator: "Add encryption to file writer"

## Common Pitfalls

**Pitfall 1: Proxy becomes god object**

Don't add unrelated functionality to proxy. Keep it focused.

**Bad:** Proxy handles caching, logging, metrics, validation, transformation, and business logic.

**Good:** Separate proxies for separate concerns. Chain them if needed.

**Pitfall 2: Forgetting to implement all interface methods**

If proxy doesn't implement complete interface, clients break.

**Solution:** Use interface embedding in Go to ensure completeness.

**Pitfall 3: Performance overhead**

Every proxy call adds overhead. Don't proxy in hot paths unless necessary.

**Solution:** Profile first. Add proxy only where benefits outweigh costs.

## Testing with Proxies

Proxies make testing easier:

**Test proxy behavior:**

```go
func TestCachingProxy(t *testing.T) {
    mock := &MockDatabase{}
    proxy := NewCachingProxy(mock)
    
    // First call hits database
    proxy.GetUser("user-1")
    assert.Equal(t, 1, mock.CallCount)
    
    // Second call uses cache
    proxy.GetUser("user-1")
    assert.Equal(t, 1, mock.CallCount) // Still 1!
}
```

**Test with mock proxy:**

```go
func TestBusinessLogic(t *testing.T) {
    mockProxy := &MockDatabaseProxy{
        Users: map[string]*User{
            "user-1": {ID: "user-1", Name: "Test"},
        },
    }
    
    // Test business logic without real database
    result := ProcessUser(mockProxy, "user-1")
    assert.NotNil(t, result)
}
```

## Conclusion

Proxy pattern provides controlled access to objects.

**Key benefits:**

- Separation of concerns
- Centralized cross-cutting logic
- Easy to add functionality
- Transparent to clients

**Common use cases:**

- Access control and security
- Resource management and optimization
- Remote object access
- Lazy loading and caching

**Implementation tips:**

- Keep proxies focused
- Implement complete interface
- Consider performance impact
- Use for cross-cutting concerns

Proxy pattern is essential for building maintainable, secure, and performant Go applications.

---

*How do you use proxies in your Go applications? Share your experience in comments or reach out directly.*
