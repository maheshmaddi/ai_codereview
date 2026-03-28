---
description: Analyze requirement document and generate clarifying architecture questions
agent: codereview-analyzer
subtask: false
---

You are analyzing a software requirement to prepare for architecture planning.

## Input

The caller provides a JSON argument with:
- `featureId`: unique feature identifier
- `featureName`: human-readable feature name
- `requirement`: text content of the requirement document

## Task

1. Read the requirement document content provided in the arguments.
2. Analyze the requirement for:
   - Functional requirements and use cases
   - Non-functional requirements (performance, security, scalability)
   - Integration points with existing systems
   - Data storage and retrieval needs
   - Authentication and authorization requirements
   - Error handling and edge cases
3. Generate 5-8 targeted clarifying questions that would help create a comprehensive architecture plan.

## Output

Write a JSON file called `architecture_questions.json` in the current directory with this structure:

```json
{
  "featureId": "<from-input>",
  "questions": [
    {
      "id": 1,
      "question": "What authentication mechanism should be used?",
      "category": "security",
      "priority": "high"
    }
  ]
}
```

## Guidelines for Questions

- Ask about ambiguous requirements that could be implemented multiple ways
- Cover security, performance, scalability, and integration concerns
- Ask about expected load and data volume where relevant
- Clarify backward compatibility requirements
- Ask about technology preferences or constraints
- Each question should be specific enough that the answer directly informs architecture decisions

**All output files are created in the current working directory.**
**DO NOT modify any files in the project repository.**
