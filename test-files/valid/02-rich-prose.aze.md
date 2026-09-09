---
azemark: 2
title: Rich prose sampler
author:
  - Test Author
theme: default
outputs:
  - html
---

# Rich prose

This paragraph has *emphasis*, **strong** text, and `inline code`.
It also keeps a [safe https link](https://example.com/docs), a
[mail alias](mailto:someone@example.com), a [fragment link](#hard-breaks),
and an <https://autolink.example.com> style autolink.

## Hard breaks

Line one ends with two spaces  
so this line is a hard break sibling.

Line one ends with a backslash\
and continues here.

## Containers

> A blockquote with **bold** and a nested list:
>
> - nested item one
> - nested item two
>
> > A quote inside the quote.

- unordered item
- another unordered item

1. ordered item
2. second ordered item

---

## Code

```python
def greet(name):
    return f"Hello, {name}!"
```

## Plain GFM table

| material | density | conductivity |
| :--- | :---: | ---: |
| Aluminum | 2700 | 205 |
| Steel | 7850 | 50 |

## Callouts

:::: callout
variant: note
title: Plain note
----
Callout bodies parse ordinary Markdown including *inlines*.

- a list inside the callout
- with a second item

> a blockquote inside the callout
::::

:::: callout
variant: warning
id: careful
title: Nested directive content
----
This callout contains a nested equation directive:

:: equation
id: pythagoras
----
a^2 + b^2 = c^2
::

And it keeps rendering prose after it.
::::

## Captioned table directive

:::: table
caption: Material *properties* with alignment
id: materials
----
columns:
  - key: material
    name: Material
    type: text
  - key: density
    name: Density
    type: quantity
    unit: kg/m^3
  - key: conductivity
    name: Conductivity
    type: quantity
    unit: W/(m K)
rows:
  - material: Aluminum
    density: 2700
    conductivity: 205
  - material: Steel
    density: 7850
    conductivity: 50
  - material: Glass
    density: 2500
    conductivity: 1
::::
