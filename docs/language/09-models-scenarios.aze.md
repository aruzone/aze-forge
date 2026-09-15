---
azemark: 2
title: Software and data model scenarios
author: AzeForge Proto
---

# Software and data model scenarios

This document exercises the Software and data models family against the resolved contract ([issue #61](https://github.com/aruzone/aze-forge/issues/61#issuecomment-5580464259)). The family is four typed directives — `sequence`, `state`, `entity` and `class` — registered by one `models` Plugin under `azemark: 2`, each with its own Block-local namespace, its own diagnostic namespace and its own bounded deterministic layout. None of the four accepts an arbitrary node-and-edge list: a sequence declares participants and an ordered timeline, a state machine declares scopes, pseudo-states and transitions, an entity schema declares attributes, keys and cardinality-bearing relationships, and a class diagram declares members and typed relationships. Every authored text field stays literal in the Document, layout and box sizing are renderer-owned, and each of the four Blocks below is valid and diagnostic-free.

// Login exchange (contract §12, scenario A): four participants, a loop whose body
// opens and closes its own bar, and an `alt` whose two divisions each release the
// bars opened before the fragment.

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

// Order lifecycle (contract §13, scenario B): one composite state carrying its own
// `initial` and `final`, transitions living only in the top-level collection, and
// reachability computed per scope so no inner state is reported unreachable.

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

// Order/customer schema (contract §14, scenario C): three entities, a junction
// table whose primary key is also a foreign key, `keys:` as a collection rather
// than a singleton, and both `references:` targets resolving to real attributes.

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

// Small class hierarchy (contract §15, scenario D): an interface realized by an
// implementation relationship, an abstract class inherited by a concrete one, a
// composition with multiplicities, and an association that carries no arrowhead
// because navigability was never authored.

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

All four Blocks are valid and produce no diagnostics at all: every participant is used, the loop body is activation-neutral and both `alt` divisions end with the same open-bar set, there is exactly one `initial` per scope with no transition into an `initial` or out of a `final`, every entity has at least one `primary` key and appears in a relationship, and every inheritance and implementation end is what its form requires. Each directive owns its diagnostic namespace — `azeforge.sequence#…`, `azeforge.state#…`, `azeforge.entity#…`, `azeforge.class#…` — sub-ranged to the offending collection item and field, and envelope faults stay with the core `§4`/`§11` codes rather than being re-implemented here. Warnings are topology remarks only, never failures: an unused participant, an unreachable or dead-end state, an entity without a primary key, an unrelated entity or class. Errors prevent the Document, its `contentHash` and every Artifact, warnings do not, and an invalid Block never yields a partial figure — the renderer draws a complete Block or reports the fault, so a half-drawn diagram is never mistaken for a finished one.
