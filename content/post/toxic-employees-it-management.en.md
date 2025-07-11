---
title: "Toxic Employees in IT: How to Work With Them and When to Fire"
date: 2025-07-03T14:00:00+01:00

author: "Ilya Brin"
categories: ['management', 'hr', 'leadership']
tags: ['toxic-employees', 'team-management', 'hr', 'leadership', 'conflict-resolution', 'team-dynamics', 'management']
---

Hey manager! 👋

Do you have **"that one"** developer on your team? Who is **technically strong** but **poisons the atmosphere**? Demotivates colleagues, sabotages processes, and creates conflicts?

**Toxic employees** aren't just "difficult personalities." They're a **systemic threat** to team productivity. One toxic developer can **reduce the performance** of an entire team by 30-40%.

Let's break down how to **recognize**, **work with**, and **make decisions** about toxic employees in IT 🚀

<!--more-->

## 1. Who is a toxic employee in IT

### Definition of toxicity

A **toxic employee** is someone whose behavior **systematically** harms the team, processes, or product, regardless of their technical skills.

**Key word:** systematically. Having a bad mood once a month ≠ toxicity.

### Types of toxic IT employees

**🔥 "Brilliant Jerk"**

- Technically very strong
- Arrogant, humiliates colleagues
- "I know better than everyone"

**🔥 "The Saboteur"**

- Actively opposes changes
- Undermines management authority
- Spreads negativity in the team

**🔥 "Eternal Victim"**

- Constantly complains
- Nothing satisfies them
- Shifts responsibility to others

**🔥 "Social Parasite"**

- Minimum work, maximum chatter
- Distracts others from tasks
- Creates appearance of being busy

### Signs of toxicity

```markdown
🚩 **Behavioral red flags:**
- Constant criticism without constructive input
- Refusal to accept feedback
- Public humiliation of colleagues
- Sabotage of team decisions
- Spreading rumors and gossip
- Aggressive reaction to criticism
```

## 2. Impact of toxicity on IT teams

### Statistics and research

**Harvard Business School (2015):**

- One toxic employee reduces team productivity by **30-40%**
- Cost of replacing a toxic employee: **$12,800**
- Cost of damage from toxic behavior: **$50,000+**

### Specific consequences in IT

**📉 Decreased productivity:**

```
Normal team: 10 story points/sprint per person
With toxic employee: 6-7 story points/sprint per person
```

**🚪 Staff turnover:**

- 54% of developers quit due to toxic atmosphere
- Good employees leave first

**💸 Financial losses:**

- Decreased code quality
- Increased code review time
- More bugs
- Release delays

### Team emotional burnout

```go
// Toxicity cycle in team
func ToxicCycle(team *Team, toxicEmployee *Employee) {
    for {
        toxicEmployee.CreateConflict()
        team.Morale -= 10
        team.Productivity -= 5
        
        if team.Morale < 20 {
            goodEmployee := team.GetBestEmployee()
            goodEmployee.Quit()
            team.Remove(goodEmployee)
        }
        
        if len(team.Members) < 3 {
            team.Collapse()
            break
        }
    }
}
```

## 3. Diagnosis: how to recognize toxicity

### Objective metrics

**📊 Quantitative indicators:**

```markdown
**Code Review metrics:**
- Review time increased by 50%+
- Number of conflicting comments
- Frequency of PR rejections without explanation

**Team metrics:**
- Decreased meeting participation
- Increased number of escalations
- More complaints from colleagues

**Productivity:**
- Decreased team velocity
- Increased task completion time
- More bugs in toxic employee's code
```

### Qualitative assessment

**🔍 Information gathering methods:**

**1. Anonymous team surveys:**

```markdown
- Are you comfortable working in the team?
- Are there colleagues who interfere with work?
- Would you like to change teams?
```

**2. 360-degree feedback:**

- Colleague opinions
- Subordinate opinions (if any)
- Adjacent team opinions

**3. Behavior observation:**

- Reaction to criticism
- Communication style in Slack/Teams
- Meeting behavior

## 4. Strategies for working with toxic employees

### Step 1: Documentation

**📝 What to record:**

```markdown
**Date:** January 15, 2025
**Incident:** Publicly called colleague's code "shit" in code review
**Witnesses:** 3 developers
**Consequences:** Colleague got upset, refused to participate in project
**Actions:** Had conversation, explained unacceptability of such behavior
```

### Step 2: Direct conversation

**🗣️ Conversation structure:**

```markdown
**1. Facts without emotions:**
"Yesterday in code review you said Alex's code was shit"

**2. Impact on team:**
"After this, Alex got upset and said he doesn't want to work on this project anymore"

**3. Expectations:**
"I expect constructive feedback without insults"

**4. Consequences:**
"If this happens again, we'll move to disciplinary measures"
```

### Step 3: Performance Improvement Plan (PIP)

```markdown
**Performance Improvement Plan**

**Problems:**
- Non-constructive criticism of colleagues' code
- Refusal to participate in team activities
- Negative comments about processes

**30-day goals:**
- All code review comments must be constructive
- Participation in all team meetings
- Proposing solutions instead of just criticism

**Metrics:**
- 0 complaints from colleagues
- 100% meeting participation
- Positive feedback from 3+ colleagues
```

### Step 4: Progress monitoring

```go
type ImprovementPlan struct {
    Employee    string
    StartDate   time.Time
    Duration    time.Duration
    Goals       []Goal
    Metrics     []Metric
    WeeklyCheck []CheckResult
}

func (pip *ImprovementPlan) WeeklyReview() CheckResult {
    result := CheckResult{
        Date: time.Now(),
        GoalsAchieved: 0,
        TotalGoals: len(pip.Goals),
    }
    
    for _, goal := range pip.Goals {
        if goal.IsAchieved() {
            result.GoalsAchieved++
        }
    }
    
    return result
}
```

## 5. When to fire: red lines

### Immediate termination

**🚨 Violations that cannot be corrected:**

- **Harassment** - sexual harassment, discrimination
- **Physical aggression** - threats, violence
- **Sabotage** - intentional code damage, data leaks
- **Fraud** - report falsification, time theft

### Termination after improvement attempts

**📋 Decision criteria:**

```markdown
**Fire if:**
✅ PIP showed no results after 60-90 days
✅ Behavior worsens despite warnings
✅ Other employees started quitting because of toxic colleague
✅ Clients complain about employee behavior
✅ Damage cost exceeds replacement cost

**Don't fire if:**
❌ Problems are only in technical skills (not toxicity)
❌ Employee shows progress in behavior change
❌ Problems caused by external factors (personal issues, illness)
```

### Decision formula

```go
func ShouldFireEmployee(employee *Employee) bool {
    toxicityScore := calculateToxicityScore(employee)
    improvementProgress := employee.PIP.GetProgress()
    teamImpact := calculateTeamImpact(employee)
    
    if toxicityScore > 8 && improvementProgress < 0.3 {
        return true
    }
    
    if teamImpact.TurnoverRate > 0.5 {
        return true
    }
    
    return false
}
```

## 6. Toxic employee termination process

### Preparation for termination

**📋 Checklist:**

```markdown
- [ ] Complete incident documentation collected
- [ ] PIP conducted with clear metrics
- [ ] HR and legal approval obtained
- [ ] Task handover plan prepared
- [ ] Team notified of upcoming changes
- [ ] Answers to possible questions prepared
```

### Termination conversation

**🗣️ Conversation structure:**

```markdown
**1. Straight to the point:**
"We've decided to end our working relationship"

**2. Reasons:**
"Despite the PIP, behavioral issues were not resolved"

**3. Details:**
"Last working day is Friday, severance pay will be..."

**4. Logistics:**
"HR will contact you about handover and equipment return"
```

### Team communication

```markdown
**Team message:**
"John is leaving our team as of Friday. His tasks will be redistributed between Alex and Maria. If you have questions about projects, contact me."

**What NOT to say:**
❌ Reasons for termination
❌ Conflict details
❌ Personal employee assessments
```

## 7. Toxicity prevention

### Hiring: filtering at entry

**🔍 Interview questions:**

```markdown
**Behavioral questions:**
- "Tell me about a conflict with a colleague and how you resolved it"
- "How do you react to criticism of your code?"
- "What do you do if you disagree with the team's technical decision?"

**Red flags in answers:**
- Blaming others for their failures
- Disrespectful reviews of former colleagues
- Unwillingness to admit mistakes
```

### Team culture

**🏗️ Building healthy culture:**

```go
type TeamCulture struct {
    Values          []string
    CodeOfConduct   string
    FeedbackCulture bool
    PsychSafety     float64
}

func (tc *TeamCulture) PreventToxicity() {
    tc.Values = []string{
        "Respect for colleagues",
        "Constructive feedback",
        "Continuous learning",
        "Team success over individual ego",
    }
    
    tc.EstablishFeedbackCulture()
    tc.CreatePsychologicalSafety()
    tc.RegularTeamHealthChecks()
}
```

### Regular checkups

**📊 Team health monitoring:**

```markdown
**Monthly metrics:**
- Team happiness index (1-10)
- Number of conflicts
- Code review time
- Turnover rate

**Quarterly retrospectives:**
- What hinders productivity?
- Are there communication problems?
- How to improve team atmosphere?
```

## 8. Legal aspects

### Employment law considerations

**⚖️ Grounds for termination:**

```markdown
**Common legal grounds:**
- Poor performance after warnings
- Violation of company policies
- Misconduct affecting workplace
- Breach of employment contract

**What's needed for termination:**
- Written warnings
- Documented violations
- Proper procedure followed
```

### Documentation

```markdown
**Required documents:**
1. Incident reports
2. Employee explanations
3. Disciplinary action records
4. Termination notice
5. Final employment records
```

## Conclusion: toxicity is about behavior, not skills

**Key principles:**
🎯 **Act quickly** - toxicity is contagious  
📝 **Document everything** - no facts, no termination  
🤝 **Give a chance** - but not indefinitely  
⚖️ **Be fair** - same rules for everyone  

**Main rule:**
> One toxic employee can destroy a team of 10 people. Better to work with 9 good people than 10 where one is toxic.

**Remember:** firing a toxic employee isn't management failure, it's **team protection**.

**P.S. Have you dealt with toxic colleagues? How did you solve the problem? Share your experience!** 🚀

```markdown
# Additional resources:
- "The No Asshole Rule" - Robert Sutton
- "Crucial Conversations" - Kerry Patterson
- Employment law guidelines
- Harvard Business Review: "How to Deal with a Toxic Employee"
```
