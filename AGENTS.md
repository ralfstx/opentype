# OpenType Font Library - Agents Guide

This document provides guidance for AI agents working on this TypeScript
OpenType font library.

## Project Purpose

The library is designed mainly for the purpose of using fonts in PDF
documents, which requires handling font metrics, including kerning, text
layout, and font subsetting.

- **Metrics Extraction**: Access horizontal metrics (hmtx), vertical
  metrics, and font-level metrics (head, hhea, maxp)
- **Kerning & Positioning**: Read GPOS tables for pair positioning and
  single adjustments
- **Text Layout**: Support for GSUB (ligature substitution) and advanced
  typography
- **Font Subsetting**: Build subset fonts containing only required
  glyphs and tables for embedding in PDF documents

## Project Architecture

### Module Structure

The codebase is organized into these main directories:

- `src/` – Utilities and shared types used across modules.
- `src/tables/` – Individual font table implementations.
- `src/tables/common/` – Shared subtable implementations.

### Core Infrastructure

- `src/data-reader.ts`: Binary reading with position tracking
- `src/data-writer.ts`: Binary writing with dynamic buffer growth
- `src/font.ts`: Main Font class, parses SFNT structure
- `src/font-builder.ts`: Builds new font files from tables
- `src/font-tables.ts`: Lazy table loading facade
- `src/table-builder.ts`: Abstract base for table builders

## Key Patterns

### Reading Tables

```typescript
// Tables use static factory + private constructor
const table = HeadTable.read(dataView);

// Dependent tables require other tables
const loca = LocaTable.read(data, head, maxp);
const glyf = GlyfTable.read(data, maxp, loca);
```

### Building Tables

```typescript
// Builders extend TableBuilder
const headBuilder = new HeadTableBuilder(existingHeadTable);
headBuilder.unitsPerEm = 1000;

// Font assembly
const fontBuilder = new FontBuilder();
fontBuilder.addTable(headBuilder);
fontBuilder.addTable(hheaBuilder);
const fontData = fontBuilder.build(); // Returns DataView
```

## Coding Conventions

### TypeScript Standards

Always use strict typing, avoid the use of `any`.
Prefer readonly where applicable.
Prefer type aliases over interfaces.

Use async/await—avoid raw Promises where possible, avoid promise chains.

Only use TypeScript features that support type stripping.

Order functions so that called functions appear after their callers.
This helps keeping the relevant code in view when reading from top to
bottom.

### Naming Conventions

- PascalCase for classes, types.
- camelCase for variables, functions.
- UPPER_SNAKE_CASE for constants and env keys.
- File naming: kebab-case (`data-reader.ts`).
- Private fields use `#` prefix (e.g., `#pages`, `#nextObjectNumber`).

### Import Conventions

- Always include `.ts` extension in imports (for Deno compatibility).
- Use inline type imports: `import { type Foo } from './file.ts'`.
- Imports are sorted automatically by `simple-import-sort`.
- No default exports allowed (`import/no-default-export` rule).

### Error Handling

Use try/catch for async operations that may fail.

Do not try to stringify errors, add them as causes to new Error objects
instead.

Use graceful degradation: one tenant failure doesn't stop others.
Collect all outcomes for final reporting.

## Tools and Development Workflow

### Linting / Formatting

Prettier is used to enforce the code formatting.

Run `npm run lint` before committing.
Run `npm run format` to auto-format code.

### Testing

Vitest is used for testing.

Tests are located alongside source files in the `src/` folder.
Test files are named with `.test.ts` suffix (e.g., `data-reader.test.ts`).

Use expect assertions to verify behavior.

Run `npm test` to execute tests.

**Test patterns**:

- Use `describe` blocks to group related tests, often by method name.
- Prefer `it` for individual test cases with descriptive names.
- Use the arrange-act-assert pattern within tests.
- Test both valid inputs and error cases.

Example test structure:

```typescript
import { describe, expect, it } from 'vitest';
import { write } from './test-utils.ts';

describe('DataReader', () => {
  describe('constructor', () => {
    it('initializes position to zero', () => {
      const data = fromHexString('01 02 03');

      const reader = new DataReader(data);

      expect(reader.position).toBe(0);
    });
  });
});
```

### Commit Messages

Follow these guidelines when writing commit messages:

### Format

```
<gitmoji> <summary>

[body]
```

### Gitmojis

- ✨: Use for a commit that adds a new feature
- 🐛: Use for a commit that fixes a bug
- 📝: Use for a commit that only changes documentation
- ♻️: Use for a commit that refactors code and neither fixes a bug nor adds a feature
- ⚡: Use for a commit that improves performance

### Summary

- Use imperative mood ("add feature" not "added feature").
- Capitalize the first letter.
- No period at the end.
- Keep it concise but descriptive.

### Body (optional)

- Start with the problem or requirement that motivated the change.
- Then describe what this commit does to address it.
- Explain what and why, not how.
- Focus on the effective change, only mention technical details when they are relevant.
- Use markdown formatting: wrap code identifiers, permissions, role names,
  API endpoints, file names, and technical terms in backticks.
- Write complete sentences.
- Do not use bullet points.
- Wrap at 72 characters.
- Use blank line to separate from header.
