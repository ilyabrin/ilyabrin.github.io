---
title: "Multitasking in Linux: Preemptive vs Non-Preemptive"
date: 2025-11-29T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["linux", "operating-systems", "multitasking", "kernel", "scheduling"]
categories: ["Operating Systems"]
---

Multitasking is the operating system's ability to execute multiple tasks simultaneously. But "simultaneously" is an illusion. In reality, the processor switches between tasks so quickly that it creates the impression of parallel work.

Understanding how multitasking works is critical for writing efficient applications and understanding system behavior under load.

<!--more-->

## What is Multitasking

Imagine a chef in a kitchen. He's cooking several dishes: boiling soup, frying meat, baking a pie. He can't do everything at once - he has two hands. But he switches between tasks: stirred the soup, flipped the meat, checked the pie.

The processor works the same way. It executes one task, then switches to another, then to a third. Switching happens so fast (thousands of times per second) that everything seems to work in parallel.

## Two Types of Multitasking

### Non-Preemptive Multitasking (Cooperative Multitasking)

In non-preemptive multitasking, the program itself decides when to give control to other programs. It's like a polite conversation: you speak, then voluntarily stop, giving the floor to another.

**How it works:**

The program executes until it decides to transfer control to the operating system. It can run for a second, a minute, or never give up control at all.

**Problems:**

1. **System freeze** - if one program hangs and doesn't give up control, the entire system stops
2. **Malicious programs** - a program can capture the processor and not release it
3. **No guarantees** - can't guarantee response time

**Historical example:**

Windows 3.1 and Mac OS before version X used non-preemptive multitasking. If a program froze, you had to reboot the entire computer.

**Modern application:**

Today, non-preemptive multitasking is used inside programs for cooperative coroutines (goroutines in Go, async/await in JavaScript), but not at the operating system level.

### Preemptive Multitasking

In preemptive multitasking, the operating system forcibly takes control from a program at certain time intervals. It's like a discussion moderator: you speak, but after a minute the moderator interrupts you and gives the floor to another.

**How it works:**

The operating system uses a timer (usually fires every 1-10 milliseconds). When the timer fires, an interrupt occurs, and the scheduler decides which task to execute next.

**Advantages:**

1. **Responsiveness** - system always responds to user actions
2. **Fairness** - each program gets processor time
3. **Stability** - a hung program doesn't block the entire system
4. **Priorities** - important tasks can get more time

**Linux uses preemptive multitasking.**

## How Preemptive Multitasking Works in Linux

### Time Slice (Quantum)

Each process is allocated a time slice - a period during which it can execute. In Linux, this is usually 1-10 milliseconds.

When the quantum expires, the scheduler:

1. Saves the current process state (registers, instruction counter)
2. Selects the next process to execute
3. Restores the selected process state
4. Transfers control to it

This process is called **context switching**.

### Scheduler

The scheduler is the part of the Linux kernel that decides which process to execute next.

**Selection criteria:**

1. **Priority** - high-priority processes execute more often
2. **Wait time** - processes that waited long get preference
3. **Task type** - interactive tasks (GUI) are more important than background
4. **CPU affinity** - binding to a specific processor core

**Scheduling classes in Linux:**

1. **SCHED_NORMAL** - regular processes (99% of programs)
2. **SCHED_FIFO** - real-time, FIFO queue
3. **SCHED_RR** - real-time, Round-Robin
4. **SCHED_BATCH** - background tasks
5. **SCHED_IDLE** - lowest priority

### Priorities

Linux has two types of priorities:

**Nice value** (-20 to +19):

- -20 - highest priority
- 0 - normal priority
- +19 - lowest priority

Regular users can only lower priority of their processes. Only root can raise it.

**Real-time priority** (1-99):

- Used for real-time tasks
- Priority 99 - highest
- Requires root privileges

### Process States

A process in Linux can be in several states:

1. **Running (R)** - executing or ready to execute
2. **Sleeping (S)** - waiting for event (I/O, signal)
3. **Uninterruptible Sleep (D)** - waiting for I/O, can't be interrupted
4. **Stopped (T)** - stopped (Ctrl+Z)
5. **Zombie (Z)** - terminated, but parent hasn't read status

The scheduler only selects from processes in Running state.

## Why Understanding the Difference Matters

### 1. Application Performance

If your application performs lengthy calculations without context switching, it may appear "frozen" to the user, even if technically working.

**Bad:**

```go
// Blocks thread for 10 seconds
func ProcessData(data []byte) {
    for i := 0; i < 10000000000; i++ {
        // Calculations
    }
}
```

**Good:**

```go
// Periodically yields control
func ProcessData(data []byte) {
    for i := 0; i < 10000000000; i++ {
        // Calculations
        
        if i % 1000000 == 0 {
            runtime.Gosched() // Yield to other goroutines
        }
    }
}
```

### 2. System Responsiveness

Understanding priorities helps properly configure the system. For example, GUI applications should have higher priority than background tasks.

```bash
# Run with low priority
nice -n 19 ./background-task

# Change priority of running process
renice -n 10 -p 1234
```

### 3. Real-Time

For real-time tasks (audio, video, hardware control), it's critical to understand how the scheduler works.

```bash
# Run with real-time priority
chrt -f 50 ./realtime-app
```

### 4. Debugging Issues

When the system "lags", understanding multitasking helps find the cause:

```bash
# View CPU load by process
top

# View context switches
vmstat 1

# View process priorities
ps -eo pid,ni,pri,comm
```

## Multi-core and Multitasking

On a multi-core processor, multiple tasks truly execute simultaneously - each core works independently.

**But:**

If you have 4 cores and 100 processes, the scheduler still switches them on each core.

**Important concepts:**

1. **CPU affinity** - binding process to specific core
2. **Load balancing** - distributing load between cores
3. **Cache locality** - process works better on the same core

```bash
# Bind process to cores 0 and 1
taskset -c 0,1 ./my-app

# See which core process runs on
ps -eo pid,psr,comm
```

## Practical Tips

### 1. Don't Block Main Thread

In GUI applications, execute lengthy operations in background threads.

### 2. Use Correct Priorities

- Interactive tasks - normal or elevated priority
- Background tasks - lowered priority
- Real-time tasks - SCHED_FIFO or SCHED_RR

### 3. Minimize Context Switches

Frequent context switches reduce performance. Group work into batches.

### 4. Consider NUMA

On servers with multiple processors, memory can be "closer" to some cores and "farther" to others. This affects performance.

```bash
# View NUMA topology
numactl --hardware

# Run on specific NUMA node
numactl --cpunodebind=0 --membind=0 ./my-app
```

## Conclusion

Multitasking in Linux is preemptive multitasking, where the operating system forcibly switches processes.

**Key points:**

1. **Preemptive multitasking** ensures responsiveness and stability
2. **Scheduler** decides which process to execute
3. **Priorities** affect processor time distribution
4. **Context switching** has overhead
5. **Multi-core** enables true parallelism

Understanding these concepts helps:

- Write more efficient applications
- Properly configure the system
- Debug performance issues
- Work with real-time tasks

Linux provides powerful tools for managing multitasking. Use them wisely.

Additional resources:

- [Linux Kernel Documentation on Scheduling](https://www.kernel.org/doc/html/latest/scheduler/index.html)
- [Understanding Linux Process Scheduling](https://www.linuxjournal.com/article/6100)
- [The Linux Programming Interface by Michael Kerrisk](https://man7.org/tlpi/)
