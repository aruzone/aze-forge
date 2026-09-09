---
azemark: 2
title: Nesting failures
---

Good paragraph.

```js
const noClosingFence = true;
```

Another paragraph before the callouts.

:::: callout
variant: note
----
Nested quote with a bad protocol that must surface with a range
inside the callout:

> [javascript link](javascript:void(0)) inside the nested quote

::::

The next callout never closes:

:::: callout
variant: note
----
too deep without a closing marker
