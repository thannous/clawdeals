---
name: tailwind-design-system
description: Build scalable design systems with Tailwind CSS v4, design tokens, component libraries, and responsive patterns. Use when creating component libraries, implementing design systems, or standardizing UI patterns.
---

# Tailwind Design System (v4)

Build production-ready design systems with Tailwind CSS v4, including CSS-first configuration, design tokens, component variants, responsive patterns, and accessibility.

> **Note**: This skill targets Tailwind CSS v4 (2024+). For v3 projects, refer to the [upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

## When to Use This Skill

- Creating a component library with Tailwind v4
- Implementing design tokens and theming with CSS-first configuration
- Building responsive and accessible components
- Standardizing UI patterns across a codebase
- Migrating from Tailwind v3 to v4
- Setting up dark mode with native CSS features

## Key v4 Changes

| v3 Pattern                            | v4 Pattern                                                            |
| ------------------------------------- | --------------------------------------------------------------------- |
| `tailwind.config.ts`                  | `@theme` in CSS                                                       |
| `@tailwind base/components/utilities` | `@import "tailwindcss"`                                               |
| `darkMode: "class"`                   | `@custom-variant dark (&:where(.dark, .dark *))`                      |
| `theme.extend.colors`                 | `@theme { --color-*: value }`                                         |
| `require("tailwindcss-animate")`      | CSS `@keyframes` in `@theme` + `@starting-style` for entry animations |

## Quick start

Read the [token example](./references/quick-start.md) when establishing a new theme. Preserve existing tokens for focused changes.

## Core Concepts

### 1. Design Token Hierarchy

```
Brand Tokens (abstract)
    └── Semantic Tokens (purpose)
        └── Component Tokens (specific)

Example:
    oklch(45% 0.2 260) → --color-primary → bg-primary
```

### 2. Component Architecture

```
Base styles → Variants → Sizes → States → Overrides
```

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.
