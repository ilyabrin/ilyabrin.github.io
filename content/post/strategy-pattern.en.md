---
title: "Strategy Pattern in Go: Choosing Algorithm at Runtime"
date: 2025-07-08T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "patterns", "design-patterns", "strategy"]
categories: ["Patterns"]
---

Strategy Pattern is a way to choose an algorithm at runtime. Instead of hardcoded logic, you get flexibility: the same code works with different algorithms that can be changed on the fly.

Imagine a navigator: you can choose a route - fast, short, or scenic. The navigator doesn't change, only the route-building strategy changes.

<!--more-->

## Problem: Rigid Logic

Typical code without Strategy pattern looks like a set of if-else or switch statements:

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

Problems with this approach:

1. **Hard to add new method** - need to modify function
2. **Hard to test** - all algorithms in one place
3. **Violates Open/Closed** - function is open for modification
4. **Code duplication** - similar logic in different places

## Solution: Strategy Pattern

Strategy Pattern extracts each algorithm into a separate object. Client works with interface, not knowing about concrete implementation.

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

Usage:

```go
func ProcessOrder(order Order, strategy ShippingStrategy) {
    cost := strategy.Calculate(order)
    fmt.Printf("Shipping cost: $%.2f\n", cost)
}

// Choose strategy
var strategy ShippingStrategy
if urgent {
    strategy = &OvernightShipping{}
} else {
    strategy = &StandardShipping{}
}

ProcessOrder(order, strategy)
```

## Real Example 1: Payment Systems

In e-commerce application, user can pay different ways: card, PayPal, cryptocurrency, bank transfer. Each method is a strategy.

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
    // Card validation
    if !c.validateCard() {
        return errors.New("invalid card")
    }
    
    // Process through payment gateway
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
    // OAuth authorization
    if !p.authorize() {
        return errors.New("paypal authorization failed")
    }
    
    // PayPal API call
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
    // Convert to cryptocurrency
    cryptoAmount := convertToCrypto(amount, c.Currency)
    
    // Create blockchain transaction
    return processCryptoPayment(c.WalletAddress, cryptoAmount, c.Currency)
}

func (c *CryptoPayment) Refund(transactionID string, amount float64) error {
    // Crypto transactions are irreversible
    return errors.New("crypto payments cannot be refunded")
}
```

Usage in checkout process:

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

// In controller
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

**Advantages of this approach:**

- Easy to add new payment method (Apple Pay, Google Pay)
- Each strategy is tested separately
- Can change payment method without restarting application
- Isolation of each provider's logic

## Real Example 2: Data Compression

In file storage system, need to compress data. Different file types require different compression algorithms.

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
    buf := make([]byte, len(data)*10) // Estimated size
    n, err := lz4.UncompressBlock(data, buf)
    return buf[:n], err
}

func (l *LZ4Compression) Extension() string {
    return ".lz4"
}
```

Strategy selection based on file type:

```go
type FileStorage struct {
    compression CompressionStrategy
}

func (f *FileStorage) SelectCompression(filename string) {
    ext := filepath.Ext(filename)
    
    switch ext {
    case ".txt", ".log", ".json":
        // Text files compress well with gzip
        f.compression = &GzipCompression{Level: 6}
    case ".jpg", ".png", ".mp4":
        // Media already compressed, use fast LZ4
        f.compression = &LZ4Compression{}
    default:
        // For everything else use zstd - balance of speed and compression
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

**Why this is useful:**

- Optimal compression for each file type
- Easy to add new algorithm (Brotli, Snappy)
- Can A/B test algorithms
- Different compression levels for different scenarios

## Real Example 3: Data Validation

In API need to validate incoming data. Different endpoints require different validation rules.

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
    
    // Different formats for different countries
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

Validator composition:

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

// Usage
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
    
    // Register user
}
```

## Real Example 4: Pricing

In SaaS application, different pricing strategies for different customer types.

```go
type PricingStrategy interface {
    CalculatePrice(usage Usage) float64
    GetDiscount(customer Customer) float64
}

type StartupPricing struct{}

func (s *StartupPricing) CalculatePrice(usage Usage) float64 {
    // Fixed price up to certain limit
    if usage.APIRequests < 10000 {
        return 29.0
    }
    // Then per 1000 requests
    extra := (usage.APIRequests - 10000) / 1000
    return 29.0 + float64(extra)*0.5
}

func (s *StartupPricing) GetDiscount(customer Customer) float64 {
    // Discount for annual subscription
    if customer.BillingPeriod == "yearly" {
        return 0.20 // 20%
    }
    return 0
}

type EnterprisePricing struct{}

func (e *EnterprisePricing) CalculatePrice(usage Usage) float64 {
    // Base price
    base := 999.0
    
    // Price per user
    base += float64(usage.Users) * 10.0
    
    // Price per storage (per GB)
    base += float64(usage.StorageGB) * 0.1
    
    // Price per API requests (per 1000)
    base += float64(usage.APIRequests/1000) * 0.05
    
    return base
}

func (e *EnterprisePricing) GetDiscount(customer Customer) float64 {
    discount := 0.0
    
    // Volume discount
    if customer.Users > 100 {
        discount += 0.15
    }
    
    // Contract length discount
    if customer.ContractYears >= 3 {
        discount += 0.10
    }
    
    return discount
}

type PayAsYouGoPricing struct{}

func (p *PayAsYouGoPricing) CalculatePrice(usage Usage) float64 {
    price := 0.0
    
    // Only for what was used
    price += float64(usage.APIRequests) * 0.001
    price += float64(usage.StorageGB) * 0.15
    price += float64(usage.ComputeHours) * 0.50
    
    return price
}

func (p *PayAsYouGoPricing) GetDiscount(customer Customer) float64 {
    // No discounts for pay-as-you-go
    return 0
}
```

Usage:

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

// Choose strategy based on plan
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

## When to Use Strategy Pattern

1. **Multiple algorithms for one task** - sorting, searching, validation
2. **Choice depends on conditions** - user type, configuration, time
3. **Algorithms change frequently** - business rules, pricing, promotions
4. **Need isolation** - each algorithm is independent and tested separately
5. **Avoid if-else cascades** - when conditional logic grows

## Advantages

- **Open/Closed Principle** - open for extension, closed for modification
- **Single Responsibility** - each strategy does one thing
- **Testability** - strategies tested in isolation
- **Flexibility** - can change algorithm at runtime
- **Readability** - code easier to understand and maintain

## Disadvantages

- **More classes** - each strategy is separate type
- **Client must know strategies** - need to choose correct one
- **Overhead** - additional abstraction level

## Strategy vs State Pattern

Strategy chooses algorithm. State manages behavior based on state.

**Strategy:**

```go
// Choose payment method
payment := &CreditCardPayment{}
payment.Pay(100)
```

**State:**

```go
// Order changes behavior based on state
order.Ship() // Different behavior for New, Paid, Shipped
```

## Conclusion

Strategy Pattern in Go:

- Encapsulates algorithms in separate types
- Allows choosing algorithm at runtime
- Makes code flexible and extensible
- Simplifies testing
- Eliminates if-else cascades

Use Strategy when you have a family of algorithms that can be interchanged. This makes code cleaner, simpler, and more reliable.

In real applications, Strategy is everywhere: payments, compression, validation, pricing, routing. It's one of the most practical patterns.
