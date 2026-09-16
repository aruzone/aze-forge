---
azemark: 2
title: Software and data model examples
author:
  - AzeForge examples
---

# Software and data model examples

Four directives draw software and data models: `sequence` orders messages between participants, `state` declares a scoped lifecycle, `entity` describes a relational schema with keys and cardinalities, and `class` declares classifiers and the relationships between them. Each example below is a complete Block, and every one compiles without diagnostics.

## Sequence

A `sequence` Block declares its participants once, then walks an ordered timeline of messages, fragments and notes.

The simplest useful timeline is a request and its reply between two participants.

:::: sequence
id: cache-lookup
number: true
title: Cache lookup
description: One request and its reply across two participants.
----
participants:
  - name: client
    kind: actor
    label: Client
  - name: cache
    label: Cache
timeline:
  - kind: message
    from: client
    to: cache
    text: Read key
  - kind: message
    from: cache
    to: client
    form: return
    text: Cached value
::::

Activation bars pair one `activate:` on the receiving participant with one `deactivate:` on the sending participant, and a three-participant exchange shows the nesting.

:::: sequence
id: backup-rotation
number: true
title: Backup rotation
description: A scheduler drives a shard write through an agent and a vault.
----
participants:
  - name: scheduler
    label: Scheduler
  - name: agent
    label: Backup agent
  - name: vault
    label: Vault
timeline:
  - kind: message
    from: scheduler
    to: agent
    text: Start rotation
    activate: true
  - kind: message
    from: agent
    to: vault
    form: async
    text: Store shard
    activate: true
  - kind: message
    from: vault
    to: agent
    form: return
    text: Shard digest
    deactivate: true
  - kind: message
    from: agent
    to: scheduler
    form: return
    text: Rotation report
    deactivate: true
::::

The deepest form nests an `alt` and a `loop` inside the timeline and closes a note over two participants.

:::: sequence
id: login-exchange
number: true
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

## State

A `state` Block is one flat ordered collection of states, pseudo-states and transitions, and exactly one `initial` pseudo-state opens each scope.

A linear lifecycle needs nothing beyond states and bare transitions.

:::: state
id: parcel-lifecycle
number: true
title: Parcel lifecycle
description: Four states on a single path from intake to a final state.
----
- kind: initial
  name: intake
- kind: state
  name: Labeled
- kind: state
  name: InTransit
- kind: state
  name: Delivered
- kind: state
  name: Archived
- kind: final
  name: closed
- kind: transition
  from: intake
  to: Labeled
- kind: transition
  from: Labeled
  to: InTransit
- kind: transition
  from: InTransit
  to: Delivered
- kind: transition
  from: Delivered
  to: Archived
- kind: transition
  from: Archived
  to: closed
::::

A transition also carries `trigger:`, `guard:` and `action:`, which name the event, the condition and the effect.

:::: state
id: culture-incubation
number: true
title: Culture incubation
description: A guarded incubation with an alert branch and a manual exit.
----
- kind: initial
  name: loaded
- kind: state
  name: Warming
- kind: state
  name: Incubating
- kind: state
  name: Flagged
- kind: final
  name: harvested
- kind: transition
  from: loaded
  to: Warming
- kind: transition
  from: Warming
  to: Incubating
  trigger: temperature reaches 37 C
  guard: sample is viable
  action: start timer
- kind: transition
  from: Incubating
  to: Flagged
  trigger: optical density exceeds threshold
  guard: timer has run 18 hours
  action: raise alert
- kind: transition
  from: Flagged
  to: harvested
  trigger: technician review
  action: freeze culture
- kind: transition
  from: Incubating
  to: harvested
  trigger: timer elapses
::::

A composite state nests its own `initial` and `final`, and transitions live in the top-level collection that reaches into those inner names.

:::: state
id: order-lifecycle
number: true
----
- kind: initial
  name: entry
- kind: state
  name: Draft
  label: Draft order
- kind: state
  name: Payment
  states:
    - kind: initial
      name: payment entry
    - kind: state
      name: Awaiting provider
    - kind: state
      name: Retrying
    - kind: final
      name: payment settled
- kind: state
  name: Shipped
- kind: state
  name: Cancelled
- kind: final
  name: Completed
- kind: transition
  from: entry
  to: Draft
- kind: transition
  from: Draft
  to: Payment
  trigger: checkout
  guard: cart is not empty
  action: reserve stock
- kind: transition
  from: payment entry
  to: Awaiting provider
- kind: transition
  from: Awaiting provider
  to: Retrying
  trigger: provider timeout
  action: back off
- kind: transition
  from: Retrying
  to: Awaiting provider
  trigger: retry budget remains
- kind: transition
  from: Awaiting provider
  to: payment settled
  trigger: provider approved
- kind: transition
  from: Payment
  to: Shipped
  trigger: settlement confirmed
  action: create shipment
- kind: transition
  from: Payment
  to: Cancelled
  trigger: provider declined
- kind: transition
  from: Draft
  to: Cancelled
  trigger: abandoned
- kind: transition
  from: Cancelled
  to: Completed
- kind: transition
  from: Shipped
  to: Completed
  trigger: delivered
::::

## Entity

An `entity` Block declares entities with their attributes, keys and typed references, plus the cardinality-bearing relationships between them.

Two entities with a primary key each are enough to describe a schema.

:::: entity
id: sensor-schema
number: true
title: Sensor schema
description: Two keyed entities joined by one cardinality-bearing relationship.
----
- kind: entity
  name: Sensor
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: location
      type: text
- kind: entity
  name: Reading
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: celsius
      type: decimal
- kind: relationship
  first:
    entity: Sensor
    cardinality: one
  second:
    entity: Reading
    cardinality: one-or-many
    role: measurements
::::

A junction table carries a composite primary key whose parts are foreign keys, so `keys:` lists two kinds and each part resolves through `references:`.

:::: entity
id: enrollment-schema
number: true
title: Enrollment schema
description: A junction table whose primary key is also a foreign key into both sides.
----
- kind: entity
  name: Student
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: name
      type: text
- kind: entity
  name: Course
  attributes:
    - name: code
      type: text
      keys:
        - primary
    - name: title
      type: text
- kind: entity
  name: Enrollment
  attributes:
    - name: student_id
      type: uuid
      keys:
        - primary
        - foreign
      references:
        entity: Student
        attribute: id
    - name: course_code
      type: text
      keys:
        - primary
        - foreign
      references:
        entity: Course
        attribute: code
    - name: grade
      type: text
      optional: true
- kind: relationship
  label: enrolls
  first:
    entity: Student
    cardinality: one
    role: student
  second:
    entity: Enrollment
    cardinality: one-or-many
- kind: relationship
  label: offers
  first:
    entity: Course
    cardinality: one
    role: course
  second:
    entity: Enrollment
    cardinality: one-or-many
::::

A natural key marked `unique` and an optional column sit alongside a `references:` target that must resolve to a declared attribute.

:::: entity
id: shop-schema
number: true
----
- kind: entity
  name: Customer
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: email
      type: text
      keys:
        - unique
    - name: nickname
      type: text
      optional: true
- kind: entity
  name: Order
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: customer_id
      type: uuid
      keys:
        - foreign
      references:
        entity: Customer
        attribute: id
    - name: placed_at
      type: timestamp
    - name: total
      type: money
    - name: note
      type: text
      optional: true
- kind: entity
  name: LineItem
  attributes:
    - name: order_id
      type: uuid
      keys:
        - primary
        - foreign
      references:
        entity: Order
        attribute: id
    - name: sku
      type: text
      keys:
        - primary
    - name: quantity
      type: integer
- kind: relationship
  label: places
  first:
    entity: Customer
    cardinality: one
    role: buyer
  second:
    entity: Order
    cardinality: one-or-many
- kind: relationship
  label: contains
  first:
    entity: Order
    cardinality: one
  second:
    entity: LineItem
    cardinality: one-or-many
::::

## Class

A `class` Block declares classifiers — classes and interfaces — and the relationships between them, each relationship closed to one of five forms.

Two classes with an inheritance edge are the smallest interesting diagram.

:::: class
id: vehicle-classes
number: true
title: Vehicle classes
description: An abstract base class inherited by a concrete subclass.
----
- kind: class
  name: Vehicle
  abstract: true
  attributes:
    - name: vin
      type: string
      visibility: private
    - name: wheels
      type: integer
      visibility: protected
  operations:
    - name: describe
      visibility: public
      return-type: string
- kind: class
  name: Truck
  attributes:
    - name: payload
      type: Mass
      visibility: private
  operations:
    - name: load
      visibility: public
      parameters:
        - name: cargo
          type: Cargo
      return-type: boolean
- kind: relationship
  form: inheritance
  from: Truck
  to: Vehicle
::::

An interface declares the operation contract and no attributes, and an `implementation` relationship names the class that satisfies it. `aggregation` is the unowned whole-part form, and its hollow diamond sits at the `from:` end; both of its ends may carry multiplicities because the form is not ranked.

:::: class
id: telemetry-classes
number: true
title: Telemetry classes
description: An interface contract realized by one implementing class, aggregated by a bus.
----
- kind: interface
  name: TelemetrySink
  operations:
    - name: emit
      parameters:
        - name: point
          type: TelemetryPoint
      return-type: void
- kind: class
  name: InMemorySink
  attributes:
    - name: capacity
      type: integer
      visibility: private
    - name: buffer
      type: List<TelemetryPoint>
      visibility: private
  operations:
    - name: emit
      visibility: public
      parameters:
        - name: point
          type: TelemetryPoint
      return-type: void
- kind: class
  name: TelemetryBus
  attributes:
    - name: fanout
      type: integer
      visibility: private
  operations:
    - name: attach
      visibility: public
      parameters:
        - name: sink
          type: TelemetrySink
      return-type: void
- kind: relationship
  form: implementation
  from: InMemorySink
  to: TelemetrySink
- kind: relationship
  form: aggregation
  from: TelemetryBus
  to: InMemorySink
  label: sinks
  from-multiplicity: one
  to-multiplicity: many
::::

Composition, association and multiple inheritance share one collection, and only the ranked forms carry multiplicities.

:::: class
id: payment-classes
number: true
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
