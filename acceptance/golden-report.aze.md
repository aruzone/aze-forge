---
azemark: 2
title: Engineering notation sampler
author:
  - AzeForge acceptance
---

# Engineering notation sampler

Substantive prose on engineering notation with *emphasis*, **strong** text,
and `inline code`. Keep one retained [safe reference](https://example.com/engineering-notation)
for link proof.

Measurement notes:

- inspect the setup before recording
- correct unsafe conditions immediately

## Equations

:::: equation
id: gaussian-integral
number: true
----
integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)
::::

:::: equation
id: arithmetic-series
----
sum i=1..n of i = n (n + 1) / 2
::::

:::: equation
id: heat-equation
----
partial T / partial t = alpha partial^2 T / partial x^2
::::

:::: derivation
id: geometric-series-sum
number: true
----
- expression: S_n = sum i=0..n of r^i
  annotation: partial sum of the first n + 1 powers
- expression: r * S_n = sum i=1..n+1 of r^i
  annotation: multiply every term by r
- expression: S_n - r * S_n = 1 - r^(n+1)
  annotation: subtraction telescopes the interior terms
- expression: S_n = (1 - r^(n+1)) / (1 - r)
  annotation: closed form, valid for r != 1
- expression: limit n->infinity of S_n = 1 / (1 - r)
  annotation: converges when abs(r) < 1
::::

## Response data

:::: plot
id: rc-step-response
number: true
parameters:
  V0: 5
  R: 1000
  C: 1e-6
x-axis:
  label: time (s)
  min: 0
  max: 0.005
y-axis:
  label: voltage (V)
  min: 0
----
- kind: function
  label: analytic step response
  variable: t
  expression: V0 * (1 - exp(-t / (R * C)))
  domain:
    min: 0
    max: 0.005
  samples: 400
- kind: scatter
  label: measured points
  points:
    - x: 0.0005
      y: 1.99
      error: 0.08
    - x: 0.001
      y: 3.11
      error: 0.10
    - x: 0.002
      y: 4.36
      error-low: 0.14
      error-high: 0.09
    - x: 0.003
      y: 4.71
      error: 0.12
::::

:::: chart
id: bench-scores
type: grouped-bar
x-label: suite
y-label: score
----
- label: alpha
  bars:
    - category: parse
      value: 12
      error: 0.5
    - category: render
      value: 19
- label: beta
  bars:
    - category: parse
      value: 9
    - category: render
      value: 22
      error-low: 1
      error-high: 2
::::

## Materials

:::: table
caption: Representative material properties for thermal design
id: materials
----
columns:
  - key: material
    name: Material
    type: text
  - key: density
    name: Density [kg/m^3]
    type: quantity
    unit: kg/m^3
  - key: conductivity
    name: Thermal conductivity [W/(m K)]
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
    conductivity: 1.0
::::

## Safety flow

:::: mermaid
id: safety-flow
title: Measurement safety flow
description: Inspect the setup, correct when unsafe, record, finish
----
flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> safe{Safe?}
  safe -- No --> correct[Correct setup]
  correct --> inspect
  safe -- Yes --> record[Record measurement]
  record --> finish[Finish]
::::

## Timing

The clocked bus transaction exercises native digital timing on both surfaces of
the one shared scale: `clk` carries edge-state runs, `valid` and `ready` are
single-bit handshakes, `addr` presents two bus values after an unknown start,
and `data` shows a bus value with an unknown turnaround and a high-impedance
window. The second figure authors the same transaction with explicit `ns`
durations, so scale independence is visible in one rendered document.

:::: timing
id: clocked-bus-transaction
number: true
title: Clocked bus transaction
description: single handshake
scale: cycles
----
- kind: signal
  ref: clk
  clock: true
  wave: 2p2n2p2n
- kind: signal
  ref: valid
  wave: 00000111
- kind: signal
  ref: ready
  wave: 00000011
- kind: signal
  ref: addr
  width: 8
  wave: x={A5}={A6}.
- kind: signal
  ref: data
  width: 8
  phase: 1
  wave: ={D0}xz.
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@5
  label: t_{su}
::::

:::: timing
id: clocked-bus-transaction-time-scale
number: true
title: Clocked bus transaction time scale
description: single handshake
scale: time
unit: ns
----
- kind: signal
  ref: clk
  clock: true
  intervals:
    - state: rise
      duration: 2
    - state: fall
      duration: 2
    - state: rise
      duration: 2
    - state: fall
      duration: 2
- kind: signal
  ref: valid
  intervals:
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
- kind: signal
  ref: ready
  intervals:
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
- kind: signal
  ref: addr
  width: 8
  intervals:
    - state: unknown
      duration: 1
    - state: bus
      duration: 1
      value: A5
    - state: bus
      duration: 1
      value: A6
    - state: continue
      duration: 1
- kind: signal
  ref: data
  width: 8
  phase: 1
  intervals:
    - state: bus
      duration: 1
      value: D0
    - state: unknown
      duration: 1
    - state: impedance
      duration: 1
    - state: continue
      duration: 1
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@5
  label: t_{su}
::::
## Diagrams

The General diagrams family is authored once per mode on the one shared
node/edge/group/port model. The flowchart is cyclic, the tree is written with
forward references, and the architecture nests groups, names ports and keeps
two undirected parallel edges between the same pair, so every structural
feature the contract admits is visible in one rendered document.

:::: diagram
id: branching-process
number: true
title: Request branching process
mode: flowchart
flow: top-to-bottom
----
- kind: node
  name: start
  label: Start
  shape: circle
- kind: node
  name: classify
  label: Classify request?
  shape: diamond
- kind: node
  name: cache
  label: Serve from cache
- kind: node
  name: origin
  label: Fetch from origin
- kind: node
  name: store
  label: Store result
  shape: cylinder
- kind: edge
  from: start
  to: classify
- kind: edge
  from: classify
  to: cache
  label: hit
- kind: edge
  from: classify
  to: origin
  label: miss
- kind: edge
  from: origin
  to: store
- kind: edge
  from: store
  to: cache
  label: warm
- kind: edge
  from: cache
  to: classify
  label: recheck
::::

:::: diagram
id: compiler-tree
number: true
title: Compiler component tree
mode: tree
flow: top-to-bottom
----
- kind: edge
  from: root
  to: core
- kind: edge
  from: core
  to: parser
- kind: edge
  from: core
  to: renderer
- kind: edge
  from: renderer
  to: svg-writer
- kind: edge
  from: renderer
  to: png-writer
- kind: edge
  from: renderer
  to: pdf-writer
- kind: node
  name: root
  label: Compiler
  shape: rounded
- kind: node
  name: core
  label: Core
- kind: node
  name: parser
  label: Parser
- kind: node
  name: renderer
  label: Renderer
- kind: node
  name: svg-writer
  label: SVG writer
- kind: node
  name: png-writer
  label: PNG writer
- kind: node
  name: pdf-writer
  label: PDF writer
  shape: parallelogram
  parent: printing
- kind: group
  name: printing
  label: Printing
::::

:::: diagram
id: service-architecture
number: true
title: Service architecture
mode: architecture
flow: left-to-right
----
- kind: group
  name: edge-tier
  label: Edge tier
- kind: group
  name: service-tier
  label: Services
- kind: group
  name: data-tier
  label: Data tier
- kind: group
  name: persistence
  label: Persistence
  parent: data-tier
- kind: node
  name: client
  label: Browser
  parent: edge-tier
- kind: node
  name: gateway
  label: API gateway
  parent: edge-tier
  shape: hexagon
  ports:
    - name: inbound
      side: left
    - name: upstream
      side: right
- kind: node
  name: auth
  label: Auth service
  parent: service-tier
  shape: rounded
  ports:
    - name: api
      side: left
- kind: node
  name: catalog
  label: Catalog service
  parent: service-tier
  shape: rounded
  ports:
    - name: api
      side: left
- kind: node
  name: primary
  label: Primary database
  parent: persistence
  shape: cylinder
- kind: node
  name: replica
  label: Read replica
  parent: persistence
  shape: cylinder
- kind: edge
  from: client
  to: gateway.inbound
- kind: edge
  from: gateway.upstream
  to: auth.api
- kind: edge
  from: gateway.upstream
  to: catalog.api
- kind: edge
  from: auth
  to: primary
  direction: undirected
- kind: edge
  from: catalog
  to: primary
  direction: undirected
- kind: edge
  from: catalog
  to: replica
  direction: undirected
- kind: edge
  from: catalog
  to: replica
  label: fallback
  direction: undirected
::::

## Software and data models

The software and data models family is exercised with two of its four typed
directives. The login exchange opens an activation bar before an `alt` and
releases it inside each division, loops a body that opens and closes its own
bar, and carries a note spanning two lanes. The class hierarchy realizes an
interface through `implementation`, inherits from an abstract class, composes a
line item with multiplicities on both ends, and draws one association with no
arrowhead because navigability was never authored.

:::: sequence
id: login-exchange
number: true
title: Login exchange
----
participants:
  - name: user
    kind: actor
    label: User
  - name: web
    label: Web app
  - name: auth
    label: Auth service
  - name: store
    label: User store
timeline:
  - kind: message
    from: user
    to: web
    text: Submit credentials
    activate: true
  - kind: message
    from: web
    to: auth
    text: Verify session
    activate: true
  - kind: loop
    condition: Retry budget remains
    body:
      - kind: message
        from: auth
        to: store
        text: Load user
        activate: true
      - kind: message
        from: store
        to: auth
        form: return
        text: User record
        deactivate: true
  - kind: alt
    divisions:
      - condition: Credentials valid
        body:
          - kind: message
            from: auth
            to: web
            form: return
            text: Session token
            deactivate: true
          - kind: message
            from: web
            to: user
            form: return
            text: Dashboard
            deactivate: true
      - condition: Credentials rejected
        body:
          - kind: message
            from: auth
            to: web
            form: return
            text: Deny
            deactivate: true
          - kind: message
            from: web
            to: user
            form: return
            text: Sign-in page
            deactivate: true
  - kind: note
    over:
      - auth
      - store
    text: |
      Credentials never reach the user store;
      the auth service holds the hash.
::::

:::: class
id: payment-classes
number: true
title: Payment classes
----
- kind: interface
  name: PaymentGateway
  operations:
    - name: authorize
      parameters:
        - name: amount
          type: Money
        - name: source
          type: Account
      return-type: Authorization
    - name: capture
      parameters:
        - name: authorization
          type: Authorization
      return-type: Receipt
- kind: class
  name: StripeGateway
  attributes:
    - name: api_key
      type: string
      visibility: private
    - name: default_timeout
      type: Duration
      visibility: private
      static: true
  operations:
    - name: authorize
      visibility: public
      parameters:
        - name: amount
          type: Money
        - name: source
          type: Account
      return-type: Authorization
    - name: capture
      visibility: public
      parameters:
        - name: authorization
          type: Authorization
      return-type: Receipt
- kind: class
  name: RefundableOrder
  abstract: true
  attributes:
    - name: refund_window
      type: Duration
      visibility: protected
- kind: class
  name: Order
  attributes:
    - name: id
      type: OrderId
      visibility: private
    - name: lines
      type: List<LineItem>
      visibility: private
  operations:
    - name: total
      visibility: public
      return-type: Money
- kind: class
  name: LineItem
  attributes:
    - name: sku
      type: string
      visibility: private
    - name: quantity
      type: integer
      visibility: private
- kind: relationship
  form: implementation
  from: StripeGateway
  to: PaymentGateway
- kind: relationship
  form: inheritance
  from: RefundableOrder
  to: Order
- kind: relationship
  form: composition
  from: Order
  to: LineItem
  label: lines
  from-multiplicity: one
  to-multiplicity: one-or-many
- kind: relationship
  form: association
  from: StripeGateway
  to: Order
  label: charges
::::
