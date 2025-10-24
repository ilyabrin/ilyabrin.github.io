---
title: "How to Make Technical Decisions in Product Teams"
date: 2025-09-13T14:00:14+01:00

author: "Ilya Brin"
categories: ['engineering', 'management', 'productivity']
tags: ['technical-decisions', 'team-management', 'product-development', 'leadership', 'best-practices']
---

Hey there! 👋

You're not just a coder - you're an **architect of the future**. Every technical choice you make is either a **breakthrough** or **tech debt for the next year**.

But here's the problem: there are tons of opinions around, deadlines are burning, and your decision determines whether the product will soar or crash at launch.

Let's figure out how to make technical decisions **quickly, confidently, and without the subsequent "what the #@!^? did I choose?"**

A guide for those who don't want to shoot themselves in the foot

<!--more-->

## 1. Why 80% of tech decisions are about people, not technology

Right stack ≠ success. **Success = a solution that:**  
✅ Fits the team  
✅ Solves the business problem  
✅ Doesn't become a time bomb  

Real-life example:  
> **Choice between Kafka and RabbitMQ**  
>
> - Kafka is cooler, but if no one on the team knows how to work with it - it's a failure  
> - RabbitMQ is simpler, but doesn't scale for future loads  

**Conclusion:** there's no perfect solution. There's **optimal for your context**.  

## 2. Decision-making algorithm (no fluff)

### Step 1: Clearly define the problem

❌ Bad: *"We need a new API gateway"*  
✅ Good: *"Current API can't handle 10k RPS, and latency jumps to 500ms"*  

### Step 2: Gather facts

- What are the constraints? (deadlines, budget, expertise)  
- What options even exist?  
- What do competitors use?  

**Simple checklist:**  

```markdown
- [ ] Load (RPS, data size)  
- [ ] Fault tolerance requirements  
- [ ] Team skills  
- [ ] Total cost of ownership  
```  

### Step 3: Discuss with key players

| Role            | What to ask                               |
| --------------- | ----------------------------------------- |
| Product Manager | "What features will we have in 6 months?" |
| Tech Lead       | "How will this affect other services?"    |
| Developer       | "How long will implementation take?"      |

### Step 4: Make decision and document it  

Documentation format:  

```markdown
## Decision: Database choice for analytics  

**Problem:**  
PostgreSQL can't handle JOINs on 1B+ records  

**Options:**  
1. ClickHouse (+ speed, - no transactions)  
2. PostgreSQL with partitioning (+ familiar, - complex tuning)  

**Chosen:** ClickHouse  

**Reason:**  
- Expecting 10x data growth  
- Analytics doesn't require ACID  
```  

### Step 5: Assign responsibility for consequences
>
> *"John, you're responsible for monitoring ClickHouse performance after release"*  

---

## 3. Main traps (and how to avoid them)

### 💣 Trap 1: "We've always done it this way"

**Example:**  
> *"Everything runs on MongoDB, so we'll build the new service on it too"*  

**How to avoid:**  

- Regularly conduct **tech radar** sessions  
- Quarterly ask: *"If we were starting now, would we choose the same thing?"*  

### 💣 Trap 2: Hype technologies

**Phrases that should alert you:**  
> *"Let's do it on blockchain!"*  
> *"FAANG companies use this!"*  

**Rule:**  
> Before implementing a new technology, find **3 real use cases in your context**  

### 💣 Trap 3: "Gut feeling" decisions

**Salvation:**  

```bash
# Before choosing technology:
make benchmark
```  

- Measure the load  
- Compare at least 2 options  

## 4. How to sell the decision to the team (even if it's controversial)

### 🚀 Technique 1: "Argument pyramid"

1. **Facts:** "In tests, Kafka gave 5x more throughput"  
2. **Risks:** "Yes, we'll be figuring it out for the first 2 weeks"  
3. **Expertise:** "Here are benchmarks from Confluent"  

### 🚀 Technique 2: "Trial balloon"  
>
> *"Let's try it on one non-critical service"*  

### 🚀 Technique 3: "Feedback = part of the process"  

After implementation:  
> *"Alex, how's the new ORM working for you? What can we improve?"*  

## Conclusion: You're not a fortune teller, you're a solution engineer

Good technical decision:  
🔧 **Solves a specific problem**  
📈 **Considers future growth**  
🤝 **Is supported by the team**  

**Main secret:**  
> The best solution is one where in 6 months you don't want to say *"Damn, should have done it differently"*  

**P.S. How do you make complex technical decisions? Share your cases in the comments!** 🚀  

```go
// Additional resources:
// - Book "Software Architecture: The Hard Parts" (Neal Ford)
// - Article "How to Make Technical Decisions" (Martin Fowler)
```
