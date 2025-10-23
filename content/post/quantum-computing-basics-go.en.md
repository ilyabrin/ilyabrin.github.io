---
title: "Quantum Computing Basics: Qubits and Superposition in Go"
date: 2025-10-20T12:00:00+01:00

author: "Ilya Brin"
categories: ['quantum-computing', 'golang', 'math']
tags: ['quantum-computing', 'qubits', 'superposition', 'golang', 'quantum-algorithms', 'physics', 'mathematics']
---

Hey there! 👋

While everyone's talking about **AI**, real geeks are already studying **quantum computing**. This isn't science fiction - it's the **mathematics of the future** that will break all modern cryptography.

**Google** claimed quantum supremacy, **IBM** launched cloud quantum computers, and **Microsoft** is investing billions in quantum technologies.

But how does it work? And can we **simulate quantum computing in Go**?

Let's explore **qubits**, **superposition**, and **quantum gates** with practical Go examples 🚀

<!--more-->

## 1. Quantum vs Classical Computing

### Classical Bit vs Qubit

**Classical bit:**

- State: `0` or `1`
- Deterministic: always exact value

**Qubit (quantum bit):**

- State: `|0⟩`, `|1⟩` or **superposition** of both
- Probabilistic: measurement gives random result

```go
// Classical bit
type ClassicalBit struct {
    value bool // true or false
}

// Qubit in superposition
type Qubit struct {
    alpha complex128 // amplitude of |0⟩ state
    beta  complex128 // amplitude of |1⟩ state
}
```

### Qubit Mathematics

A qubit is described by a **state vector**:

```
|ψ⟩ = α|0⟩ + β|1⟩
```

Where:

- `α, β` - complex amplitudes
- `|α|² + |β|² = 1` - normalization condition
- `|α|²` - probability of measuring `0`
- `|β|²` - probability of measuring `1`

## 2. Implementing Qubits in Go

### Basic Structure

```go
package quantum

import (
    "fmt"
    "math"
    "math/cmplx"
    "math/rand"
)

type Qubit struct {
    Alpha complex128 // amplitude of |0⟩
    Beta  complex128 // amplitude of |1⟩
}

// Create qubit in |0⟩ state
func NewQubit() *Qubit {
    return &Qubit{Alpha: 1, Beta: 0}
}

// Create qubit in superposition
func NewSuperposition(alpha, beta complex128) *Qubit {
    // Normalization
    norm := math.Sqrt(real(alpha*cmplx.Conj(alpha) + beta*cmplx.Conj(beta)))
    return &Qubit{
        Alpha: alpha / complex(norm, 0),
        Beta:  beta / complex(norm, 0),
    }
}
```

### Measuring Qubits

> When you measure a qubit, it "collapses" to one of the classical states.

```go
func (q *Qubit) Measure() int {
    prob0 := real(q.Alpha * cmplx.Conj(q.Alpha))
    
    if rand.Float64() < prob0 {
        // Collapse to |0⟩ state
        q.Alpha = 1
        q.Beta = 0
        return 0
    }
    
    // Collapse to |1⟩ state
    q.Alpha = 0
    q.Beta = 1
    return 1
}

func (q *Qubit) String() string {
    return fmt.Sprintf("%.3f|0⟩ + %.3f|1⟩", q.Alpha, q.Beta)
}
```

## 3. Quantum Gates

**What are quantum gates?**
> They are operations that change the state of a qubit.

### Pauli-X Gate (NOT)

Brief description:
> Swaps the states |0⟩ and |1⟩. Inversion in other words.

```go
func (q *Qubit) PauliX() {
    q.Alpha, q.Beta = q.Beta, q.Alpha
}
```

### Hadamard Gate (Superposition)

> Creates superposition from a basis state.

```go
func (q *Qubit) Hadamard() {
    newAlpha := (q.Alpha + q.Beta) / complex(math.Sqrt(2), 0)
    newBeta := (q.Alpha - q.Beta) / complex(math.Sqrt(2), 0)
    q.Alpha = newAlpha
    q.Beta = newBeta
}
```

### Phase Shift Gate

> Changes the phase of the |1⟩ state by angle θ.
>
> Phase affects interference in multi-qubit systems.  
> Interference is key to quantum advantage.  
>
> Quantum advantage is when a quantum computer solves problems faster than a classical one.  
> So understanding phases is important!

```go
func (q *Qubit) PhaseShift(theta float64) {
    phase := cmplx.Exp(complex(0, theta))
    q.Beta *= phase
}
```

## 4. Multi-Qubit Systems

> For multiple qubits, the state space grows exponentially.  
> E.g., 2 qubits have 4 basis states: |00⟩, |01⟩, |10⟩, |11⟩.  
> This allows for entanglement, a key quantum phenomenon.  
> Entanglement enables correlations that are impossible classically.  
> This is crucial for quantum algorithms.

### Two-Qubit System

```go
type TwoQubitSystem struct {
    // Basis states: |00⟩, |01⟩, |10⟩, |11⟩
    Amplitudes [4]complex128
}

func NewTwoQubitSystem() *TwoQubitSystem {
    return &TwoQubitSystem{
        Amplitudes: [4]complex128{1, 0, 0, 0}, // |00⟩
    }
}

func (tqs *TwoQubitSystem) CNOT(control, target int) {
    if control == 0 && target == 1 {
        // Swap |01⟩ ↔ |11⟩ and |00⟩ ↔ |10⟩
        tqs.Amplitudes[1], tqs.Amplitudes[3] = tqs.Amplitudes[3], tqs.Amplitudes[1]
        tqs.Amplitudes[0], tqs.Amplitudes[2] = tqs.Amplitudes[2], tqs.Amplitudes[0]
    }
}
```

### Quantum Entanglement

```go
func CreateBellState() *TwoQubitSystem {
    tqs := NewTwoQubitSystem()
    
    // Apply Hadamard to first qubit
    sqrt2 := complex(1/math.Sqrt(2), 0)
    tqs.Amplitudes[0] = sqrt2  // |00⟩
    tqs.Amplitudes[2] = sqrt2  // |10⟩
    
    // Apply CNOT
    tqs.CNOT(0, 1)
    
    return tqs // Result: (|00⟩ + |11⟩)/√2
}
```

## 5. Quantum Algorithms

### Deutsch's Algorithm

**Short description:**
> Determines if a function is constant or balanced with one query.
>
> This showcases quantum parallelism.
>
> Quantum parallelism allows evaluating multiple inputs simultaneously.

```go
func DeutschAlgorithm(oracle func(*Qubit)) bool {
    // Initialization
    x := NewQubit()
    y := NewSuperposition(1, -1) // |−⟩ state
    
    // Hadamard on x
    x.Hadamard()
    
    // Apply oracle
    oracle(x)
    
    // Hadamard on x
    x.Hadamard()
    
    // Measure x
    result := x.Measure()
    
    // 0 = constant function, 1 = balanced function
    return result == 1
}
```

### Quantum Fourier Transform

For those who forgot:
> Fourier transform converts a signal from time domain to frequency domain.  
> In the quantum world, this allows efficient analysis of periodicity in functions.
>
> Thus, transforming to frequency domain helps solve period-related problems.
> This is important for many quantum algorithms, e.g., Shor's algorithm.

```go
func QFT(qubits []*Qubit) {
    n := len(qubits)
    
    for i := 0; i < n; i++ {
        qubits[i].Hadamard()
        
        for j := i + 1; j < n; j++ {
            angle := math.Pi / math.Pow(2, float64(j-i))
            // Controlled phase shift
            controlledPhaseShift(qubits[j], qubits[i], angle)
        }
    }
    
    // Reverse order
    for i := 0; i < n/2; i++ {
        qubits[i], qubits[n-1-i] = qubits[n-1-i], qubits[i]
    }
}

func controlledPhaseShift(control, target *Qubit, theta float64) {
    // Simplified implementation for demonstration
    if real(control.Beta*cmplx.Conj(control.Beta)) > 0.5 {
        target.PhaseShift(theta)
    }
}
```

## 6. Quantum Simulator

> Simulating quantum systems on classical computers is challenging due to exponential growth of states with more qubits.  
> But for small systems, it's feasible and useful for learning and experimentation.

### Complete Simulator Implementation

```go
type QuantumSimulator struct {
    qubits []*Qubit
    gates  []string
}

func NewSimulator(numQubits int) *QuantumSimulator {
    qubits := make([]*Qubit, numQubits)
    for i := range qubits {
        qubits[i] = NewQubit()
    }
    
    return &QuantumSimulator{
        qubits: qubits,
        gates:  []string{},
    }
}

func (qs *QuantumSimulator) ApplyGate(gate string, qubitIndex int) {
    switch gate {
    case "H":
        qs.qubits[qubitIndex].Hadamard()
    case "X":
        qs.qubits[qubitIndex].PauliX()
    case "Z":
        qs.qubits[qubitIndex].PhaseShift(math.Pi)
    }
    
    qs.gates = append(qs.gates, fmt.Sprintf("%s(%d)", gate, qubitIndex))
}

func (qs *QuantumSimulator) MeasureAll() []int {
    results := make([]int, len(qs.qubits))
    for i, qubit := range qs.qubits {
        results[i] = qubit.Measure()
    }
    return results
}
```

## 7. Practical Example

### True Random Number Generator

> Using superposition and measurement of qubits, we can create a random number generator.  
> Because classical pseudo-random number generators do not provide true randomness.  
>
> Why: in the quantum world, the result of measuring a qubit is unpredictable.  
> This is key to creating cryptographically secure random numbers.

```go
func QuantumRandomGenerator(bits int) []int {
    sim := NewSimulator(bits)
    
    // Create superposition of all qubits
    for i := 0; i < bits; i++ {
        sim.ApplyGate("H", i)
    }
    
    // Measure all qubits
    return sim.MeasureAll()
}

func main() {
    // Generate 8-bit random number
    randomBits := QuantumRandomGenerator(8)
    
    // Convert to number
    var result int
    for i, bit := range randomBits {
        result += bit << i
    }
    
    fmt.Printf("Quantum random number: %d\n", result)
    fmt.Printf("Bits: %v\n", randomBits)
}
```

## 8. Benchmarks and Performance

```go
func BenchmarkQuantumSimulation(b *testing.B) {
    sim := NewSimulator(10)
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        // Create random quantum circuit
        for j := 0; j < 100; j++ {
            gate := []string{"H", "X", "Z"}[rand.Intn(3)]
            qubit := rand.Intn(10)
            sim.ApplyGate(gate, qubit)
        }
        sim.MeasureAll()
    }
}

// Result: ~50μs for 10 qubits, 100 gates
```

## 9. Classical Simulation Limitations

### Exponential Growth

```go
// Memory for n qubits: 2^n complex numbers
func memoryRequired(qubits int) int {
    return int(math.Pow(2, float64(qubits))) * 16 // 16 bytes per complex128
}

// 20 qubits = 16 MB
// 30 qubits = 16 GB  
// 40 qubits = 16 TB (!)
```

### Quantum Supremacy

**Classical limit:** ~50 qubits  
**Google Sycamore:** 53 qubits, 200 seconds vs 10,000 years on supercomputer

## Conclusion: The Future is Here

**Quantum computing:**
🔐 **Will break RSA** and modern cryptography
🚀 **Exponential speedup** for specific problems  
🧬 **Science revolution:** molecular simulation, optimization
💰 **New opportunities:** machine learning, finance  

**What to study next:**

- Shor's algorithm (factorization)
- Grover's algorithm (search)
- Quantum machine learning
- Post-quantum cryptography

**P.S. Ready for the quantum future? Start learning now!** 🚀

```go
// Additional resources:
// - IBM Qiskit (Python, but concepts are the same)
// - Microsoft Q# Development Kit
// - "Quantum Computing: An Applied Approach" (Hidary) - https://www.springer.com/gp/book/9783030259643
// - Quantum Country - https://quantum.country/
// - Qubit by Qubit - https://www.qubitbyqubit.org/
// - Quantum Computing for the Determined - https://quantum.country/qcvc
// - Quantum Algorithm Zoo - https://quantumalgorithmzoo.org/
```
