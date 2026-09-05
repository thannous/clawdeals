---
title: React 19 API Changes
impact: MEDIUM
impactDescription: cleaner component definitions and context usage
tags: react19, refs, context, hooks
---

## React 19 API Changes

> **⚠️ React 19+ only.** Skip this if you're on React 18 or earlier.

In React 19, `ref` can be a regular prop. Both `useContext(Context)` and `use(Context)` are supported for reading context; use the form that fits the code. Do not migrate working code solely to replace a supported API.

**Existing forwardRef form:**

```tsx
const ComposerInput = forwardRef<TextInput, Props>((props, ref) => {
  return <TextInput ref={ref} {...props} />
})
```

**Correct (ref as a regular prop):**

```tsx
function ComposerInput({ ref, ...props }: Props & { ref?: React.Ref<TextInput> }) {
  return <TextInput ref={ref} {...props} />
}
```

**Supported: useContext:**

```tsx
const value = useContext(MyContext)
```

**Alternative: use(Context):**

```tsx
const value = use(MyContext)
```

`use()` can also be called conditionally, unlike `useContext()`.
