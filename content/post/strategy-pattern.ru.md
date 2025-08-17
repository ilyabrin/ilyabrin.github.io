---
title: "Strategy Pattern в Go: выбор алгоритма во время выполнения"
date: 2025-08-17T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "strategy"]
categories: ["Patterns"]
---

Strategy Pattern - это способ выбирать алгоритм во время выполнения программы. Вместо жёстко зашитой логики вы получаете гибкость: один и тот же код работает с разными алгоритмами, которые можно менять на лету.

Представьте навигатор: вы можете выбрать маршрут - быстрый, короткий или живописный. Навигатор не меняется, меняется только стратегия построения маршрута.

<!--more-->

## Проблема: жёсткая логика

Типичный код без паттерна Strategy выглядит как набор if-else или switch:

```go
func CalculateShipping(order Order, method string) float64 {
    if method == "standard" {
        return order.Weight * 5.0
    } else if method == "express" {
        return order.Weight * 10.0 + 20.0
    } else if method == "overnight" {
        return order.Weight * 15.0 + 50.0
    }
    return 0
}
```

Проблемы такого подхода:

1. **Сложно добавить новый метод** - нужно менять функцию
2. **Сложно тестировать** - все алгоритмы в одном месте
3. **Нарушение Open/Closed** - функция открыта для модификации
4. **Дублирование кода** - похожая логика в разных местах

## Решение: Strategy Pattern

Strategy Pattern выносит каждый алгоритм в отдельный объект. Клиент работает с интерфейсом, не зная о конкретной реализации.

```go
type ShippingStrategy interface {
    Calculate(order Order) float64
}

type StandardShipping struct{}

func (s *StandardShipping) Calculate(order Order) float64 {
    return order.Weight * 5.0
}

type ExpressShipping struct{}

func (e *ExpressShipping) Calculate(order Order) float64 {
    return order.Weight * 10.0 + 20.0
}

type OvernightShipping struct{}

func (o *OvernightShipping) Calculate(order Order) float64 {
    return order.Weight * 15.0 + 50.0
}
```

Использование:

```go
func ProcessOrder(order Order, strategy ShippingStrategy) {
    cost := strategy.Calculate(order)
    fmt.Printf("Shipping cost: $%.2f\n", cost)
}

// Выбор стратегии
var strategy ShippingStrategy
if urgent {
    strategy = &OvernightShipping{}
} else {
    strategy = &StandardShipping{}
}

ProcessOrder(order, strategy)
```

## Реальный пример 1: Платёжные системы

В e-commerce приложении пользователь может платить разными способами: карта, PayPal, криптовалюта, банковский перевод. Каждый способ - это стратегия.

```go
type PaymentStrategy interface {
    Pay(amount float64) error
    Refund(transactionID string, amount float64) error
}

type CreditCardPayment struct {
    CardNumber string
    CVV        string
}

func (c *CreditCardPayment) Pay(amount float64) error {
    // Валидация карты
    if !c.validateCard() {
        return errors.New("invalid card")
    }
    
    // Обработка через платёжный шлюз
    return processCardPayment(c.CardNumber, amount)
}

func (c *CreditCardPayment) Refund(transactionID string, amount float64) error {
    return refundCardPayment(transactionID, amount)
}

type PayPalPayment struct {
    Email string
    Token string
}

func (p *PayPalPayment) Pay(amount float64) error {
    // OAuth авторизация
    if !p.authorize() {
        return errors.New("paypal authorization failed")
    }
    
    // API вызов PayPal
    return processPayPalPayment(p.Email, p.Token, amount)
}

func (p *PayPalPayment) Refund(transactionID string, amount float64) error {
    return refundPayPalPayment(transactionID, amount)
}

type CryptoPayment struct {
    WalletAddress string
    Currency      string // BTC, ETH, etc
}

func (c *CryptoPayment) Pay(amount float64) error {
    // Конвертация в криптовалюту
    cryptoAmount := convertToCrypto(amount, c.Currency)
    
    // Создание транзакции в блокчейне
    return processCryptoPayment(c.WalletAddress, cryptoAmount, c.Currency)
}

func (c *CryptoPayment) Refund(transactionID string, amount float64) error {
    // Криптовалютные транзакции необратимы
    return errors.New("crypto payments cannot be refunded")
}
```

Использование в checkout процессе:

```go
type CheckoutService struct {
    paymentStrategy PaymentStrategy
}

func (s *CheckoutService) SetPaymentMethod(strategy PaymentStrategy) {
    s.paymentStrategy = strategy
}

func (s *CheckoutService) ProcessPayment(amount float64) error {
    if s.paymentStrategy == nil {
        return errors.New("payment method not selected")
    }
    
    return s.paymentStrategy.Pay(amount)
}

// В контроллере
func HandleCheckout(w http.ResponseWriter, r *http.Request) {
    checkout := &CheckoutService{}
    
    paymentMethod := r.FormValue("payment_method")
    
    switch paymentMethod {
    case "card":
        checkout.SetPaymentMethod(&CreditCardPayment{
            CardNumber: r.FormValue("card_number"),
            CVV:        r.FormValue("cvv"),
        })
    case "paypal":
        checkout.SetPaymentMethod(&PayPalPayment{
            Email: r.FormValue("email"),
            Token: r.FormValue("token"),
        })
    case "crypto":
        checkout.SetPaymentMethod(&CryptoPayment{
            WalletAddress: r.FormValue("wallet"),
            Currency:      r.FormValue("currency"),
        })
    }
    
    err := checkout.ProcessPayment(getOrderTotal())
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    w.Write([]byte("Payment successful"))
}
```

**Преимущества этого подхода:**

- Легко добавить новый способ оплаты (Apple Pay, Google Pay)
- Каждая стратегия тестируется отдельно
- Можно менять способ оплаты без перезапуска приложения
- Изоляция логики каждого провайдера

## Реальный пример 2: Сжатие данных

В системе хранения файлов нужно сжимать данные. Разные типы файлов требуют разных алгоритмов сжатия.

```go
type CompressionStrategy interface {
    Compress(data []byte) ([]byte, error)
    Decompress(data []byte) ([]byte, error)
    Extension() string
}

type GzipCompression struct {
    Level int // 1-9
}

func (g *GzipCompression) Compress(data []byte) ([]byte, error) {
    var buf bytes.Buffer
    writer, _ := gzip.NewWriterLevel(&buf, g.Level)
    writer.Write(data)
    writer.Close()
    return buf.Bytes(), nil
}

func (g *GzipCompression) Decompress(data []byte) ([]byte, error) {
    reader, err := gzip.NewReader(bytes.NewReader(data))
    if err != nil {
        return nil, err
    }
    defer reader.Close()
    return io.ReadAll(reader)
}

func (g *GzipCompression) Extension() string {
    return ".gz"
}

type ZstdCompression struct {
    Level int
}

func (z *ZstdCompression) Compress(data []byte) ([]byte, error) {
    encoder, _ := zstd.NewWriter(nil, zstd.WithEncoderLevel(zstd.EncoderLevel(z.Level)))
    return encoder.EncodeAll(data, nil), nil
}

func (z *ZstdCompression) Decompress(data []byte) ([]byte, error) {
    decoder, _ := zstd.NewReader(nil)
    return decoder.DecodeAll(data, nil)
}

func (z *ZstdCompression) Extension() string {
    return ".zst"
}

type LZ4Compression struct{}

func (l *LZ4Compression) Compress(data []byte) ([]byte, error) {
    buf := make([]byte, lz4.CompressBlockBound(len(data)))
    n, err := lz4.CompressBlock(data, buf, nil)
    return buf[:n], err
}

func (l *LZ4Compression) Decompress(data []byte) ([]byte, error) {
    buf := make([]byte, len(data)*10) // Предполагаемый размер
    n, err := lz4.UncompressBlock(data, buf)
    return buf[:n], err
}

func (l *LZ4Compression) Extension() string {
    return ".lz4"
}
```

Выбор стратегии на основе типа файла:

```go
type FileStorage struct {
    compression CompressionStrategy
}

func (f *FileStorage) SelectCompression(filename string) {
    ext := filepath.Ext(filename)
    
    switch ext {
    case ".txt", ".log", ".json":
        // Текстовые файлы хорошо сжимаются gzip
        f.compression = &GzipCompression{Level: 6}
    case ".jpg", ".png", ".mp4":
        // Медиа уже сжаты, используем быстрый LZ4
        f.compression = &LZ4Compression{}
    default:
        // Для остального используем zstd - баланс скорости и сжатия
        f.compression = &ZstdCompression{Level: 3}
    }
}

func (f *FileStorage) SaveFile(filename string, data []byte) error {
    f.SelectCompression(filename)
    
    compressed, err := f.compression.Compress(data)
    if err != nil {
        return err
    }
    
    outputFile := filename + f.compression.Extension()
    return os.WriteFile(outputFile, compressed, 0644)
}

func (f *FileStorage) LoadFile(filename string) ([]byte, error) {
    f.SelectCompression(filename)
    
    compressed, err := os.ReadFile(filename + f.compression.Extension())
    if err != nil {
        return nil, err
    }
    
    return f.compression.Decompress(compressed)
}
```

**Почему это полезно:**

- Оптимальное сжатие для каждого типа файлов
- Легко добавить новый алгоритм (Brotli, Snappy)
- Можно A/B тестировать алгоритмы
- Разные уровни сжатия для разных сценариев

## Реальный пример 3: Валидация данных

В API нужно валидировать входящие данные. Разные эндпоинты требуют разных правил валидации.

```go
type ValidationStrategy interface {
    Validate(data interface{}) error
}

type EmailValidation struct{}

func (e *EmailValidation) Validate(data interface{}) error {
    email, ok := data.(string)
    if !ok {
        return errors.New("email must be string")
    }
    
    if !strings.Contains(email, "@") {
        return errors.New("invalid email format")
    }
    
    if len(email) > 255 {
        return errors.New("email too long")
    }
    
    return nil
}

type PasswordValidation struct {
    MinLength      int
    RequireUpper   bool
    RequireNumber  bool
    RequireSpecial bool
}

func (p *PasswordValidation) Validate(data interface{}) error {
    password, ok := data.(string)
    if !ok {
        return errors.New("password must be string")
    }
    
    if len(password) < p.MinLength {
        return fmt.Errorf("password must be at least %d characters", p.MinLength)
    }
    
    if p.RequireUpper && !containsUpper(password) {
        return errors.New("password must contain uppercase letter")
    }
    
    if p.RequireNumber && !containsNumber(password) {
        return errors.New("password must contain number")
    }
    
    if p.RequireSpecial && !containsSpecial(password) {
        return errors.New("password must contain special character")
    }
    
    return nil
}

type PhoneValidation struct {
    Country string
}

func (p *PhoneValidation) Validate(data interface{}) error {
    phone, ok := data.(string)
    if !ok {
        return errors.New("phone must be string")
    }
    
    // Разные форматы для разных стран
    switch p.Country {
    case "US":
        return validateUSPhone(phone)
    case "RU":
        return validateRUPhone(phone)
    default:
        return validateInternationalPhone(phone)
    }
}
```

Композиция валидаторов:

```go
type Validator struct {
    strategies map[string]ValidationStrategy
}

func NewValidator() *Validator {
    return &Validator{
        strategies: make(map[string]ValidationStrategy),
    }
}

func (v *Validator) AddRule(field string, strategy ValidationStrategy) {
    v.strategies[field] = strategy
}

func (v *Validator) Validate(data map[string]interface{}) map[string]error {
    errors := make(map[string]error)
    
    for field, strategy := range v.strategies {
        if value, ok := data[field]; ok {
            if err := strategy.Validate(value); err != nil {
                errors[field] = err
            }
        }
    }
    
    return errors
}

// Использование
func HandleRegistration(w http.ResponseWriter, r *http.Request) {
    validator := NewValidator()
    
    validator.AddRule("email", &EmailValidation{})
    validator.AddRule("password", &PasswordValidation{
        MinLength:      8,
        RequireUpper:   true,
        RequireNumber:  true,
        RequireSpecial: true,
    })
    validator.AddRule("phone", &PhoneValidation{Country: "US"})
    
    data := map[string]interface{}{
        "email":    r.FormValue("email"),
        "password": r.FormValue("password"),
        "phone":    r.FormValue("phone"),
    }
    
    errors := validator.Validate(data)
    if len(errors) > 0 {
        json.NewEncoder(w).Encode(errors)
        return
    }
    
    // Регистрация пользователя
}
```

## Реальный пример 4: Ценообразование

В SaaS приложении разные стратегии ценообразования для разных типов клиентов.

```go
type PricingStrategy interface {
    CalculatePrice(usage Usage) float64
    GetDiscount(customer Customer) float64
}

type StartupPricing struct{}

func (s *StartupPricing) CalculatePrice(usage Usage) float64 {
    // Фиксированная цена до определённого лимита
    if usage.APIRequests < 10000 {
        return 29.0
    }
    // Потом за каждую 1000 запросов
    extra := (usage.APIRequests - 10000) / 1000
    return 29.0 + float64(extra)*0.5
}

func (s *StartupPricing) GetDiscount(customer Customer) float64 {
    // Скидка для годовой подписки
    if customer.BillingPeriod == "yearly" {
        return 0.20 // 20%
    }
    return 0
}

type EnterprisePricing struct{}

func (e *EnterprisePricing) CalculatePrice(usage Usage) float64 {
    // Базовая цена
    base := 999.0
    
    // Цена за пользователя
    base += float64(usage.Users) * 10.0
    
    // Цена за хранилище (за GB)
    base += float64(usage.StorageGB) * 0.1
    
    // Цена за API запросы (за 1000)
    base += float64(usage.APIRequests/1000) * 0.05
    
    return base
}

func (e *EnterprisePricing) GetDiscount(customer Customer) float64 {
    discount := 0.0
    
    // Скидка за объём
    if customer.Users > 100 {
        discount += 0.15
    }
    
    // Скидка за длительность контракта
    if customer.ContractYears >= 3 {
        discount += 0.10
    }
    
    return discount
}

type PayAsYouGoPricing struct{}

func (p *PayAsYouGoPricing) CalculatePrice(usage Usage) float64 {
    price := 0.0
    
    // Только за то, что использовали
    price += float64(usage.APIRequests) * 0.001
    price += float64(usage.StorageGB) * 0.15
    price += float64(usage.ComputeHours) * 0.50
    
    return price
}

func (p *PayAsYouGoPricing) GetDiscount(customer Customer) float64 {
    // Нет скидок для pay-as-you-go
    return 0
}
```

Использование:

```go
type BillingService struct {
    pricing PricingStrategy
}

func (b *BillingService) GenerateInvoice(customer Customer, usage Usage) Invoice {
    basePrice := b.pricing.CalculatePrice(usage)
    discount := b.pricing.GetDiscount(customer)
    
    finalPrice := basePrice * (1 - discount)
    
    return Invoice{
        CustomerID: customer.ID,
        BasePrice:  basePrice,
        Discount:   discount,
        FinalPrice: finalPrice,
        Period:     time.Now().Format("2006-01"),
    }
}

// Выбор стратегии на основе плана
func GetPricingStrategy(plan string) PricingStrategy {
    switch plan {
    case "startup":
        return &StartupPricing{}
    case "enterprise":
        return &EnterprisePricing{}
    case "payg":
        return &PayAsYouGoPricing{}
    default:
        return &StartupPricing{}
    }
}
```

## Когда использовать Strategy Pattern

1. **Несколько алгоритмов для одной задачи** - сортировка, поиск, валидация
2. **Выбор зависит от условий** - тип пользователя, конфигурация, время
3. **Алгоритмы часто меняются** - бизнес-правила, тарифы, акции
4. **Нужна изоляция** - каждый алгоритм независим и тестируется отдельно
5. **Избежать if-else каскадов** - когда условная логика разрастается

## Преимущества

- **Open/Closed Principle** - открыт для расширения, закрыт для модификации
- **Single Responsibility** - каждая стратегия делает одно дело
- **Тестируемость** - стратегии тестируются изолированно
- **Гибкость** - можно менять алгоритм во время выполнения
- **Читаемость** - код проще понять и поддерживать

## Недостатки

- **Больше классов** - каждая стратегия - отдельный тип
- **Клиент должен знать о стратегиях** - нужно выбирать правильную
- **Overhead** - дополнительный уровень абстракции

## Strategy vs State Pattern

Strategy выбирает алгоритм. State управляет поведением на основе состояния.

**Strategy:**

```go
// Выбираем способ оплаты
payment := &CreditCardPayment{}
payment.Pay(100)
```

**State:**

```go
// Заказ меняет поведение в зависимости от состояния
order.Ship() // Разное поведение для New, Paid, Shipped
```

## Заключение

Strategy Pattern в Go:

- Инкапсулирует алгоритмы в отдельные типы
- Позволяет выбирать алгоритм во время выполнения
- Делает код гибким и расширяемым
- Упрощает тестирование
- Избавляет от if-else каскадов

Используйте Strategy когда у вас есть семейство алгоритмов, которые можно взаимозаменять. Это делает код чище, проще и надёжнее.

В реальных приложениях Strategy везде: платежи, сжатие, валидация, ценообразование, маршрутизация. Это один из самых практичных паттернов.
