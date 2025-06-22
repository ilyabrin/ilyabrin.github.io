---
title: "Facade Pattern in Go: Simplifying Subsystem Interactions"
date: 2025-06-18T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "facade"]
categories: ["Patterns"]
---

Facade Pattern is a simplified interface to a complex system. Instead of dealing with dozens of classes and methods, the client works with one simple facade that hides all the complexity inside.

It's like a concierge at a hotel: you don't call the laundry, restaurant, and housekeeping separately. You tell the concierge what you need, and they coordinate everything for you.

<!--more-->

## Problem: Interaction Complexity

Modern applications consist of many subsystems. To perform one business operation, you need to:

- Check data in the database
- Update cache
- Send event to queue
- Write log
- Update metrics
- Send notification

Each subsystem has its own API. Client code turns into spaghetti of calls to different services.

## Solution: Single Facade

Facade provides one method that coordinates all subsystems:

```go
type UserFacade struct {
    db          *sql.DB
    cache       *redis.Client
    queue       *kafka.Producer
    logger      *zap.Logger
    metrics     *prometheus.Registry
    notifier    *EmailService
}

func (f *UserFacade) CreateUser(ctx context.Context, user *User) error {
    // Facade coordinates all subsystems
    if err := f.db.Insert(ctx, user); err != nil {
        return err
    }
    
    f.cache.Set(ctx, user.ID, user)
    f.queue.Send(ctx, "user.created", user)
    f.logger.Info("User created", zap.String("id", user.ID))
    f.metrics.Inc("users_created_total")
    f.notifier.SendWelcome(user.Email)
    
    return nil
}
```

Client calls one method instead of six.

## Real Example 1: User Registration

In a real application, user registration isn't just an INSERT into database. It's a whole process:

```go
type RegistrationFacade struct {
    userRepo     UserRepository
    emailService EmailService
    smsService   SMSService
    analytics    Analytics
    cache        Cache
    logger       Logger
}

func (f *RegistrationFacade) RegisterUser(ctx context.Context, req RegisterRequest) (*User, error) {
    // 1. Validation
    if err := f.validateRequest(req); err != nil {
        return nil, fmt.Errorf("validation failed: %w", err)
    }
    
    // 2. Check existence
    exists, err := f.userRepo.ExistsByEmail(ctx, req.Email)
    if err != nil {
        return nil, fmt.Errorf("check existence: %w", err)
    }
    if exists {
        return nil, errors.New("user already exists")
    }
    
    // 3. Create user
    user := &User{
        ID:       generateID(),
        Email:    req.Email,
        Password: hashPassword(req.Password),
        Status:   StatusPending,
    }
    
    if err := f.userRepo.Create(ctx, user); err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    
    // 4. Send verification
    token := generateVerificationToken()
    if err := f.emailService.SendVerification(user.Email, token); err != nil {
        f.logger.Error("Failed to send verification", "error", err)
        // Don't return error, user is created
    }
    
    // 5. SMS with code
    if req.Phone != "" {
        code := generateSMSCode()
        f.smsService.SendCode(req.Phone, code)
    }
    
    // 6. Analytics
    f.analytics.Track("user_registered", map[string]interface{}{
        "user_id": user.ID,
        "source":  req.Source,
    })
    
    // 7. Caching
    f.cache.Set(ctx, "user:"+user.ID, user, 24*time.Hour)
    
    f.logger.Info("User registered successfully", "user_id", user.ID)
    
    return user, nil
}

func (f *RegistrationFacade) validateRequest(req RegisterRequest) error {
    if !isValidEmail(req.Email) {
        return errors.New("invalid email")
    }
    if len(req.Password) < 8 {
        return errors.New("password too short")
    }
    return nil
}
```

Without facade, the client would have to call all these methods themselves. With facade - one call:

```go
user, err := registrationFacade.RegisterUser(ctx, RegisterRequest{
    Email:    "user@example.com",
    Password: "secret123",
    Phone:    "+1234567890",
    Source:   "web",
})
```

## Real Example 2: Order Checkout

Order checkout in e-commerce is a complex process with many steps:

```go
type CheckoutFacade struct {
    cartService     CartService
    inventoryService InventoryService
    paymentService  PaymentService
    shippingService ShippingService
    orderRepo       OrderRepository
    emailService    EmailService
    loyaltyService  LoyaltyService
}

func (f *CheckoutFacade) PlaceOrder(ctx context.Context, userID string) (*Order, error) {
    // 1. Get cart
    cart, err := f.cartService.GetCart(ctx, userID)
    if err != nil {
        return nil, fmt.Errorf("get cart: %w", err)
    }
    
    if len(cart.Items) == 0 {
        return nil, errors.New("cart is empty")
    }
    
    // 2. Check product availability
    for _, item := range cart.Items {
        available, err := f.inventoryService.CheckAvailability(ctx, item.ProductID, item.Quantity)
        if err != nil {
            return nil, fmt.Errorf("check inventory: %w", err)
        }
        if !available {
            return nil, fmt.Errorf("product %s is out of stock", item.ProductID)
        }
    }
    
    // 3. Calculate shipping cost
    shipping, err := f.shippingService.Calculate(ctx, cart.Items, cart.Address)
    if err != nil {
        return nil, fmt.Errorf("calculate shipping: %w", err)
    }
    
    // 4. Apply loyalty discount
    discount, err := f.loyaltyService.CalculateDiscount(ctx, userID, cart.Total)
    if err != nil {
        // Not critical, continue without discount
        discount = 0
    }
    
    total := cart.Total + shipping.Cost - discount
    
    // 5. Process payment
    payment, err := f.paymentService.Charge(ctx, userID, total)
    if err != nil {
        return nil, fmt.Errorf("payment failed: %w", err)
    }
    
    // 6. Reserve products
    for _, item := range cart.Items {
        if err := f.inventoryService.Reserve(ctx, item.ProductID, item.Quantity); err != nil {
            // Rollback payment
            f.paymentService.Refund(ctx, payment.ID)
            return nil, fmt.Errorf("reserve inventory: %w", err)
        }
    }
    
    // 7. Create order
    order := &Order{
        ID:          generateOrderID(),
        UserID:      userID,
        Items:       cart.Items,
        Total:       total,
        PaymentID:   payment.ID,
        ShippingID:  shipping.ID,
        Status:      StatusPending,
        CreatedAt:   time.Now(),
    }
    
    if err := f.orderRepo.Create(ctx, order); err != nil {
        // Rollback everything
        f.paymentService.Refund(ctx, payment.ID)
        for _, item := range cart.Items {
            f.inventoryService.Release(ctx, item.ProductID, item.Quantity)
        }
        return nil, fmt.Errorf("create order: %w", err)
    }
    
    // 8. Clear cart
    f.cartService.Clear(ctx, userID)
    
    // 9. Add loyalty points
    f.loyaltyService.AddPoints(ctx, userID, int(total*0.05))
    
    // 10. Send confirmation
    f.emailService.SendOrderConfirmation(ctx, order)
    
    return order, nil
}
```

This is complex business logic with many dependencies. Facade hides all this complexity:

```go
order, err := checkoutFacade.PlaceOrder(ctx, userID)
if err != nil {
    // Handle error
}
```

## Real Example 3: Reports and Analytics

Report generation requires data from different sources:

```go
type ReportFacade struct {
    salesDB      *sql.DB
    analyticsDB  *clickhouse.Client
    cache        *redis.Client
    s3           *s3.Client
    pdfGenerator PDFGenerator
}

func (f *ReportFacade) GenerateSalesReport(ctx context.Context, period Period) (*Report, error) {
    // Check cache
    cacheKey := fmt.Sprintf("report:%s:%s", period.Start, period.End)
    if cached, err := f.cache.Get(ctx, cacheKey).Bytes(); err == nil {
        return &Report{Data: cached}, nil
    }
    
    // 1. Fetch sales data from PostgreSQL
    sales, err := f.fetchSalesData(ctx, period)
    if err != nil {
        return nil, fmt.Errorf("fetch sales: %w", err)
    }
    
    // 2. Fetch analytics from ClickHouse
    analytics, err := f.fetchAnalytics(ctx, period)
    if err != nil {
        return nil, fmt.Errorf("fetch analytics: %w", err)
    }
    
    // 3. Merge data
    reportData := f.mergeData(sales, analytics)
    
    // 4. Generate PDF
    pdf, err := f.pdfGenerator.Generate(reportData)
    if err != nil {
        return nil, fmt.Errorf("generate pdf: %w", err)
    }
    
    // 5. Upload to S3
    filename := fmt.Sprintf("reports/%s.pdf", time.Now().Format("2006-01-02"))
    if err := f.uploadToS3(ctx, filename, pdf); err != nil {
        return nil, fmt.Errorf("upload to s3: %w", err)
    }
    
    // 6. Cache result
    f.cache.Set(ctx, cacheKey, pdf, 24*time.Hour)
    
    return &Report{
        Data:     pdf,
        Filename: filename,
        URL:      f.getS3URL(filename),
    }, nil
}

func (f *ReportFacade) fetchSalesData(ctx context.Context, period Period) ([]Sale, error) {
    rows, err := f.salesDB.QueryContext(ctx, 
        "SELECT * FROM sales WHERE created_at BETWEEN $1 AND $2",
        period.Start, period.End)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var sales []Sale
    for rows.Next() {
        var sale Sale
        if err := rows.Scan(&sale); err != nil {
            return nil, err
        }
        sales = append(sales, sale)
    }
    
    return sales, nil
}

func (f *ReportFacade) fetchAnalytics(ctx context.Context, period Period) (*Analytics, error) {
    query := `
        SELECT 
            count() as total_orders,
            sum(amount) as total_revenue,
            avg(amount) as avg_order_value
        FROM orders
        WHERE date BETWEEN ? AND ?
    `
    
    var analytics Analytics
    err := f.analyticsDB.QueryRow(ctx, query, period.Start, period.End).Scan(
        &analytics.TotalOrders,
        &analytics.TotalRevenue,
        &analytics.AvgOrderValue,
    )
    
    return &analytics, err
}
```

Client gets ready report with one call:

```go
report, err := reportFacade.GenerateSalesReport(ctx, Period{
    Start: time.Now().AddDate(0, -1, 0),
    End:   time.Now(),
})
```

## Real Example 4: Application Deployment

Deployment isn't just uploading a file to server. It's a whole process:

```go
type DeploymentFacade struct {
    git        GitClient
    docker     DockerClient
    kubernetes K8sClient
    registry   ContainerRegistry
    slack      SlackNotifier
    monitoring MonitoringService
}

func (f *DeploymentFacade) Deploy(ctx context.Context, config DeployConfig) error {
    f.slack.Notify("🚀 Starting deployment of " + config.Service)
    
    // 1. Clone repository
    repo, err := f.git.Clone(config.Repository, config.Branch)
    if err != nil {
        f.slack.Notify("❌ Failed to clone repository: " + err.Error())
        return fmt.Errorf("clone repo: %w", err)
    }
    
    // 2. Build Docker image
    image := fmt.Sprintf("%s:%s", config.Service, config.Version)
    if err := f.docker.Build(repo.Path, image); err != nil {
        f.slack.Notify("❌ Failed to build image: " + err.Error())
        return fmt.Errorf("build image: %w", err)
    }
    
    // 3. Run tests
    if err := f.docker.RunTests(image); err != nil {
        f.slack.Notify("❌ Tests failed: " + err.Error())
        return fmt.Errorf("tests failed: %w", err)
    }
    
    // 4. Push to registry
    if err := f.registry.Push(image); err != nil {
        f.slack.Notify("❌ Failed to push image: " + err.Error())
        return fmt.Errorf("push image: %w", err)
    }
    
    // 5. Update Kubernetes deployment
    if err := f.kubernetes.UpdateDeployment(config.Service, image); err != nil {
        f.slack.Notify("❌ Failed to update deployment: " + err.Error())
        return fmt.Errorf("update deployment: %w", err)
    }
    
    // 6. Wait for rollout
    if err := f.kubernetes.WaitForRollout(config.Service, 5*time.Minute); err != nil {
        f.slack.Notify("❌ Rollout failed: " + err.Error())
        // Rollback
        f.kubernetes.Rollback(config.Service)
        return fmt.Errorf("rollout failed: %w", err)
    }
    
    // 7. Check health
    if err := f.monitoring.CheckHealth(config.Service); err != nil {
        f.slack.Notify("⚠️ Health check failed: " + err.Error())
        f.kubernetes.Rollback(config.Service)
        return fmt.Errorf("health check failed: %w", err)
    }
    
    // 8. Update monitoring
    f.monitoring.RecordDeployment(config.Service, config.Version)
    
    f.slack.Notify("✅ Successfully deployed " + config.Service + " version " + config.Version)
    
    return nil
}
```

One method instead of eight steps:

```go
err := deploymentFacade.Deploy(ctx, DeployConfig{
    Service:    "api-service",
    Repository: "github.com/company/api",
    Branch:     "main",
    Version:    "v1.2.3",
})
```

## Real Example 5: Video Processing

Video processing includes many operations:

```go
type VideoProcessingFacade struct {
    storage      Storage
    transcoder   Transcoder
    thumbnail    ThumbnailGenerator
    cdn          CDN
    db           Database
    queue        Queue
}

func (f *VideoProcessingFacade) ProcessVideo(ctx context.Context, videoID string) error {
    // 1. Download original
    original, err := f.storage.Download(ctx, videoID)
    if err != nil {
        return fmt.Errorf("download video: %w", err)
    }
    
    // 2. Transcode to different qualities
    qualities := []string{"1080p", "720p", "480p", "360p"}
    var transcoded []TranscodedVideo
    
    for _, quality := range qualities {
        video, err := f.transcoder.Transcode(original, quality)
        if err != nil {
            return fmt.Errorf("transcode to %s: %w", quality, err)
        }
        transcoded = append(transcoded, video)
    }
    
    // 3. Generate thumbnail
    thumbnail, err := f.thumbnail.Generate(original, 5*time.Second)
    if err != nil {
        return fmt.Errorf("generate thumbnail: %w", err)
    }
    
    // 4. Upload to CDN
    var urls []string
    for _, video := range transcoded {
        url, err := f.cdn.Upload(video)
        if err != nil {
            return fmt.Errorf("upload to cdn: %w", err)
        }
        urls = append(urls, url)
    }
    
    thumbnailURL, _ := f.cdn.Upload(thumbnail)
    
    // 5. Update database
    if err := f.db.UpdateVideo(ctx, videoID, VideoMetadata{
        URLs:         urls,
        ThumbnailURL: thumbnailURL,
        Status:       "ready",
        Duration:     original.Duration,
    }); err != nil {
        return fmt.Errorf("update db: %w", err)
    }
    
    // 6. Send notification
    f.queue.Send("video.processed", map[string]interface{}{
        "video_id": videoID,
        "urls":     urls,
    })
    
    return nil
}
```

## When to Use Facade

1. **Complex subsystem** - when system consists of many components
2. **Frequent use** - when the same sequence of operations repeats
3. **API simplification** - when you need to provide simple interface for complex logic
4. **Change isolation** - when you need to protect clients from subsystem changes
5. **Orchestration** - when you need to coordinate multiple services

## When NOT to Use Facade

1. **Simple operation** - if operation consists of one or two calls
2. **Different logic** - if clients use different combinations of methods
3. **Need flexibility** - if clients need access to implementation details

## Facade vs Adapter

Adapter transforms one interface to another. Facade simplifies complex interface.

```go
// Adapter: transformation
type LoggerAdapter struct {
    logger *ZapLogger
}

func (a *LoggerAdapter) Log(msg string) {
    a.logger.Info(msg)
}

// Facade: simplification
type ApplicationFacade struct {
    db     *sql.DB
    cache  *redis.Client
    logger *zap.Logger
}

func (f *ApplicationFacade) SaveUser(user *User) error {
    // Coordinates multiple subsystems
}
```

## Performance

Facade doesn't add significant overhead. It's just an additional function call:

```go
func BenchmarkWithFacade(b *testing.B) {
    facade := NewUserFacade(db, cache, logger)
    for i := 0; i < b.N; i++ {
        facade.CreateUser(ctx, user)
    }
}

func BenchmarkWithoutFacade(b *testing.B) {
    for i := 0; i < b.N; i++ {
        db.Insert(ctx, user)
        cache.Set(ctx, user.ID, user)
        logger.Info("User created")
    }
}
```

Difference is minimal, but code with facade is much cleaner.

## Conclusion

Facade Pattern in Go:

- Simplifies working with complex subsystems
- Hides implementation details
- Coordinates multiple services
- Makes code more readable and maintainable
- Isolates clients from subsystem changes

Facade isn't about adding layers. It's about simplification. If client needs to call five methods to perform one operation - create a facade.

In modern applications, facades are everywhere: user registration, order checkout, report generation, deployment, media processing. They make complex operations simple.
