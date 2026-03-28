---
description: Generate detailed architecture plan with Mermaid diagrams
agent: codereview-analyzer
subtask: false
---

You are generating a comprehensive architecture plan based on requirements and Q&A answers.

## Input

The caller provides a JSON argument with:
- `featureId`: unique feature identifier
- `featureName`: human-readable feature name
- `requirement`: text content of the requirement document
- `qa`: Q&A context in "Q1: ...\nA1: ..." format

## Task

Generate a detailed architecture plan document that covers:

### 1. Overview
- Feature summary and goals
- Scope and boundaries

### 2. Component Design
- List of new components/services needed
- Responsibilities of each component
- Component interaction patterns

### 3. Data Flow
- Sequence diagrams using Mermaid notation
- Request/response flows
- Event flows if applicable

### 4. API Design
- New endpoints needed
- Request/response schemas
- Authentication requirements per endpoint

### 5. Data Model
- New database tables or schema changes
- Relationships between entities
- Indexing strategy

### 6. Security Considerations
- Authentication and authorization approach
- Input validation strategy
- Data protection measures

### 7. Performance Considerations
- Caching strategy
- Query optimization
- Scalability approach

### 8. State Management
- State diagram using Mermaid notation
- State transitions and triggers

### 9. Dependencies
- New external dependencies
- Impact on existing modules

### 10. Implementation Notes
- Suggested implementation order
- Risk areas that need extra attention

## Output

Write `architecture_plan.md` in the current directory containing the full plan with embedded Mermaid code blocks.

Write `architecture_diagrams.json` containing an array of Mermaid diagram strings:
```json
{
  "featureId": "<from-input>",
  "diagrams": ["sequenceDiagram\n  ...", "stateDiagram-v2\n  ..."]
}
```

## Mermaid Diagram Guidelines
- Use `sequenceDiagram` for request/response flows
- Use `stateDiagram-v2` for state management
- Keep diagrams readable (max 10-12 participants/states)
- Include clear labels on all connections

**All output files are created in the current working directory.**
**DO NOT modify any files in the project repository.**
