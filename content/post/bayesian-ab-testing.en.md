---
title: "Probability Theory: Bayesian Statistics for A/B Testing in Go"
date: 2025-04-29T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["golang", "statistics", "ab-testing", "bayesian", "math", "data-science", "probability"]
categories: ["Mathematics"]
---

A/B testing is everywhere: button colors, pricing, algorithms. But most implementations use frequentist statistics. Bayesian approach gives you probability of being better, not just "statistically significant". Let's implement it in Go.

## Frequentist vs Bayesian

**Frequentist**: "Is the difference statistically significant?"

- p-value < 0.05 → reject null hypothesis
- Doesn't tell you probability of A being better than B

**Bayesian**: "What's the probability that B is better than A?"

- Direct answer: "B is better with 95% probability"
- Updates beliefs as data arrives

## Basic A/B Test

```go
type Variant struct {
    Name        string
    Conversions int
    Visitors    int
}

func (v *Variant) Rate() float64 {
    if v.Visitors == 0 {
        return 0
    }
    return float64(v.Conversions) / float64(v.Visitors)
}
```

## Beta Distribution

For conversion rates, we use Beta distribution:

- Prior: Beta(α, β) - our initial belief
- Likelihood: Binomial(conversions, visitors)
- Posterior: Beta(α + conversions, β + visitors - conversions)

```go
import "math"

type BetaDistribution struct {
    Alpha float64
    Beta  float64
}

func NewBetaPrior() BetaDistribution {
    return BetaDistribution{Alpha: 1, Beta: 1} // Uniform prior
}

func (b BetaDistribution) Update(conversions, visitors int) BetaDistribution {
    return BetaDistribution{
        Alpha: b.Alpha + float64(conversions),
        Beta:  b.Beta + float64(visitors-conversions),
    }
}

func (b BetaDistribution) Mean() float64 {
    return b.Alpha / (b.Alpha + b.Beta)
}

func (b BetaDistribution) Variance() float64 {
    sum := b.Alpha + b.Beta
    return (b.Alpha * b.Beta) / (sum * sum * (sum + 1))
}
```

## Monte Carlo Simulation

To find P(B > A), we sample from both distributions:

```go
import (
    "math/rand"
    "time"
)

func (b BetaDistribution) Sample(rng *rand.Rand) float64 {
    // Using Gamma distribution to sample from Beta
    x := sampleGamma(b.Alpha, rng)
    y := sampleGamma(b.Beta, rng)
    return x / (x + y)
}

func sampleGamma(shape float64, rng *rand.Rand) float64 {
    if shape < 1 {
        return sampleGamma(shape+1, rng) * math.Pow(rng.Float64(), 1/shape)
    }
    
    d := shape - 1.0/3.0
    c := 1.0 / math.Sqrt(9.0*d)
    
    for {
        z := rng.NormFloat64()
        v := math.Pow(1+c*z, 3)
        
        if v > 0 {
            u := rng.Float64()
            if math.Log(u) < 0.5*z*z+d-d*v+d*math.Log(v) {
                return d * v
            }
        }
    }
}

func ProbabilityBBeatsA(a, b BetaDistribution, samples int) float64 {
    rng := rand.New(rand.NewSource(time.Now().UnixNano()))
    wins := 0
    
    for i := 0; i < samples; i++ {
        sampleA := a.Sample(rng)
        sampleB := b.Sample(rng)
        if sampleB > sampleA {
            wins++
        }
    }
    
    return float64(wins) / float64(samples)
}
```

## Complete A/B Test

```go
type ABTest struct {
    VariantA Variant
    VariantB Variant
    PriorA   BetaDistribution
    PriorB   BetaDistribution
}

func NewABTest() *ABTest {
    return &ABTest{
        VariantA: Variant{Name: "A"},
        VariantB: Variant{Name: "B"},
        PriorA:   NewBetaPrior(),
        PriorB:   NewBetaPrior(),
    }
}

func (t *ABTest) RecordConversion(variant string, converted bool) {
    if variant == "A" {
        t.VariantA.Visitors++
        if converted {
            t.VariantA.Conversions++
        }
    } else {
        t.VariantB.Visitors++
        if converted {
            t.VariantB.Conversions++
        }
    }
}

func (t *ABTest) Results() TestResults {
    posteriorA := t.PriorA.Update(t.VariantA.Conversions, t.VariantA.Visitors)
    posteriorB := t.PriorB.Update(t.VariantB.Conversions, t.VariantB.Visitors)
    
    probBBeatsA := ProbabilityBBeatsA(posteriorA, posteriorB, 10000)
    
    return TestResults{
        VariantA:    t.VariantA,
        VariantB:    t.VariantB,
        PosteriorA:  posteriorA,
        PosteriorB:  posteriorB,
        ProbBBeatsA: probBBeatsA,
    }
}

type TestResults struct {
    VariantA    Variant
    VariantB    Variant
    PosteriorA  BetaDistribution
    PosteriorB  BetaDistribution
    ProbBBeatsA float64
}

func (r TestResults) Winner() string {
    if r.ProbBBeatsA > 0.95 {
        return "B"
    } else if r.ProbBBeatsA < 0.05 {
        return "A"
    }
    return "Inconclusive"
}
```

## Real Example

```go
func main() {
    test := NewABTest()
    
    // Simulate traffic
    // A: 100 visitors, 10 conversions (10%)
    for i := 0; i < 100; i++ {
        test.RecordConversion("A", i < 10)
    }
    
    // B: 100 visitors, 15 conversions (15%)
    for i := 0; i < 100; i++ {
        test.RecordConversion("B", i < 15)
    }
    
    results := test.Results()
    
    fmt.Printf("Variant A: %d/%d (%.2f%%)\n",
        results.VariantA.Conversions,
        results.VariantA.Visitors,
        results.VariantA.Rate()*100)
    
    fmt.Printf("Variant B: %d/%d (%.2f%%)\n",
        results.VariantB.Conversions,
        results.VariantB.Visitors,
        results.VariantB.Rate()*100)
    
    fmt.Printf("Probability B beats A: %.2f%%\n", results.ProbBBeatsA*100)
    fmt.Printf("Winner: %s\n", results.Winner())
}
```

Output:

```sh
Variant A: 10/100 (10.00%)
Variant B: 15/100 (15.00%)
Probability B beats A: 89.23%
Winner: Inconclusive
```

## Expected Loss

How much we lose if we pick the wrong variant:

```go
func ExpectedLoss(a, b BetaDistribution, samples int) (lossA, lossB float64) {
    rng := rand.New(rand.NewSource(time.Now().UnixNano()))
    
    for i := 0; i < samples; i++ {
        sampleA := a.Sample(rng)
        sampleB := b.Sample(rng)
        
        if sampleA > sampleB {
            lossB += sampleA - sampleB
        } else {
            lossA += sampleB - sampleA
        }
    }
    
    return lossA / float64(samples), lossB / float64(samples)
}
```

## Multi-Armed Bandit

Instead of fixed 50/50 split, allocate traffic dynamically:

```go
type Bandit struct {
    Variants []Variant
    Priors   []BetaDistribution
}

func (b *Bandit) SelectVariant() int {
    rng := rand.New(rand.NewSource(time.Now().UnixNano()))
    
    // Thompson Sampling
    maxSample := 0.0
    maxIdx := 0
    
    for i, prior := range b.Priors {
        posterior := prior.Update(
            b.Variants[i].Conversions,
            b.Variants[i].Visitors,
        )
        sample := posterior.Sample(rng)
        
        if sample > maxSample {
            maxSample = sample
            maxIdx = i
        }
    }
    
    return maxIdx
}
```

## Production Implementation

```go
type ABTestService struct {
    tests map[string]*ABTest
    mu    sync.RWMutex
}

func NewABTestService() *ABTestService {
    return &ABTestService{
        tests: make(map[string]*ABTest),
    }
}

func (s *ABTestService) GetTest(name string) *ABTest {
    s.mu.RLock()
    defer s.mu.RUnlock()
    
    if test, ok := s.tests[name]; ok {
        return test
    }
    return nil
}

func (s *ABTestService) CreateTest(name string) *ABTest {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    test := NewABTest()
    s.tests[name] = test
    return test
}

func (s *ABTestService) RecordEvent(testName, variant string, converted bool) error {
    test := s.GetTest(testName)
    if test == nil {
        return fmt.Errorf("test not found: %s", testName)
    }
    
    test.RecordConversion(variant, converted)
    return nil
}
```

## HTTP Handler

```go
func (s *ABTestService) HandleResults(w http.ResponseWriter, r *http.Request) {
    testName := r.URL.Query().Get("test")
    test := s.GetTest(testName)
    
    if test == nil {
        http.Error(w, "Test not found", http.StatusNotFound)
        return
    }
    
    results := test.Results()
    
    response := map[string]interface{}{
        "variant_a": map[string]interface{}{
            "conversions": results.VariantA.Conversions,
            "visitors":    results.VariantA.Visitors,
            "rate":        results.VariantA.Rate(),
        },
        "variant_b": map[string]interface{}{
            "conversions": results.VariantB.Conversions,
            "visitors":    results.VariantB.Visitors,
            "rate":        results.VariantB.Rate(),
        },
        "probability_b_beats_a": results.ProbBBeatsA,
        "winner":                results.Winner(),
    }
    
    json.NewEncoder(w).Encode(response)
}
```

## When to Stop Test

```go
func (r TestResults) ShouldStop(threshold float64) bool {
    // Stop if probability > threshold or < (1 - threshold)
    return r.ProbBBeatsA > threshold || r.ProbBBeatsA < (1-threshold)
}

// Usage
if results.ShouldStop(0.95) {
    fmt.Println("Test complete, can make decision")
}
```

## Conclusion

Bayesian A/B testing gives you:

- Direct probability interpretation
- Works with small samples
- Can stop test early
- Natural for multi-armed bandits

Key advantages over frequentist:

- No p-values confusion
- Continuous monitoring without penalty
- Incorporates prior knowledge

For production, consider:

- Caching posterior calculations
- Persistent storage for test data
- Monitoring for sample ratio mismatch
- Segmentation analysis

Bayesian statistics makes A/B testing intuitive and actionable.

Additional resources and examples on GitHub: [github.com/ilyabrin/ab-testing-bayesian-go](github.com/ilyabrin/ab-testing-bayesian-go)

- <https://www.udacity.com/blog/2021/06/bayesian-ab-testing-explained.html>
- <https://www.evanmiller.org/bayesian-ab-testing.html>
- <https://towardsdatascience.com/bayesian-ab-testing-in-python-5d2f4f2b6f1c>
- <https://www.statworx.com/de/blog/bayesian-ab-testing-with-python-and-pymc3/>
- <https://www.analyticsvidhya.com/blog/2021/06/bayesian-ab-testing-a-complete-guide/>
- <https://www.youtube.com/watch?v=7Ven0x1z1nw>
- <https://www.youtube.com/watch?v=7F63yX-6k8A>
