---
azemark: 2
title: Unsafe links and raw HTML
---

A [safe link](https://example.com/) followed by an
[unsafe javascript link](javascript:alert(1)) and an
[unsafe data link](data:text/plain,hello).

A fenced code block must not shelter raw HTML:

```
<div>not rendered</div>
```

But a paragraph containing <div>real markup</div> fails.
