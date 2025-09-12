---
title: "Project Crisis: How Not to Panic and What to Do"
date: 2025-09-05T15:00:00+01:00

author: "Ilya Brin"
categories: ['management', 'crisis-management', 'project-management']
tags: ['crisis-management', 'project-management', 'leadership', 'problem-solving', 'team-management', 'emergency-response']
---

Hey captain! 🚨

**Project is on fire**, deadline in a week, but only 30% is ready? Key developer got sick, production crashed, and the client demands explanations?

**Project crisis** is not the end of the world. It's a **test of professionalism**. Right actions in the first hours of crisis determine whether it becomes a **catastrophe** or **valuable experience**.

Let's break down the **step-by-step algorithm** for crisis management in IT projects 🚀

<!--more-->

## 1. Anatomy of IT project crisis

### What is a project crisis

**Crisis** is a situation where **current processes** cannot ensure **achievement of project goals** within established deadlines with available resources.

**Key signs of crisis:**

- Threat of missing deadlines
- Budget overrun by 20%+
- Loss of key participants
- Critical technical problems
- Client/stakeholder dissatisfaction

### Types of IT crises

**🔥 Technical crisis**

```
Examples:
- Architecture doesn't scale
- Critical bug in production
- Database can't handle load
- External API integration broke
```

**🔥 Resource crisis**

```
Examples:
- Key developer quit
- Budget exhausted at 60% of project
- No access to necessary tools
- Team overloaded with other tasks
```

**🔥 Communication crisis**

```
Examples:
- Client drastically changed requirements
- Conflict between teams
- Lost contact with key stakeholders
- Wrong understanding of tasks
```

**🔥 Time crisis**

```
Examples:
- Deadline moved a month earlier
- Scope doubled
- Dependent projects delayed
- Critical path blocked
```

## 2. First 60 minutes: response algorithm

### Step 1: Stop-pause (5 minutes)

```go
func HandleCrisis() {
    // DON'T PANIC!
    takeDeepBreath()
    
    // Gather basic facts
    facts := gatherInitialFacts()
    
    // Assess scale
    severity := assessSeverity(facts)
    
    if severity == CRITICAL {
        activateEmergencyProtocol()
    }
}
```

**Questions for quick assessment:**

- What exactly happened?
- When did this occur?
- Who was affected?
- Which systems are impacted?
- Is there immediate threat?

### Step 2: Assemble team (15 minutes)

**Who to gather:**

```markdown
**Mandatory:**
- Project tech lead
- Person responsible for problem area
- Product Owner/client
- DevOps (if infrastructure issue)

**As needed:**
- Senior developers
- QA lead
- System architect
```

**Emergency call format:**

```
Subject: URGENT - Project X crisis
Time: Now, 15 minutes
Goal: Situation assessment and action plan
```

### Step 3: Damage assessment (20 minutes)

**Crisis assessment matrix:**

| Criteria             | Low       | Medium         | High             | Critical            |
| -------------------- | --------- | -------------- | ---------------- | ------------------- |
| Deadline impact      | <1 day    | 1-3 days       | 1-2 weeks        | >2 weeks            |
| Financial damage     | <$1K      | $1K-10K        | $10K-100K        | >$100K              |
| Reputation risk      | Internal  | Client unhappy | Public criticism | Client loss         |
| Technical complexity | Quick fix | Refactoring    | Rewriting        | Architecture change |

### Step 4: Initial stabilization (20 minutes)

```go
type CrisisResponse struct {
    ImmediateActions []Action
    Workarounds     []Solution
    Communication   []Message
}

func (cr *CrisisResponse) Stabilize() {
    // 1. Stop the bleeding
    cr.stopImmediateDamage()
    
    // 2. Temporary solutions
    cr.implementWorkarounds()
    
    // 3. Notify stakeholders
    cr.notifyStakeholders()
}
```

**Examples of immediate actions:**

- Rollback problematic deployment
- Switch traffic to backup server
- Block problematic functionality
- Activate plan B

## 3. Deep analysis and planning

### Root Cause Analysis (RCA)

**"5 Whys" technique:**

```
Problem: Production is down
Why? Server not responding
Why? Out of memory
Why? Memory leak in new code
Why? Database connections not closing
Why? Forgot to add defer conn.Close()
```

**Fishbone diagram for IT:**

```sh
                    Problem
                       |
    People -------|      |      |------- Processes
                 |      |      |
                 |   CRISIS    |
                 |      |      |
    Technology --|      |      |------- Environment
                        |
```

### Solution options evaluation

```go
type Solution struct {
    Name        string
    TimeToFix   time.Duration
    Cost        int
    Risk        int
    Impact      int
    Probability float64
}

func (s Solution) Score() float64 {
    return float64(s.Impact) * s.Probability / 
           (float64(s.Cost + s.Risk) * s.TimeToFix.Hours())
}

func chooseBestSolution(solutions []Solution) Solution {
    best := solutions[0]
    for _, solution := range solutions {
        if solution.Score() > best.Score() {
            best = solution
        }
    }
    return best
}
```

## 4. Recovery plan

### Crisis response plan structure

```markdown
# Crisis Response Plan for Project X

## 1. Crisis brief description
- What: Critical bug in payment system
- When: January 15, 2025 2:30 PM
- Impact: 100% users cannot make payments

## 2. Immediate actions (completed)
- [x] Rollback to previous version
- [x] User notification
- [x] Backup payment system activation

## 3. Short-term actions (24 hours)
- [ ] Bug fix in code
- [ ] Testing on staging
- [ ] Hotfix release preparation

## 4. Medium-term actions (1 week)
- [ ] Full payment system testing
- [ ] Monitoring updates
- [ ] Incident documentation

## 5. Long-term actions (1 month)
- [ ] Testing process improvement
- [ ] Additional checks implementation
- [ ] Team training
```

### Crisis resource management

**Team reallocation:**

```go
type TeamReallocation struct {
    CrisisTeam    []Developer // Work only on crisis
    SupportTeam   []Developer // Support current tasks
    BackupTeam    []Developer // Ready to join
}

func (tr *TeamReallocation) OptimizeForCrisis() {
    // Best developers on crisis
    tr.CrisisTeam = selectTopPerformers(allDevelopers)
    
    // Others maintain minimum
    tr.SupportTeam = selectForMaintenance(remainingDevelopers)
    
    // Reserve for escalation
    tr.BackupTeam = getExternalContractors()
}
```

## 5. Crisis communication

### Communication matrix

| Audience   | Frequency     | Channel        | Format          |
| ---------- | ------------- | -------------- | --------------- |
| Client     | Every 2 hours | Email + call   | Status + plan   |
| Team       | Every hour    | Slack          | Brief updates   |
| Management | 2 times/day   | Presentation   | Detailed report |
| Users      | As needed     | Website/social | Apology + ETA   |

### Message templates

**Crisis notification:**

```
Subject: CRITICAL - Payment system issue

What happened: Critical bug discovered in payment system at 2:30 PM
Impact: Users cannot make purchases
What we're doing: Team working on fix, ETA - 2 hours
Temporary solution: Backup payment system activated
Next update: in 2 hours

Contact for questions: [your phone]
```

**Status update:**

```
Crisis update - 4:30 PM

Progress: Bug localized, fix being prepared
Readiness: 80%
New ETA: 6:00 PM
Risks: No critical blockers

What's done:
- Found root cause
- Fix written and tested
- Deployment plan ready

Next steps:
- Final testing (30 min)
- Production deployment (15 min)
- Results monitoring (1 hour)
```

## 6. Crisis management psychology

### Team stress management

```go
type StressManagement struct {
    TeamMorale    int
    WorkloadLevel int
    BurnoutRisk   float64
}

func (sm *StressManagement) MaintainTeamHealth() {
    if sm.BurnoutRisk > 0.7 {
        // Rotate people
        rotateTeamMembers()
        
        // Mandatory breaks
        enforceBreaks()
        
        // Additional support
        providePsychologicalSupport()
    }
}
```

**Crisis work principles:**

- **Short sprints** - maximum 4 hours focus
- **Frequent breaks** - every 2 hours for 15 minutes
- **Role rotation** - nobody works >12 hours straight
- **Positive atmosphere** - celebrate small wins

### Decision making under pressure

**OODA Loop model:**

```
Observe -> Orient -> Decide -> Act -> Repeat
```

**Quick decision criteria:**

1. **Reversibility** - can we roll back?
2. **Speed** - how quickly will we see results?
3. **Risk** - what's the worst that can happen?
4. **Resources** - what does it cost?

## 7. Crisis prevention

### Early warning system

```go
type EarlyWarningSystem struct {
    Metrics     []Metric
    Thresholds  map[string]float64
    Alerts      []Alert
}

func (ews *EarlyWarningSystem) MonitorProject() {
    for _, metric := range ews.Metrics {
        if metric.Value > ews.Thresholds[metric.Name] {
            alert := Alert{
                Level:   WARNING,
                Message: fmt.Sprintf("%s exceeded threshold", metric.Name),
                Action:  "Team attention required",
            }
            ews.sendAlert(alert)
        }
    }
}
```

**Key monitoring metrics:**

- **Team velocity** - 20%+ decrease = red flag
- **Code quality** - bug growth, test coverage drop
- **Technical debt** - accumulation of "quick fixes"
- **Team mood** - retrospective results
- **Scope creep** - requirement changes without plan adjustments

### Crisis contingency planning

**Disaster Recovery Plan:**

```markdown
# Project Recovery Plan

## Crisis scenarios
1. Key developer loss
2. Critical production bug
3. Client requirement changes
4. Technical debt reaches critical mass

## For each scenario:
- Triggers (when to activate)
- Responsible persons
- Action sequence
- Required resources
- Success criteria
```

## 8. Learning from crisis

### Post-mortem analysis

```markdown
# Post-mortem: Payment system crisis

## Event timeline
2:30 PM - Bug discovered
2:35 PM - Team assembled
2:45 PM - Rollback activated
3:30 PM - Root cause found
5:00 PM - Fix ready
6:00 PM - Deployment completed

## What worked well
- Quick problem detection
- Effective client communication
- Rollback plan availability

## What can be improved
- Automate payment testing
- Improve critical path monitoring
- Create more detailed runbooks

## Prevention actions
- [ ] Add integration tests
- [ ] Set up payment anomaly alerts
- [ ] Conduct team training
```

### Process updates

```go
type ProcessImprovement struct {
    LessonsLearned []Lesson
    NewProcedures  []Procedure
    Training       []TrainingModule
}

func (pi *ProcessImprovement) ImplementChanges() {
    for _, lesson := range pi.LessonsLearned {
        procedure := createProcedureFromLesson(lesson)
        pi.NewProcedures = append(pi.NewProcedures, procedure)
    }
    
    // Train team on new procedures
    pi.trainTeam()
}
```

## Conclusion: crisis is an opportunity to become stronger

**Key crisis management principles:**
🚨 **Don't panic** - maintain clear thinking  
⚡ **Act quickly** - first hours are critical  
📢 **Communicate actively** - information reduces panic  
🎯 **Focus on solution** - not on finding blame  
📚 **Learn lessons** - every crisis makes team more experienced  

**Main rule:**
> Crisis is not failure, but a test of professionalism. Teams that can handle crises become stronger and more cohesive.

**Remember:** the best crisis is the one avoided through good planning and monitoring.

**P.S. What crises have you experienced in your projects? How did you handle them? Share your experience!** 🚀

```markdown
# Additional resources:
- "The Phoenix Project" - Gene Kim
- "Site Reliability Engineering" - Google
- "Incident Response" - PagerDuty
- Crisis Management Framework - PMI
```
