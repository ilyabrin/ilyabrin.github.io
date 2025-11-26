---
title: "Technical Communication: How to Explain Complex Things Simply"
date: 2025-11-12T10:00:00+03:00
draft: false
author: Ilya Brin
tags: ["communication", "soft-skills", "leadership", "documentation"]
categories: ["Communication"]
---

You can write perfect code, but if you can't explain why it's needed, it's useless. Technical communication is the skill that separates seniors from middles.

<!--more-->

## The Problem

Typical developer explanation:

> "We're using event-driven architecture with CQRS pattern, where commands are processed through a message broker with at-least-once delivery guarantee, and the read model is updated asynchronously through event sourcing."

What the manager hears: "Blah-blah-blah technical terms blah-blah."

The problem isn't that the manager is stupid. The problem is you're speaking different languages. Your job is to be a translator.

## Principle: From Problem to Solution

**Bad explanation** starts with technology:

- "We're using Redis"
- "Implementing microservices architecture"
- "Moving to Kubernetes"

**Good explanation** starts with the problem:

- "Users wait 5 seconds for page load"
- "We're losing 30% conversion due to slow performance"
- "Cache will speed up loading to 100 milliseconds"
- "We'll use Redis for this"

See the difference? First the problem and its business impact, then the solution, and only at the end — the technology.

## The Three-Level Rule

Prepare explanations at three levels of detail. Like zoom on a map: first you see the country, then the city, then the street.

### Level 1: Elevator Pitch (30 seconds)

Imagine you met the CEO in an elevator. You have 30 seconds to explain what you're working on.

**Example:**
> "We sped up page loading from 5 seconds to 100 milliseconds. This will increase conversion by 30%."

**For whom:** CEO, investors, casual meetings

**What matters:** only the result and business impact. No technical details.

### Level 2: Meeting (5 minutes)

You're in a meeting with a manager or product manager. You have 5 minutes to explain the problem and solution.

**Example:**
> **Problem:** The database can't handle the load. Every request goes to the database, it's slow.
>
> **Solution:** Added cache between application and database. Popular data is stored in memory — fast access.
>
> **Result:** 50x speedup, less load on database.
>
> **Cost:** 2 weeks development, $100/month infrastructure.

**For whom:** managers, product managers

**What matters:** problem, solution, result, cost. Minimum technical terms.

### Level 3: Technical (30 minutes)

You're at a technical meeting with other developers. Here you can speak technical language.

**Example:**
> **Technology:** Redis Cluster with 3 nodes
>
> **Pattern:** Cache-aside with lazy loading
>
> **TTL:** 1 hour for hot data, 24 hours for static
>
> **Eviction:** LRU with maxmemory-policy allkeys-lru
>
> **Monitoring:** Prometheus + Grafana, alerts on hit rate < 80%

**For whom:** developers, architects, DevOps

**What matters:** technical details, configuration, monitoring, potential issues.

## Use Analogies

Complex concepts through simple analogies:

### Microservices

**Bad:** "We split the monolith into microservices with independent deployment"

**Good:** "Previously all code was in one building. If something broke, everything fell. Now each function is a separate building. If one falls, the rest work."

### Caching

**Bad:** "Using in-memory key-value store to reduce latency"

**Good:** "Imagine a library. Going to the archive every time is slow. We keep popular books at the desk — quick access."

### Race Condition

**Bad:** "Concurrent access to shared memory without synchronization"

**Good:** "Two people simultaneously edit a document. One saves, the second saves — the first person's changes are lost."

## Visualization

A picture is worth a thousand words:

### Before optimization

```sh
User → API → Database (5 seconds)
```

### After optimization

```sh
User → API → Cache (100ms) ✓
           ↓
       Database (only on miss)
```

## Avoid Jargon

Replace technical terms with understandable ones:

| Jargon               | Clear Explanation            |
| -------------------- | ---------------------------- |
| latency              | response time                |
| scalability          | ability to grow              |
| idempotent           | can be repeated safely       |
| throughput           | requests per second          |
| eventual consistency | data syncs with delay        |
| circuit breaker      | automatic shutdown on errors |

## Explanation Structure

### 1. Context

"Currently we have 10,000 users per day. By year-end we expect 100,000."

### 2. Problem

"Current architecture won't handle such load. Server will crash at 20,000 users."

### 3. Solution

"Need to scale horizontally: add more servers and load balancer."

### 4. Alternatives

"Considered vertical scaling (more powerful server), but it's more expensive and has limits."

### 5. Risks

"Deployment and monitoring will become more complex. Need 2 weeks for setup."

### 6. Success Metrics

"Will be able to handle 200,000 users per day. Response time will stay < 200ms."

## Real-World Examples

### Explaining Architectural Decision

**Bad:**

"We're migrating to event-driven architecture using Apache Kafka as message broker and implementing CQRS pattern with separate read/write models."

**Good:**

"**Problem:** When a user places an order, we need to update inventory, send email, add bonus points. Currently everything happens sequentially — slow and unreliable.

**Solution:** Breaking into independent steps. Order is created quickly, everything else happens in background. If email fails, order isn't canceled.

**Result:** Order created in 100ms instead of 2 seconds. System is more reliable — failure in one part doesn't break everything."

### Explaining a Bug

**Structure:**

- **What broke:** Users couldn't log into the system
- **Who was affected:** 500 users, 2 hours downtime
- **Why it happened:** Database filled up, new sessions couldn't be created
- **How we fixed it:** Cleaned old sessions, increased space
- **How to prevent:** Added auto-cleanup and disk space monitoring

## Communication in Code

### Comments

**Bad:**

```sh
// Increment counter
counter++
```

**Good:**

```sh
// Track failed login attempts for rate limiting.
// After 5 attempts, user is locked for 15 minutes.
failedAttempts++
```

### Commit Messages

**Bad:**

```sh
fix bug
```

**Good:**

```sh
Fix race condition in user session cleanup

Problem: Multiple goroutines could delete the same session,
causing panic.

Solution: Added mutex to synchronize access.

Impact: Eliminates crashes during high load.
```

## Documentation

### README Structure

```markdown
# Project Name

## What is this
One sentence about purpose.

## Why it's needed
What problem it solves.

## Quick Start
Minimum commands to run.

## How it works
High-level architecture.

## Usage Examples
Real scenarios.
```

### ADR (Architecture Decision Record)

Document architectural decisions:

- **Title:** Brief decision name
- **Context:** Situation when decision was made
- **Decision:** What exactly was decided
- **Rationale:** Why this option was chosen
- **Consequences:** What will be the pros and cons

## Presentations

### Slide Structure

- **Title:** One thought
- **Visualization:** Diagram or chart
- **Text:** Maximum 3 points

**Bad:** 20 lines of code on a slide

**Good:** Key line + explanation

### Demo

Effective demonstration structure:

1. **Show the problem:** How it works now
2. **Before changes:** Slow, inconvenient
3. **After changes:** Fast, convenient
4. **Metrics:** Specific improvement numbers

## Working with Non-Technical People

### Managers Want to Know

- **When it will be ready:** Timeline and milestones
- **How much it costs:** Budget and resources
- **What can go wrong:** Risks and plan B
- **How it affects business:** Metrics and KPIs

### Product Managers Want to Know

- **How it affects users:** UX and functionality
- **What features it unlocks:** New capabilities
- **What we can't do:** Limitations and trade-offs

## Feedback

### Giving Feedback

**Bad:** "This code is bad"

**Good:**

- **Observation:** "This function does 3 things"
- **Impact:** "Hard to test and maintain"
- **Suggestion:** "Split into 3 functions"
- **Example:** Show how it could look

### Receiving Feedback

1. **Listen, don't interrupt**
2. **Clarify if unclear:** "Can you show an example?"
3. **Thank them** for time and attention
4. **Think before defending:** Give yourself 24 hours

## Practical Exercises

### Exercise 1: Explain to Grandma

Choose a complex concept. Explain it so someone without technical background understands.

### Exercise 2: Elevator Pitch

30 seconds to explain your project. No technical terms.

### Exercise 3: Diagram

Draw system architecture. If it takes more than 5 minutes to explain — simplify.

## Conclusion

Technical communication is:

- Starting with the problem, not technology
- Adapting detail level to audience
- Using analogies and visualization
- Avoiding jargon
- Structuring explanation

**Remember:**

Good code + bad communication = bad result

Average code + good communication = good result

Learn to explain. It's more important than you think.

## Additional Resources

- [The Art of Explanation by Lee LeFever](https://www.amazon.com/Art-Explanation-Simple-Complicated-Things/dp/1118374584)
- [Made to Stick by Chip Heath & Dan Heath](https://www.amazon.com/Made-Stick-Ideas-Survive-Others/dp/1400064287)
- [Resonate by Nancy Duarte](https://www.amazon.com/Resonate-Present-Visual-Stories-People/dp/0470632011)
