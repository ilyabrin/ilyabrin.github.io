---
title: "LLM Quantization Types: a Cheat Sheet"
date: 2026-04-29T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["llm", "ai", "quantization", "local-ai", "ollama", "llama.cpp"]
categories: ["AI"]
---

Trying to run a large language model locally but not sure which file to download? Q4_K_M, IQ3_S, Q5_K_M - these aren't random strings. They describe the quantization format, which determines response quality and how much memory the model will use.

<!--more-->

## What is quantization

A trained neural network is billions of floating-point numbers (float32 or float16). Each parameter takes 2–4 bytes. A 70-billion-parameter model in float16 weighs ~140 GB - way too much for most consumer GPUs.

Quantization compresses those numbers: instead of 16-bit floats, the model stores 4-bit or 3-bit integers. The model becomes smaller and faster, at the cost of some precision. It's a deliberate trade-off between size and quality.

## Breaking down the names

Let's decode `Q4_K_M` piece by piece:

| Part                | Meaning                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Q` or `IQ`         | Quantization method. `Q` - classic approach; `IQ` - improved: weights are compressed based on their importance, usually more accurate at the same size |
| `4`, `5`, `3`, `2`  | Bits per weight. More bits = better quality = larger file                                                                                              |
| `K`                 | K-quant: smarter distribution of precision across model layers                                                                                         |
| `M`, `L`, `S`, `XS` | Size within a bit level: `L` (large) → `M` (medium) → `S` (small) → `XS` (extra small)                                                                 |

## Quantization reference table

| Type       | Bits/weight | Quality                                        | Recommended       |
| ---------- | ----------- | ---------------------------------------------- | ----------------- |
| **Q5_K_M** | ~5.68       | Very good                                      | ✅ Yes             |
| **Q5_K_S** | ~5.54       | Very good                                      | ✅ Yes             |
| **Q4_K_M** | ~4.83       | Good                                           | ✅ Yes             |
| **Q4_K_S** | ~4.58       | Slightly below Q4_K_M, saves space             | ✅ Yes             |
| **IQ4_NL** | ~4.50       | Decent, slightly smaller than Q4_K_S           | ✅ Yes             |
| **IQ4_XS** | ~4.25       | Decent, smaller than Q4_K_S                    | ✅ Yes             |
| **Q3_K_L** | ~3.82       | Below average but usable                       | ⚠️ Low memory only |
| **Q3_K_M** | ~3.66       | Noticeable quality drop                        | ⚠️ Low memory only |
| **IQ3_M**  | ~3.66       | Comparable to Q3_K_M, newer method             | ⚠️ Low memory only |
| **IQ3_S**  | ~3.44       | Below average, better than Q3_K_S at same size | ⚠️ Use carefully   |
| **Q3_K_S** | ~3.44       | Low                                            | ❌ Not recommended |
| **IQ3_XS** | ~3.30       | Low, slightly better than Q3_K_S               | ❌ Use carefully   |
| **Q2_K**   | ~2.96       | Very low, but surprisingly usable              | ❌ No other option |

## How to choose

Simple rule: **pick the highest-quality variant that fits in your VRAM** (or RAM if running on CPU).

```
8 GB VRAM  → Q4_K_M for 7B,  Q3_K_M for 13B
16 GB VRAM → Q5_K_M for 13B, Q4_K_M for 30B
24 GB VRAM → Q5_K_M for 30B, Q4_K_M for 70B
CPU only   → IQ4_XS or Q4_K_S, speed matters more
```

**Practical tips:**

- **Q4_K_M** - the gold standard. When in doubt, grab this.
- **IQ4_XS** - shaves a few GB off with barely noticeable quality loss.
- **Q5_K_M** - if you have headroom and want the best quality available locally.
- **Q3_*** - only when the model simply won't fit any other way.
- **Q2_K** - when there is no other choice: memory is very tight and you need the model anyway.

## Why IQ formats often beat classic Q formats

Classic Q formats (Q4_K_S, Q3_K_S) compress all weights equally. IQ formats are smarter: they know which weights have the most influence on the output and preserve those more carefully. Weights that barely affect the result get compressed more aggressively.

The result: `IQ4_XS` takes less space than `Q4_K_S` while delivering comparable or better quality.

## Summary

Quantization isn't scary. It's just a trade-off: **less memory ↔ less precision**. For most tasks, Q4_K_M produces output that's practically indistinguishable from the full-precision original.
