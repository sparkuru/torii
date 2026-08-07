# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Current (Phase 0) |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations | Current (no database; file binding persistence) |
| [Error Handling](./error-handling.md) | Error types, handling strategies | Current (Phase 0) |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Current (Phase 0) |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | Current (stderr-only diagnostics) |
| [Browser Broker Contract](./browser-broker-contract.md) | MCP stdio, loopback WebSocket pairing, and revocation | Current |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
