# AGENTS.md - Project Constitution

## 1. Project Purpose
<!-- Why this codebase exists, in one paragraph[cite: 1]. -->
This repository serves as a solid development foundation adopting the Spec-Driven Development (SDD) methodology. The goal is to ensure all feature development is guided by rigorous specifications before writing any code, reducing ambiguity and increasing software quality.

## 2. Tech Stack
<!-- Languages, frameworks, runtime targets[cite: 1]. -->
- **Language:** TypeScript (Strict Mode) / Node.js
- **Testing Framework:** Jest / Vitest
- **Code Quality:** ESLint & Prettier
- **Database / Infrastructure:** [Define per project, e.g., PostgreSQL / Docker]

## 3. Directory Conventions
<!-- Where code, specs, and tests live[cite: 1]. -->
- `/docs/canonical/`: Contains the project's long-term memory, global rules, and architectural decisions[cite: 1].
- `/docs/work-tracks/`: Macro vision of large development initiatives (Epics)[cite: 1].
- `/docs/work-items/`: Atomic tasks ready for execution[cite: 1].
- `/docs/work-specs/`: The detailed technical plan explaining the "how" before coding[cite: 1].
- `/src/`: Production code.
- `/tests/`: Test framework that defines the expected system behavior.

## 4. How Our Tooling Works
<!-- Commands, templates, schemas the agent needs to know[cite: 1]. -->
You must use the following tools to autonomously validate your work in a self-healing loop[cite: 1]:
- `npm run typecheck`: Runs structural type validation to catch errors before code runs[cite: 1].
- `npm run lint`: Validates code style and catches common bug patterns[cite: 1].
- `npm run test`: Runs unit and integration tests (pass/fail signal)[cite: 1].

## 5. Hard Rules
<!-- Security, data handling, naming, branch policy. Things that must never be broken[cite: 1]. -->
- **Strict TDD:** You must first write a failing test (Red) that encodes the acceptance criterion, before writing the minimum amount of code to make it pass (Green)[cite: 1].
- **Data Security:** Never hardcode API keys, secrets, or sensitive data. Always use environment variables.
- **Branching Policy:** Never make changes directly to the `main` branch. Every feature must be developed in isolation on a branch created from the `work-item` ID.
- **Database Protection:** You are strictly forbidden from deleting schemas, tables, or data volumes without written human confirmation.

## 6. References
<!-- Pointers to the four artefact folders[cite: 1]. -->
- Your implementation plans must be based on the templates stored in `/docs/work-specs/templates/`.