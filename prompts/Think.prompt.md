# Deep Think & Research Prompt

**⚠️ CRITICAL: THIS FILE IS READ-ONLY ⚠️**
**DO NOT MODIFY THIS PROMPT FILE. It is a template for agent workflows.**
**All work, plans, and context must be saved to AI-Memory/, NOT here.**


## Purpose

This prompt facilitates deep research and analysis **before** planning begins. Use it to thoroughly understand problems, explore solutions, and gather context that will inform the Plan and Execute phases.

**Workflow Integration:**
```
Think (Research & Analysis) → Plan (Breakdown & Tasks) → Execute (Implementation)
                ↓
        Memory Management (Context Storage)
```

---

## Instructions

### Phase 1: Problem Understanding

1. **Define the Challenge**
   - What is the core problem or opportunity?
   - What are the constraints and requirements?
   - What does success look like?

2. **Use #DeepThink for Structured Analysis**
   ```
   #DeepThink analyze <problem statement>
   ```
   - Break down the problem into components
   - Identify assumptions and edge cases
   - Map dependencies and relationships
   - Consider multiple perspectives

3. **Capture Context**
   - Current system state
   - Related decisions from #MemoryManagement
   - Existing patterns from systemPatterns.md
   - Active blockers from activeContext.md

**Memory Action:**
```
aiSkeleton_updateContext "Researching: <problem statement>"
```

---

### Phase 2: Research & Information Gathering

1. **Internal Knowledge Review**
   - Query #MemoryManagement for:
     - Related past decisions (decisionLog.md)
     - Existing system patterns (systemPatterns.md)
     - Previous similar work (progress.md)
     - Product context (productContext.md)

2. **External Research (when needed)**
   ```
   #WebResearch <specific technical query>
   ```
   - Best practices and methodologies
   - Technical documentation
   - Industry standards
   - Common pitfalls and solutions

3. **Code & Library Analysis**
   ```
   #DeepThink analyze codebase for <specific aspect>
   ```
   - Existing implementations
   - Available libraries and tools
   - Integration points
   - Technical debt considerations

**Memory Action:**
```
aiSkeleton_logDecision {
  "decision": "Research findings: <key insights>",
  "rationale": "Context: <research scope>"
}
```

---

### Phase 3: Solution Exploration

1. **Generate Alternatives**
   - Use #DeepThink to explore multiple approaches
   - Consider trade-offs for each option:
     - Complexity vs. maintainability
     - Performance vs. developer experience
     - Short-term vs. long-term benefits
     - Resource requirements

2. **Evaluate Against Criteria**
   - Project constraints (from copilot.instruction.md)
   - Technical stack compatibility
   - Team expertise and capacity
   - Timeline and urgency
   - SEO/Performance requirements (for web projects)

3. **Risk Assessment**
   - Identify potential blockers
   - Consider failure modes
   - Plan mitigation strategies
   - Estimate effort and complexity

**Memory Action:**
```
aiSkeleton_updatePatterns {
  "pattern": "<Pattern Name>",
  "context": "<Pattern Description with trade-offs>"
}
```

---

### Phase 4: Synthesize Research Brief

Create a structured output that Plan.prompt.md can consume:

#### Research Brief Template

```markdown
# Research Brief: <Problem/Feature Name>

## Problem Statement
<Clear description of what needs to be solved>

## Context
- **Related Work:** <Links to past decisions, similar features>
- **Current State:** <System state, existing code>
- **Constraints:** <Technical, business, resource constraints>

## Research Findings

### Approach Options
1. **Option A: <Name>**
   - Description: <What it is>
   - Pros: <Benefits>
   - Cons: <Drawbacks>
   - Effort: <Estimation>

2. **Option B: <Name>**
   - Description: <What it is>
   - Pros: <Benefits>
   - Cons: <Drawbacks>
   - Effort: <Estimation>

### Recommended Approach
<Which option and why>

### Technical Considerations
- **Dependencies:** <Required libraries, services>
- **Integration Points:** <Where this touches existing code>
- **Testing Strategy:** <How to verify>
- **Deployment Impact:** <CI/CD, environment changes>

### Risks & Mitigations
| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| <Risk 1> | High/Med/Low | High/Med/Low | <Strategy> |

## Implementation Readiness

### Prerequisites
- [ ] <Required research complete>
- [ ] <Dependencies identified>
- [ ] <Design decisions made>

### Success Criteria
- [ ] <Measurable outcome 1>
- [ ] <Measurable outcome 2>

### Next Steps for Planning
1. <High-level step 1>
2. <High-level step 2>

## References
- <Links to documentation>
- <Related GitHub issues>
- <Research sources>
```

**Memory Actions:**
```
aiSkeleton_updateProjectBrief "<Research brief content>"
aiSkeleton_updateProgress "Next: Plan implementation of <feature>"
```

---

### Phase 5: Handoff to Planning

1. **Validate Research Completeness**
   - [ ] Problem clearly defined
   - [ ] Multiple options explored
   - [ ] Recommended approach justified
   - [ ] Risks identified and mitigated
   - [ ] Technical details documented
   - [ ] Success criteria defined

2. **Update Memory Management**
   ```
   aiSkeleton_updateContext "Ready to plan: <feature name>"
   aiSkeleton_updateProgress "Done: Research for <feature>; Next: Create implementation plan"
   ```

3. **Transition to Plan.prompt.md**
   - Use the Research Brief as input
   - Reference the recommended approach
   - Break down into actionable steps
   - Create #todos based on implementation readiness

---

## Deep Think Integration Patterns

### For Architecture Decisions
```
#DeepThink analyze architecture for <feature>
- Consider: scalability, maintainability, performance
- Review: existing patterns in systemPatterns.md
- Validate: against project constraints
```

### For Problem Decomposition
```
#DeepThink break down <complex problem>
- Identify: core components
- Map: dependencies and relationships
- Find: potential bottlenecks
```

### For Code Analysis
```
#DeepThink analyze codebase
- Focus: <specific module or pattern>
- Look for: duplication, complexity, patterns
- Suggest: refactoring opportunities
```

---

## Web Research Integration Patterns

### For Technology Selection
```
#WebResearch best practices for <technology/pattern>
- Compare: alternatives and trade-offs
- Review: community adoption and support
- Check: compatibility with Next.js 15.x
```

### For SEO & Performance
```
#WebResearch SEO optimization for <specific aspect>
- Focus: Core Web Vitals, local SEO
- Target: Toronto/GTA market
- Consider: Cloudflare edge optimization
```

### For Standards & Compliance
```
#WebResearch schema.org LocalBusiness requirements
- Validate: required fields
- Check: best practices
- Review: examples and implementations
```

---

## Integration with Other Prompts

### → Plan.prompt.md
- Input: Research Brief
- Use: Recommended approach as foundation
- Reference: Technical considerations for task breakdown

### → Execute.prompt.md
- Input: Implementation plan from Plan.prompt.md
- Reference: Success criteria from research
- Follow: Technical patterns documented

### → GH-Actions.prompt.md
- Reference: Deployment considerations from research
- Use: Risk mitigations for CI/CD issues
- Apply: Testing strategies identified

### → Checkpoint.prompt.md
- Document: Research decisions in decisionLog.md
- Update: System patterns discovered
- Track: Research → Plan → Execute flow

---

## Example: Feature Research Flow

**Scenario:** Add image gallery with Cloudflare R2 integration

### 1. Problem Understanding
```
#DeepThink analyze "Image gallery with R2 fallback requirements"
```

**Output:**
- Need: Portfolio image gallery
- Constraint: Cloudflare R2 for storage
- Requirement: Fallback to local for dev
- Success: Fast load, lazy loading, responsive

### 2. Research
```
aiSkeleton_updateContext "Query image optimization patterns"
#WebResearch "Next.js image optimization with Cloudflare R2"
```

**Findings:**
- next/image supports custom loaders
- R2 requires authentication setup
- Fallback can use public folder
- Consider: image transformations

### 3. Solution Exploration
```
#DeepThink compare approaches
```

**Options:**
1. Direct R2 integration with signed URLs
2. Cloudflare Images service
3. Hybrid approach (R2 + local fallback)

**Recommendation:** Hybrid (documented in systemPatterns.md)

### 4. Research Brief
```
aiSkeleton_updatePatterns {
  "pattern": "R2 Image Gallery",
  "context": "Loader implementation, Fallback strategy, Environment configuration, Testing approach"
}
```

**Pattern documented with:**
- Loader implementation
- Fallback strategy
- Environment configuration
- Testing approach

### 5. Handoff to Planning
```
aiSkeleton_updateProgress "Done: R2 gallery research; Next: Plan implementation"
```

**Plan.prompt.md receives:**
- Clear implementation approach
- Technical requirements
- Success criteria
- Risk mitigations

---

## Best Practices

1. **Start Small, Think Deep**
   - Don't over-research simple problems
   - Use #DeepThink for complexity assessment first
   - Scale research effort to problem scope

2. **Leverage Memory**
   - Always check existing decisions
   - Build on documented patterns
   - Avoid re-researching solved problems

3. **Document as You Go**
   - Update `aiSkeleton_*` tools throughout research
   - Don't wait until the end
   - Capture insights when fresh

4. **Keep It Actionable**
   - Research should lead to clear decisions
   - Avoid analysis paralysis
   - Time-box research phases

5. **Integrate Tools Wisely**
   - Use #DeepThink for structured analysis
   - Use #WebResearch for external validation
   - Use `aiSkeleton_*` tools for memory persistence

---

## Validation Checklist

Before moving to Plan.prompt.md:

- [ ] Problem is clearly understood
- [ ] Multiple solutions have been explored
- [ ] A recommended approach is justified
- [ ] Technical details are documented
- [ ] Risks are identified with mitigations
- [ ] Success criteria are defined
- [ ] Research is saved via `aiSkeleton_*` tools
- [ ] activeContext.md reflects current state
- [ ] Relevant patterns added to systemPatterns.md
- [ ] Decision logged in decisionLog.md

---

*Research deeply, plan thoroughly, execute confidently.*
