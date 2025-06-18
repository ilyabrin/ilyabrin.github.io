---
title: "Facade Pattern в Go: упрощение взаимодействия с подсистемами"
date: 2025-06-18T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "facade"]
categories: ["Patterns"]
---

Facade Pattern - это упрощённый интерфейс к сложной системе. Вместо того чтобы разбираться в десятках классов и методов, клиент работает с одним простым фасадом, который скрывает всю сложность внутри.

Это как консьерж в отеле: вы не звоните в прачечную, ресторан и службу уборки отдельно. Вы говорите консьержу, что вам нужно, и он координирует всё за вас.

<!--more-->

## Проблема: сложность взаимодействия

Современные приложения состоят из множества подсистем. Чтобы выполнить одну бизнес-операцию, нужно:

- Проверить данные в базе
- Обновить кэш
- Отправить событие в очередь
- Записать лог
- Обновить метрики
- Отправить уведомление

Каждая подсистема имеет свой API. Клиентский код превращается в спагетти из вызовов разных сервисов.

## Решение: единый фасад

Фасад предоставляет один метод, который координирует работу всех подсистем:

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
    // Фасад координирует все подсистемы
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

Клиент вызывает один метод вместо шести.

## Реальный пример 1: регистрация пользователя

В реальном приложении регистрация пользователя - это не просто INSERT в базу. Это целый процесс:

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
    // 1. Валидация
    if err := f.validateRequest(req); err != nil {
        return nil, fmt.Errorf("validation failed: %w", err)
    }
    
    // 2. Проверка существования
    exists, err := f.userRepo.ExistsByEmail(ctx, req.Email)
    if err != nil {
        return nil, fmt.Errorf("check existence: %w", err)
    }
    if exists {
        return nil, errors.New("user already exists")
    }
    
    // 3. Создание пользователя
    user := &User{
        ID:       generateID(),
        Email:    req.Email,
        Password: hashPassword(req.Password),
        Status:   StatusPending,
    }
    
    if err := f.userRepo.Create(ctx, user); err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    
    // 4. Отправка подтверждения
    token := generateVerificationToken()
    if err := f.emailService.SendVerification(user.Email, token); err != nil {
        f.logger.Error("Failed to send verification", "error", err)
        // Не возвращаем ошибку, пользователь создан
    }
    
    // 5. SMS с кодом
    if req.Phone != "" {
        code := generateSMSCode()
        f.smsService.SendCode(req.Phone, code)
    }
    
    // 6. Аналитика
    f.analytics.Track("user_registered", map[string]interface{}{
        "user_id": user.ID,
        "source":  req.Source,
    })
    
    // 7. Кэширование
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

Без фасада клиент должен был бы вызывать все эти методы самостоятельно. С фасадом - один вызов:

```go
user, err := registrationFacade.RegisterUser(ctx, RegisterRequest{
    Email:    "user@example.com",
    Password: "secret123",
    Phone:    "+1234567890",
    Source:   "web",
})
```

## Реальный пример 2: оформление заказа

Оформление заказа в e-commerce - это сложный процесс с множеством шагов:

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
    // 1. Получить корзину
    cart, err := f.cartService.GetCart(ctx, userID)
    if err != nil {
        return nil, fmt.Errorf("get cart: %w", err)
    }
    
    if len(cart.Items) == 0 {
        return nil, errors.New("cart is empty")
    }
    
    // 2. Проверить наличие товаров
    for _, item := range cart.Items {
        available, err := f.inventoryService.CheckAvailability(ctx, item.ProductID, item.Quantity)
        if err != nil {
            return nil, fmt.Errorf("check inventory: %w", err)
        }
        if !available {
            return nil, fmt.Errorf("product %s is out of stock", item.ProductID)
        }
    }
    
    // 3. Рассчитать стоимость доставки
    shipping, err := f.shippingService.Calculate(ctx, cart.Items, cart.Address)
    if err != nil {
        return nil, fmt.Errorf("calculate shipping: %w", err)
    }
    
    // 4. Применить бонусы лояльности
    discount, err := f.loyaltyService.CalculateDiscount(ctx, userID, cart.Total)
    if err != nil {
        // Не критично, продолжаем без скидки
        discount = 0
    }
    
    total := cart.Total + shipping.Cost - discount
    
    // 5. Провести оплату
    payment, err := f.paymentService.Charge(ctx, userID, total)
    if err != nil {
        return nil, fmt.Errorf("payment failed: %w", err)
    }
    
    // 6. Зарезервировать товары
    for _, item := range cart.Items {
        if err := f.inventoryService.Reserve(ctx, item.ProductID, item.Quantity); err != nil {
            // Откатить платёж
            f.paymentService.Refund(ctx, payment.ID)
            return nil, fmt.Errorf("reserve inventory: %w", err)
        }
    }
    
    // 7. Создать заказ
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
        // Откатить всё
        f.paymentService.Refund(ctx, payment.ID)
        for _, item := range cart.Items {
            f.inventoryService.Release(ctx, item.ProductID, item.Quantity)
        }
        return nil, fmt.Errorf("create order: %w", err)
    }
    
    // 8. Очистить корзину
    f.cartService.Clear(ctx, userID)
    
    // 9. Начислить бонусы
    f.loyaltyService.AddPoints(ctx, userID, int(total*0.05))
    
    // 10. Отправить подтверждение
    f.emailService.SendOrderConfirmation(ctx, order)
    
    return order, nil
}
```

Это сложная бизнес-логика с множеством зависимостей. Фасад скрывает всю эту сложность:

```go
order, err := checkoutFacade.PlaceOrder(ctx, userID)
if err != nil {
    // Обработка ошибки
}
```

## Реальный пример 3: отчёты и аналитика

Генерация отчёта требует данных из разных источников:

```go
type ReportFacade struct {
    salesDB      *sql.DB
    analyticsDB  *clickhouse.Client
    cache        *redis.Client
    s3           *s3.Client
    pdfGenerator PDFGenerator
}

func (f *ReportFacade) GenerateSalesReport(ctx context.Context, period Period) (*Report, error) {
    // Проверить кэш
    cacheKey := fmt.Sprintf("report:%s:%s", period.Start, period.End)
    if cached, err := f.cache.Get(ctx, cacheKey).Bytes(); err == nil {
        return &Report{Data: cached}, nil
    }
    
    // 1. Получить данные о продажах из PostgreSQL
    sales, err := f.fetchSalesData(ctx, period)
    if err != nil {
        return nil, fmt.Errorf("fetch sales: %w", err)
    }
    
    // 2. Получить аналитику из ClickHouse
    analytics, err := f.fetchAnalytics(ctx, period)
    if err != nil {
        return nil, fmt.Errorf("fetch analytics: %w", err)
    }
    
    // 3. Объединить данные
    reportData := f.mergeData(sales, analytics)
    
    // 4. Сгенерировать PDF
    pdf, err := f.pdfGenerator.Generate(reportData)
    if err != nil {
        return nil, fmt.Errorf("generate pdf: %w", err)
    }
    
    // 5. Загрузить в S3
    filename := fmt.Sprintf("reports/%s.pdf", time.Now().Format("2006-01-02"))
    if err := f.uploadToS3(ctx, filename, pdf); err != nil {
        return nil, fmt.Errorf("upload to s3: %w", err)
    }
    
    // 6. Закэшировать результат
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

Клиент получает готовый отчёт одним вызовом:

```go
report, err := reportFacade.GenerateSalesReport(ctx, Period{
    Start: time.Now().AddDate(0, -1, 0),
    End:   time.Now(),
})
```

## Реальный пример 4: деплой приложения

Деплой - это не просто загрузка файла на сервер. Это целый процесс:

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
    
    // 1. Клонировать репозиторий
    repo, err := f.git.Clone(config.Repository, config.Branch)
    if err != nil {
        f.slack.Notify("❌ Failed to clone repository: " + err.Error())
        return fmt.Errorf("clone repo: %w", err)
    }
    
    // 2. Собрать Docker образ
    image := fmt.Sprintf("%s:%s", config.Service, config.Version)
    if err := f.docker.Build(repo.Path, image); err != nil {
        f.slack.Notify("❌ Failed to build image: " + err.Error())
        return fmt.Errorf("build image: %w", err)
    }
    
    // 3. Запустить тесты
    if err := f.docker.RunTests(image); err != nil {
        f.slack.Notify("❌ Tests failed: " + err.Error())
        return fmt.Errorf("tests failed: %w", err)
    }
    
    // 4. Загрузить в registry
    if err := f.registry.Push(image); err != nil {
        f.slack.Notify("❌ Failed to push image: " + err.Error())
        return fmt.Errorf("push image: %w", err)
    }
    
    // 5. Обновить Kubernetes deployment
    if err := f.kubernetes.UpdateDeployment(config.Service, image); err != nil {
        f.slack.Notify("❌ Failed to update deployment: " + err.Error())
        return fmt.Errorf("update deployment: %w", err)
    }
    
    // 6. Дождаться готовности
    if err := f.kubernetes.WaitForRollout(config.Service, 5*time.Minute); err != nil {
        f.slack.Notify("❌ Rollout failed: " + err.Error())
        // Откатить
        f.kubernetes.Rollback(config.Service)
        return fmt.Errorf("rollout failed: %w", err)
    }
    
    // 7. Проверить health check
    if err := f.monitoring.CheckHealth(config.Service); err != nil {
        f.slack.Notify("⚠️ Health check failed: " + err.Error())
        f.kubernetes.Rollback(config.Service)
        return fmt.Errorf("health check failed: %w", err)
    }
    
    // 8. Обновить мониторинг
    f.monitoring.RecordDeployment(config.Service, config.Version)
    
    f.slack.Notify("✅ Successfully deployed " + config.Service + " version " + config.Version)
    
    return nil
}
```

Один метод вместо восьми шагов:

```go
err := deploymentFacade.Deploy(ctx, DeployConfig{
    Service:    "api-service",
    Repository: "github.com/company/api",
    Branch:     "main",
    Version:    "v1.2.3",
})
```

## Реальный пример 5: обработка видео

Обработка видео включает множество операций:

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
    // 1. Скачать оригинал
    original, err := f.storage.Download(ctx, videoID)
    if err != nil {
        return fmt.Errorf("download video: %w", err)
    }
    
    // 2. Транскодировать в разные качества
    qualities := []string{"1080p", "720p", "480p", "360p"}
    var transcoded []TranscodedVideo
    
    for _, quality := range qualities {
        video, err := f.transcoder.Transcode(original, quality)
        if err != nil {
            return fmt.Errorf("transcode to %s: %w", quality, err)
        }
        transcoded = append(transcoded, video)
    }
    
    // 3. Сгенерировать превью
    thumbnail, err := f.thumbnail.Generate(original, 5*time.Second)
    if err != nil {
        return fmt.Errorf("generate thumbnail: %w", err)
    }
    
    // 4. Загрузить в CDN
    var urls []string
    for _, video := range transcoded {
        url, err := f.cdn.Upload(video)
        if err != nil {
            return fmt.Errorf("upload to cdn: %w", err)
        }
        urls = append(urls, url)
    }
    
    thumbnailURL, _ := f.cdn.Upload(thumbnail)
    
    // 5. Обновить базу данных
    if err := f.db.UpdateVideo(ctx, videoID, VideoMetadata{
        URLs:         urls,
        ThumbnailURL: thumbnailURL,
        Status:       "ready",
        Duration:     original.Duration,
    }); err != nil {
        return fmt.Errorf("update db: %w", err)
    }
    
    // 6. Отправить уведомление
    f.queue.Send("video.processed", map[string]interface{}{
        "video_id": videoID,
        "urls":     urls,
    })
    
    return nil
}
```

## Когда использовать Facade

1. **Сложная подсистема** - когда система состоит из множества компонентов
2. **Частое использование** - когда одна и та же последовательность операций повторяется
3. **Упрощение API** - когда нужно предоставить простой интерфейс для сложной логики
4. **Изоляция изменений** - когда нужно защитить клиентов от изменений в подсистемах
5. **Оркестрация** - когда нужно координировать работу нескольких сервисов

## Когда НЕ использовать Facade

1. **Простая операция** - если операция состоит из одного-двух вызовов
2. **Разная логика** - если клиенты используют разные комбинации методов
3. **Нужна гибкость** - если клиентам нужен доступ к деталям реализации

## Facade vs Adapter

Adapter преобразует один интерфейс в другой. Facade упрощает сложный интерфейс.

```go
// Adapter: преобразование
type LoggerAdapter struct {
    logger *ZapLogger
}

func (a *LoggerAdapter) Log(msg string) {
    a.logger.Info(msg)
}

// Facade: упрощение
type ApplicationFacade struct {
    db     *sql.DB
    cache  *redis.Client
    logger *zap.Logger
}

func (f *ApplicationFacade) SaveUser(user *User) error {
    // Координирует несколько подсистем
}
```

## Производительность

Фасад не добавляет значительного overhead. Это просто дополнительный вызов функции:

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

Разница минимальна, но код с фасадом гораздо чище.

## Заключение

Facade Pattern в Go:

- Упрощает работу со сложными подсистемами
- Скрывает детали реализации
- Координирует работу нескольких сервисов
- Делает код более читаемым и поддерживаемым
- Изолирует клиентов от изменений в подсистемах

Фасад - это не про добавление слоёв. Это про упрощение. Если клиенту нужно вызывать пять методов для выполнения одной операции - создайте фасад.

В современных приложениях фасады везде: регистрация пользователей, оформление заказов, генерация отчётов, деплой, обработка медиа. Они делают сложные операции простыми.
