import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CLASS_ATTRIBUTES,
  MAX_CLASS_CLASSIFIERS,
  MAX_CLASS_OPERATIONS,
  MAX_CLASS_PARAMETERS,
  MAX_CLASS_RELATIONSHIPS,
  MAX_ENTITY_ATTRIBUTES,
  MAX_ENTITY_ENTITIES,
  MAX_ENTITY_RELATIONSHIPS,
  MAX_MODELS_NAME_CHARS,
  MAX_MODELS_TEXT_CHARS,
  MAX_SEQUENCE_ALT_DIVISIONS,
  MAX_SEQUENCE_FRAGMENT_DEPTH,
  MAX_SEQUENCE_NOTE_SPAN,
  MAX_SEQUENCE_NOTE_TEXT_CHARS,
  MAX_SEQUENCE_PARTICIPANTS,
  MAX_SEQUENCE_TIMELINE_ITEMS,
  MAX_STATE_DEPTH,
  MAX_STATE_STATES,
  MAX_STATE_TRANSITIONS,
  validateClassBlock,
  validateEntityBlock,
  validateSequenceBlock,
  validateStateBlock,
} from "../dist/models.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

function toLines(text, startLine) {
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line, index) => {
    const number = startLine + index;
    return {
      text: line,
      range: {
        start: { line: number, column: 1, offset: 0 },
        end: { line: number, column: 1 + line.length, offset: line.length },
      },
    };
  });
}

function validate(kind, header, body) {
  const envelope = {
    headerLines: toLines(header, 10),
    bodyLines: toLines(body, 50),
    blockRange: BLOCK_RANGE,
    sourceName: `${kind}.aze.md`,
  };
  if (kind === "sequence") return validateSequenceBlock(envelope);
  if (kind === "state") return validateStateBlock(envelope);
  if (kind === "entity") return validateEntityBlock(envelope);
  return validateClassBlock(envelope);
}

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code.replace(/^azeforge\.[a-z]+#/, ""));
}

function assertCode(result, code, data) {
  const matches = result.diagnostics.filter((diagnostic) =>
    diagnostic.code.endsWith(`#${code}`),
  );
  assert.equal(
    matches.length,
    1,
    `expected one ${code}, saw [${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}]`,
  );
  if (data !== undefined) assert.deepEqual(matches[0].data, data);
  return matches[0];
}

function assertCodeMatching(result, code, data) {
  const matches = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code.endsWith(`#${code}`) &&
      Object.entries(data).every(([key, value]) => diagnostic.data[key] === value),
  );
  assert.ok(
    matches.length >= 1,
    `expected a ${code} with ${JSON.stringify(data)}, saw ${JSON.stringify(result.diagnostics.map((d) => d.data))}`,
  );
  return matches[0];
}

function assertLimitAtLeast(result, subject, limit) {
  const found = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code.endsWith("#limit-exceeded") && diagnostic.data.subject === subject,
  );
  assert.ok(found.length >= 1, `expected a ${subject} ceiling`);
  for (const diagnostic of found) assert.equal(diagnostic.data.limit, limit);
}

function assertOnly(result, expected) {
  assert.deepEqual([...new Set(codes(result))].sort(), [...expected].sort());
}

function assertWarning(result, code, data) {
  const matches = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning" && diagnostic.code.endsWith(`#${code}`),
  );
  assert.ok(matches.length >= 1, `expected a ${code} warning`);
  if (data !== undefined) assert.deepEqual(matches[0].data, data);
  return matches[0];
}

function assertLimit(result, subject, count, limit) {
  const found = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code.endsWith("#limit-exceeded") && diagnostic.data.subject === subject,
  );
  assert.equal(
    found.length,
    1,
    `expected one ${subject} ceiling, saw ${JSON.stringify(result.diagnostics.map((diagnostic) => diagnostic.data))}`,
  );
  assert.deepEqual(found[0].data, { subject, count, limit });
}

const SEQUENCE_BODY = `participants:
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
      the auth service holds the hash.`;

const STATE_BODY = `- kind: initial
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
  trigger: delivered`;

const ENTITY_BODY = `- kind: entity
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
    cardinality: one-or-many`;

const CLASS_BODY = `- kind: interface
  name: PaymentGateway
  operations:
    - name: authorize
      parameters:
        - name: amount
          type: Money
        - name: source
          type: Account
      return-type: Authorization
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
    - name: capture
      visibility: public
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
  label: charges`;

/* ------------------------------------------------------------------ *
 * sequence
 * ------------------------------------------------------------------ */

test("Sequence parses the login exchange into participant and timeline semantics", () => {
  const result = validate("sequence", "id: login-exchange\nnumber: true", SEQUENCE_BODY);
  assert.deepEqual(codes(result), []);
  const block = result.block;
  assert.equal(block.kind, "sequence");
  assert.equal(block.id, "login-exchange");
  assert.equal(block.number, true);
  assert.deepEqual(
    block.participants.map((participant) => [participant.name, participant.kind, participant.label]),
    [
      ["user", "actor", "User"],
      ["web", "participant", "Web app"],
      ["auth", "participant", "Auth service"],
      ["store", "participant", "User store"],
    ],
  );
  assert.equal(block.timeline.length, 5);
  const [first, second, loop, alt, note] = block.timeline;
  assert.equal(first.form, "sync");
  assert.equal(first.activate, true);
  assert.equal(first.deactivate, false);
  assert.equal(second.text, "Verify session");
  assert.equal(loop.kind, "loop");
  assert.equal(loop.condition, "Retry budget remains");
  assert.equal(loop.body.length, 2);
  assert.equal(loop.body[1].form, "return");
  assert.equal(alt.kind, "alt");
  assert.equal(alt.divisions.length, 2);
  assert.deepEqual(
    alt.divisions.map((division) => division.condition),
    ["Credentials valid", "Credentials rejected"],
  );
  assert.equal(note.kind, "note");
  assert.deepEqual([...note.over], ["auth", "store"]);
  assert.equal(
    note.text,
    "Credentials never reach the user store;\nthe auth service holds the hash.\n",
  );
});

test("Sequence registers no warnings for the approved scenario", () => {
  const result = validate("sequence", "id: login-exchange", SEQUENCE_BODY);
  assert.deepEqual(codes(result, "warning"), []);
});

test("Sequence diagnoses an undeclared participant with a related location", () => {
  const result = validate(
    "sequence",
    "",
    `participants:
  - name: user
  - name: web
timeline:
  - kind: message
    from: user
    to: database
    text: fetch user`,
  );
  assertOnly(result, ["unresolved-reference"]);
  const diagnostic = assertCode(result, "unresolved-reference", {
    namespace: "participant",
    name: "database",
  });
  assert.equal(diagnostic.relatedLocations.length, 1);
  assert.equal(result.block, undefined);
});

test("Sequence balances activations across alt divisions and loop bodies", () => {
  const stillOpen = validate(
    "sequence",
    "",
    SEQUENCE_BODY.replace(/\n            deactivate: true/g, ""),
  );
  assertOnly(stillOpen, ["unbalanced-activation"]);

  const disagree = validate(
    "sequence",
    "",
    `participants:
  - name: web
  - name: auth
timeline:
  - kind: message
    from: web
    to: auth
    activate: true
  - kind: alt
    divisions:
      - condition: ok
        body:
          - kind: message
            from: auth
            to: web
            form: return
            deactivate: true
      - condition: no
        body:
          - kind: message
            from: auth
            to: web
            form: return`,
  );
  assertCodeMatching(disagree, "unbalanced-activation", {
    reason: "divisions disagree",
  });

  const notNeutral = validate(
    "sequence",
    "",
    `participants:
  - name: store
  - name: auth
timeline:
  - kind: message
    from: auth
    to: store
    activate: true
  - kind: loop
    condition: retry
    body:
      - kind: message
        from: store
        to: auth
        deactivate: true`,
  );
  assertCodeMatching(notNeutral, "unbalanced-activation", {
    reason: "loop body is not activation-neutral",
    participant: "store",
  });

  const popsNothing = validate(
    "sequence",
    "",
    `participants:
  - name: web
timeline:
  - kind: message
    from: web
    to: web
    deactivate: true`,
  );
  assertCodeMatching(popsNothing, "unbalanced-activation", {
    participant: "web",
    reason: "no open activation",
  });
});

test("Sequence accepts a self-message that opens and closes in one message", () => {
  const result = validate(
    "sequence",
    "",
    `participants:
  - name: web
timeline:
  - kind: message
    from: web
    to: web
    text: retry
    activate: true
    deactivate: true`,
  );
  assert.deepEqual(codes(result), []);
  assert.notEqual(result.block, undefined);
});

test("Sequence refuses an unknown form, an unknown item and an unknown field", () => {
  const form = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: message
    from: user
    to: user
    form: reply`,
  );
  assertCode(form, "unknown-kind", { field: "form", value: "reply" });

  const item = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: call
    from: user
    to: user`,
  );
  assertCode(item, "unknown-item", { value: "call" });

  const field = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: message
    from: user
    to: user
    colour: red`,
  );
  assertCode(field, "unknown-field", { field: "colour" });
});

test("Sequence enforces its ceiling matrix", () => {
  const participants = Array.from(
    { length: MAX_SEQUENCE_PARTICIPANTS + 1 },
    (_, index) => `  - name: p${index}`,
  ).join("\n");
  const tooMany = validate("sequence", "", `participants:\n${participants}\ntimeline:\n  - kind: message\n    from: p0\n    to: p1`);
  assertLimit(tooMany, "participants", MAX_SEQUENCE_PARTICIPANTS + 1, MAX_SEQUENCE_PARTICIPANTS);

  const timeline = Array.from(
    { length: MAX_SEQUENCE_TIMELINE_ITEMS + 1 },
    () => "  - kind: message\n    from: user\n    to: user",
  ).join("\n");
  const tooLong = validate("sequence", "", `participants:\n  - name: user\ntimeline:\n${timeline}`);
  assertLimit(tooLong, "timeline-items", MAX_SEQUENCE_TIMELINE_ITEMS + 1, MAX_SEQUENCE_TIMELINE_ITEMS);

  const nested = [
    "  - kind: loop",
    "    condition: retry",
    "    body:",
    "      - kind: loop",
    "        condition: retry",
    "        body:",
    "          - kind: loop",
    "            condition: retry",
    "            body:",
    "              - kind: loop",
    "                condition: retry",
    "                body:",
    "                  - kind: loop",
    "                    condition: retry",
    "                    body:",
    "                      - kind: message",
    "                        from: user",
    "                        to: user",
  ].join("\n");
  const tooDeep = validate("sequence", "", `participants:\n  - name: user\ntimeline:\n${nested}`);
  assertLimitAtLeast(tooDeep, "fragment-depth", MAX_SEQUENCE_FRAGMENT_DEPTH);

  const divisions = Array.from(
    { length: MAX_SEQUENCE_ALT_DIVISIONS + 1 },
    (_, index) =>
      `      - condition: c${index}\n        body:\n          - kind: message\n            from: user\n            to: user`,
  ).join("\n");
  const tooManyDivisions = validate(
    "sequence",
    "",
    `participants:\n  - name: user\ntimeline:\n  - kind: alt\n    divisions:\n${divisions}`,
  );
  assertLimit(tooManyDivisions, "alt-divisions", MAX_SEQUENCE_ALT_DIVISIONS + 1, MAX_SEQUENCE_ALT_DIVISIONS);

  const span = validate(
    "sequence",
    "",
    `participants:
  - name: a
  - name: b
  - name: c
timeline:
  - kind: note
    over:
      - a
      - b
      - c
    text: |
      three lanes`,
  );
  assertCode(span, "invalid-note-span", { count: 3, limit: MAX_SEQUENCE_NOTE_SPAN });

  const longText = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: message
    from: user
    to: user
    text: ${"x".repeat(MAX_MODELS_TEXT_CHARS + 1)}`,
  );
  assertCode(longText, "invalid-text", {
    field: "text",
    count: MAX_MODELS_TEXT_CHARS + 1,
    limit: MAX_MODELS_TEXT_CHARS,
  });

  const longNote = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: note
    over:
      - user
    text: |
      ${"x".repeat(MAX_SEQUENCE_NOTE_TEXT_CHARS + 1)}`,
  );
  assertCode(longNote, "invalid-text", {
    field: "text",
    count: MAX_SEQUENCE_NOTE_TEXT_CHARS + 1,
    limit: MAX_SEQUENCE_NOTE_TEXT_CHARS,
  });
});

test("Sequence admits four nested fragment levels and refuses a fifth", () => {
  const nested = (depth) => {
    const pad = (level) => "  ".repeat(1 + level);
    let inner = `${pad(depth)}- kind: message\n${pad(depth)}  from: user\n${pad(depth)}  to: user`;
    for (let level = depth - 1; level >= 0; level -= 1) {
      inner =
        `${pad(level)}- kind: loop\n${pad(level)}  condition: c${level}\n${pad(level)}  body:\n` +
        inner
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n");
    }
    return inner;
  };
  const allowed = validate(
    "sequence",
    "",
    `participants:\n  - name: user\ntimeline:\n${nested(MAX_SEQUENCE_FRAGMENT_DEPTH)}`,
  );
  assert.deepEqual(codes(allowed), []);
  assert.notEqual(allowed.block, undefined);

  const refused = validate(
    "sequence",
    "",
    `participants:\n  - name: user\ntimeline:\n${nested(MAX_SEQUENCE_FRAGMENT_DEPTH + 1)}`,
  );
  assertLimit(refused, "fragment-depth", MAX_SEQUENCE_FRAGMENT_DEPTH + 1, MAX_SEQUENCE_FRAGMENT_DEPTH);
});

test("Sequence diagnoses duplicate participants and unregistered names", () => {
  const duplicate = validate(
    "sequence",
    "",
    `participants:
  - name: auth
  - name: auth
timeline:
  - kind: message
    from: auth
    to: auth`,
  );
  assertCode(duplicate, "duplicate-name", { namespace: "participant", name: "auth" });

  const invalid = validate("sequence", "", "participants:\n  - name: user@host\ntimeline:\n  - kind: message\n    from: user@host\n    to: user@host");
  assertCode(invalid, "invalid-name");

  const long = validate(
    "sequence",
    "",
    `participants:
  - name: ${"n".repeat(MAX_MODELS_NAME_CHARS + 1)}
timeline:
  - kind: message
    from: ${"n".repeat(MAX_MODELS_NAME_CHARS + 1)}
    to: ${"n".repeat(MAX_MODELS_NAME_CHARS + 1)}`,
  );
  assertCode(long, "invalid-name");
});

test("Sequence refuses an empty timeline and an empty fragment, and warns on an unused participant", () => {
  const empty = validate("sequence", "", "participants:\n  - name: user\ntimeline:");
  assertCode(empty, "empty");

  const fragment = validate(
    "sequence",
    "",
    `participants:
  - name: user
timeline:
  - kind: alt
    divisions:
      - condition: a
        body:
      - condition: b
        body:`,
  );
  assertCode(fragment, "empty-fragment");

  const unused = validate(
    "sequence",
    "",
    `participants:
  - name: user
  - name: ghost
timeline:
  - kind: message
    from: user
    to: user`,
  );
  assertWarning(unused, "unused-participant", { name: "ghost" });
  assert.notEqual(unused.block, undefined);
});

/* ------------------------------------------------------------------ *
 * state
 * ------------------------------------------------------------------ */

test("State parses the order lifecycle with composite containment and per-scope reachability", () => {
  const result = validate("state", "id: order-lifecycle\nnumber: true", STATE_BODY);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), []);
  const block = result.block;
  assert.equal(block.items.length, 17);
  const payment = block.items.find((item) => item.kind === "state" && item.name === "Payment");
  assert.equal(payment.states.length, 4);
  assert.deepEqual(
    payment.states.map((item) => item.kind),
    ["initial", "state", "state", "final"],
  );
  const checkout = block.items.find(
    (item) => item.kind === "transition" && item.trigger === "checkout",
  );
  assert.equal(checkout.guard, "cart is not empty");
  assert.equal(checkout.action, "reserve stock");
  assert.equal(checkout.label, undefined);
});

test("State diagnoses missing and multiple initials per scope", () => {
  const multiple = validate(
    "state",
    "",
    `- kind: initial
  name: start1
- kind: initial
  name: start2
- kind: state
  name: idle
- kind: transition
  from: start1
  to: idle
- kind: transition
  from: start2
  to: idle`,
  );
  assertCode(multiple, "multiple-initials", { scope: "top-level", count: 2 });

  const missing = validate("state", "", "- kind: state\n  name: Draft");
  assertCode(missing, "missing-initial", { scope: "top-level" });

  const inner = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Payment
  states:
    - kind: initial
      name: payment entry
    - kind: initial
      name: second entry
- kind: transition
  from: entry
  to: Payment`,
  );
  assertCode(inner, "multiple-initials", { scope: "Payment", count: 2 });
});

test("State refuses transitions into an initial and out of a final", () => {
  const incoming = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Draft
- kind: transition
  from: entry
  to: Draft
- kind: transition
  from: Draft
  to: entry`,
  );
  const diagnostic = assertCode(incoming, "initial-has-incoming");
  assert.equal(diagnostic.relatedLocations.length, 1);

  const outgoing = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: final
  name: Done
- kind: transition
  from: entry
  to: Done
- kind: transition
  from: Done
  to: entry`,
  );
  assertCode(outgoing, "final-has-outgoing");
});

test("State leaves unresolved references and nested transitions as counted faults", () => {
  const unresolved = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Draft
- kind: transition
  from: entry
  to: Draft
- kind: transition
  from: Draft
  to: Refunded`,
  );
  assertCode(unresolved, "unresolved-reference", { namespace: "state", name: "Refunded" });
  assert.deepEqual(codes(unresolved, "warning"), [], "an unresolved name suppresses reachability walks");

  const nested = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Payment
  states:
    - kind: transition
      from: entry
      to: entry`,
  );
  assertCode(nested, "unknown-item", { value: "transition" });
});

test("State warns on an unreachable state and on a dead end", () => {
  const result = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Draft
- kind: state
  name: Refunded
- kind: final
  name: Done
- kind: transition
  from: entry
  to: Draft
- kind: transition
  from: Draft
  to: Done`,
  );
  assert.deepEqual(codes(result), []);
  assertWarning(result, "unreachable-state", { name: "Refunded" });
  assertWarning(result, "dead-end-state", { name: "Refunded" });
  assert.notEqual(result.block, undefined);
});

test("State keeps one flat name namespace and its ceiling matrix", () => {
  const duplicate = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Draft
  states:
    - kind: state
      name: Draft
- kind: transition
  from: entry
  to: Draft`,
  );
  assertCode(duplicate, "duplicate-name", { namespace: "state", name: "Draft" });

  const states = ["- kind: initial\n  name: entry"].concat(
    Array.from({ length: MAX_STATE_STATES + 1 }, (_, index) => `- kind: state\n  name: s${index}`),
  );
  const transitions = Array.from(
    { length: MAX_STATE_TRANSITIONS + 1 },
    () => "- kind: transition\n  from: entry\n  to: s0",
  );
  const tooManyStates = validate("state", "", [...states, ...transitions].join("\n"));
  assertLimit(tooManyStates, "states", MAX_STATE_STATES + 1, MAX_STATE_STATES);

  const manyTransitions = validate(
    "state",
    "",
    [
      "- kind: initial\n  name: entry",
      "- kind: state\n  name: s0",
      ...Array.from({ length: MAX_STATE_TRANSITIONS + 1 }, () => "- kind: transition\n  from: entry\n  to: s0"),
    ].join("\n"),
  );
  assertLimit(
    manyTransitions,
    "transitions",
    MAX_STATE_TRANSITIONS + 1,
    MAX_STATE_TRANSITIONS,
  );

  const deep = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: a
  states:
    - kind: state
      name: b
      states:
        - kind: state
          name: c
          states:
            - kind: state
              name: d
- kind: transition
  from: entry
  to: a`,
  );
  assertLimit(deep, "state-depth", MAX_STATE_DEPTH + 1, MAX_STATE_DEPTH);
});

test("State accepts transitions that cross scope borders", () => {
  const result = validate(
    "state",
    "",
    `- kind: initial
  name: entry
- kind: state
  name: Payment
  states:
    - kind: initial
      name: payment entry
    - kind: state
      name: Awaiting provider
- kind: state
  name: Cancelled
- kind: final
  name: Done
- kind: transition
  from: entry
  to: Payment
- kind: transition
  from: payment entry
  to: Awaiting provider
- kind: transition
  from: Awaiting provider
  to: Cancelled
- kind: transition
  from: Payment
  to: Cancelled
- kind: transition
  from: Cancelled
  to: Done`,
  );
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), []);
  assert.notEqual(result.block, undefined);
});

/* ------------------------------------------------------------------ *
 * entity
 * ------------------------------------------------------------------ */

test("Entity parses the shop schema with keys collections and validated references", () => {
  const result = validate("entity", "id: shop-schema\nnumber: true", ENTITY_BODY);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), []);
  const block = result.block;
  assert.equal(block.items.length, 5);
  const lineItem = block.items.find((item) => item.kind === "entity" && item.name === "LineItem");
  const orderId = lineItem.attributes.find((attribute) => attribute.name === "order_id");
  assert.deepEqual([...orderId.keys], ["primary", "foreign"]);
  assert.deepEqual(orderId.reference, { entity: "Order", attribute: "id" });
  const nickname = block.items
    .find((item) => item.kind === "entity" && item.name === "Customer")
    .attributes.find((attribute) => attribute.name === "nickname");
  assert.equal(nickname.optional, true);
  const places = block.items.find((item) => item.kind === "relationship" && item.label === "places");
  assert.equal(places.first.cardinality, "one");
  assert.equal(places.first.role, "buyer");
  assert.equal(places.second.cardinality, "one-or-many");
});

test("Entity refuses an authored UML range and a missing cardinality", () => {
  const range = validate(
    "entity",
    "",
    `- kind: entity
  name: Customer
  attributes:
    - name: id
      keys:
        - primary
- kind: entity
  name: Order
  attributes:
    - name: id
      keys:
        - primary
- kind: relationship
  first:
    entity: Customer
    cardinality: one
  second:
    entity: Order
    cardinality: 0..*`,
  );
  assertCode(range, "unknown-kind", { field: "cardinality", value: "0..*" });

  const missing = validate(
    "entity",
    "",
    `- kind: entity
  name: Customer
  attributes:
    - name: id
      keys:
        - primary
- kind: entity
  name: Order
- kind: relationship
  first:
    entity: Customer
    cardinality: one
  second:
    entity: Order`,
  );
  assertCode(missing, "missing-field");
});

test("Entity validates key collections, references and duplicate names", () => {
  const duplicateKey = validate(
    "entity",
    "",
    `- kind: entity
  name: Order
  attributes:
    - name: id
      keys:
        - primary
        - primary`,
  );
  assertCode(duplicateKey, "duplicate-key", { key: "primary", name: "id" });

  const invalidReference = validate(
    "entity",
    "",
    `- kind: entity
  name: Customer
  attributes:
    - name: email
      keys:
        - unique
      references:
        entity: Customer
        attribute: id
    - name: id
      keys:
        - primary`,
  );
  assertCode(invalidReference, "invalid-reference", { reason: "requires key foreign" });

  const unresolved = validate(
    "entity",
    "",
    `- kind: entity
  name: Order
  attributes:
    - name: customer_id
      keys:
        - foreign
      references:
        entity: Customer
        attribute: uuid`,
  );
  assertCode(unresolved, "unresolved-reference", { entity: "Customer", attribute: "uuid" });

  const duplicate = validate(
    "entity",
    "",
    `- kind: entity
  name: Order
  attributes:
    - name: id
      keys:
        - primary
    - name: id`,
  );
  assertCode(duplicate, "duplicate-name", { namespace: "attribute", name: "id" });
});

test("Entity warns on a missing primary key and an unrelated entity", () => {
  const result = validate("entity", "", "- kind: entity\n  name: Audit");
  assertWarning(result, "no-primary-key", { name: "Audit" });
  assertWarning(result, "unrelated-entity", { name: "Audit" });
  assert.notEqual(result.block, undefined);
});

test("Entity diagnoses an undeclared relationship end and its ceiling matrix", () => {
  const unresolved = validate(
    "entity",
    "",
    `- kind: entity
  name: Order
  attributes:
    - name: id
      keys:
        - primary
- kind: relationship
  first:
    entity: Order
    cardinality: one
  second:
    entity: Invoice
    cardinality: many`,
  );
  assertCode(unresolved, "unresolved-reference", { namespace: "entity", name: "Invoice" });

  const attributes = Array.from(
    { length: MAX_ENTITY_ATTRIBUTES + 1 },
    (_, index) => `    - name: c${index}`,
  ).join("\n");
  const tooMany = validate("entity", "", `- kind: entity\n  name: Order\n  attributes:\n${attributes}`);
  assertLimit(tooMany, "attributes", MAX_ENTITY_ATTRIBUTES + 1, MAX_ENTITY_ATTRIBUTES);

  const entities = Array.from(
    { length: MAX_ENTITY_ENTITIES + 1 },
    (_, index) => `- kind: entity\n  name: e${index}`,
  ).join("\n");
  const manyEntities = validate("entity", "", entities);
  assertLimit(manyEntities, "entities", MAX_ENTITY_ENTITIES + 1, MAX_ENTITY_ENTITIES);

  const relationships = Array.from(
    { length: MAX_ENTITY_RELATIONSHIPS + 1 },
    () =>
      "- kind: relationship\n  first:\n    entity: e0\n    cardinality: one\n  second:\n    entity: e0\n    cardinality: many",
  ).join("\n");
  const manyRelationships = validate(
    "entity",
    "",
    ["- kind: entity\n  name: e0\n  attributes:\n    - name: id\n      keys:\n        - primary", relationships].join("\n"),
  );
  assertLimit(
    manyRelationships,
    "relationships",
    MAX_ENTITY_RELATIONSHIPS + 1,
    MAX_ENTITY_RELATIONSHIPS,
  );
});

/* ------------------------------------------------------------------ *
 * class
 * ------------------------------------------------------------------ */

test("Class parses the payment hierarchy with structured parameters and closed forms", () => {
  const result = validate("class", "id: payment-classes\nnumber: true", CLASS_BODY);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), []);
  const block = result.block;
  assert.equal(block.items.length, 9);
  const gateway = block.items.find((item) => item.kind === "interface");
  assert.equal(gateway.name, "PaymentGateway");
  assert.equal(gateway.abstract, undefined, "an interface is implicitly abstract");
  assert.equal(gateway.attributes, undefined, "an interface declares no attributes");
  assert.deepEqual(
    gateway.operations[0].parameters.map((parameter) => [parameter.name, parameter.type]),
    [
      ["amount", "Money"],
      ["source", "Account"],
    ],
  );
  assert.equal(gateway.operations[0].returnType, "Authorization");
  assert.equal(gateway.operations[0].visibility, undefined);
  const stripe = block.items.find((item) => item.kind === "class" && item.name === "StripeGateway");
  assert.equal(stripe.attributes[1].static, true);
  assert.equal(stripe.attributes[0].static, false);
  const order = block.items.find((item) => item.kind === "class" && item.name === "Order");
  assert.equal(order.operations[0].parameters, undefined);
  assert.equal(order.operations[0].returnType, "Money");
  const composition = block.items.find(
    (item) => item.kind === "relationship" && item.form === "composition",
  );
  assert.equal(composition.from, "Order");
  assert.equal(composition.fromMultiplicity, "one");
  assert.equal(composition.toMultiplicity, "one-or-many");
  const association = block.items.find(
    (item) => item.kind === "relationship" && item.form === "association",
  );
  assert.equal(association.fromMultiplicity, undefined);
});

test("Class refuses an unregistered form and a multiplicity on a ranked relationship", () => {
  const form = validate(
    "class",
    "",
    `- kind: class
  name: Order
- kind: class
  name: Customer
- kind: relationship
  form: dependency
  from: Order
  to: Customer`,
  );
  assertCode(form, "unknown-kind", { field: "form", value: "dependency" });

  const multiplicity = validate(
    "class",
    "",
    `- kind: class
  name: Animal
- kind: class
  name: Dog
- kind: relationship
  form: inheritance
  from: Dog
  to: Animal
  from-multiplicity: one`,
  );
  const diagnostic = assertCode(multiplicity, "multiplicity-on-ranked-relationship");
  assert.equal(diagnostic.data.field, "from-multiplicity");

  const visibility = validate(
    "class",
    "",
    `- kind: class
  name: Order
  attributes:
    - name: id
      visibility: package-private
- kind: class
  name: Customer
- kind: relationship
  form: association
  from: Order
  to: Customer`,
  );
  assertCode(visibility, "unknown-kind", { field: "visibility", value: "package-private" });
});

test("Class diagnoses cycles, self-inheritance and invalid targets", () => {
  const cycle = validate(
    "class",
    "",
    `- kind: class
  name: Order
- kind: class
  name: RefundableOrder
- kind: relationship
  form: inheritance
  from: RefundableOrder
  to: Order
- kind: relationship
  form: inheritance
  from: Order
  to: RefundableOrder`,
  );
  const diagnostic = assertCode(cycle, "inheritance-cycle");
  assert.deepEqual(diagnostic.data.cycle, ["Order", "RefundableOrder", "Order"]);
  assert.equal(diagnostic.relatedLocations.length, 1);

  const self = validate(
    "class",
    "",
    `- kind: class
  name: Order
- kind: relationship
  form: inheritance
  from: Order
  to: Order`,
  );
  assertCode(self, "inheritance-cycle", { cycle: ["Order", "Order"] });

  const mixed = validate(
    "class",
    "",
    `- kind: class
  name: StripeGateway
- kind: interface
  name: PaymentGateway
- kind: relationship
  form: inheritance
  from: StripeGateway
  to: PaymentGateway`,
  );
  assertCode(mixed, "invalid-relationship-target", {
    reason: "inheritance ends must both be classes or both be interfaces",
  });

  const target = validate(
    "class",
    "",
    `- kind: class
  name: Order
- kind: class
  name: RefundableOrder
- kind: relationship
  form: implementation
  from: Order
  to: RefundableOrder`,
  );
  assertCode(target, "invalid-relationship-target", {
    reason: "implementation target must be an interface",
  });
});

test("Class accepts multiple inheritance and warns on an unrelated classifier", () => {
  const result = validate(
    "class",
    "",
    `- kind: interface
  name: Left
- kind: interface
  name: Right
- kind: class
  name: Both
- kind: relationship
  form: implementation
  from: Both
  to: Left
- kind: relationship
  form: implementation
  from: Both
  to: Right`,
  );
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), []);
  assert.notEqual(result.block, undefined);

  const unrelated = validate(
    "class",
    "",
    `- kind: class
  name: Order
- kind: class
  name: Customer
- kind: class
  name: Payment Gateway
- kind: relationship
  form: association
  from: Order
  to: Customer`,
  );
  assertWarning(unrelated, "unrelated-class", { name: "Payment Gateway" });
  assert.notEqual(unrelated.block, undefined);
});

test("Class refuses members on an interface and diagnoses duplicate parameters", () => {
  const members = validate(
    "class",
    "",
    `- kind: interface
  name: PaymentGateway
  attributes:
    - name: api_key`,
  );
  assertCode(members, "unknown-field", { field: "attributes" });

  const parameters = validate(
    "class",
    "",
    `- kind: class
  name: Order
  operations:
    - name: authorize
      parameters:
        - name: amount
        - name: amount
- kind: class
  name: Customer
- kind: relationship
  form: association
  from: Order
  to: Customer`,
  );
  assertCode(parameters, "duplicate-name", { namespace: "parameter", name: "amount" });
});

test("Class enforces its ceiling matrix", () => {
  const parameters = validate(
    "class",
    "",
    [
      "- kind: class\n  name: Order\n  operations:\n    - name: total\n      parameters:\n" +
        Array.from(
          { length: MAX_CLASS_PARAMETERS + 1 },
          (_, index) => `        - name: p${index}`,
        ).join("\n"),
      "- kind: class\n  name: Customer",
      "- kind: relationship\n  form: association\n  from: Order\n  to: Customer",
    ].join("\n"),
  );
  assertLimit(parameters, "parameters", MAX_CLASS_PARAMETERS + 1, MAX_CLASS_PARAMETERS);

  const attributes = validate(
    "class",
    "",
    `- kind: class
  name: Order
  attributes:
${Array.from({ length: MAX_CLASS_ATTRIBUTES + 1 }, (_, index) => `    - name: a${index}`).join("\n")}
- kind: class
  name: Customer
- kind: relationship
  form: association
  from: Order
  to: Customer`,
  );
  assertLimit(attributes, "attributes", MAX_CLASS_ATTRIBUTES + 1, MAX_CLASS_ATTRIBUTES);

  const operations = validate(
    "class",
    "",
    `- kind: class
  name: Order
  operations:
${Array.from({ length: MAX_CLASS_OPERATIONS + 1 }, (_, index) => `    - name: o${index}`).join("\n")}
- kind: class
  name: Customer
- kind: relationship
  form: association
  from: Order
  to: Customer`,
  );
  assertLimit(operations, "operations", MAX_CLASS_OPERATIONS + 1, MAX_CLASS_OPERATIONS);

  const classifiers = Array.from(
    { length: MAX_CLASS_CLASSIFIERS + 1 },
    (_, index) => `- kind: class\n  name: c${index}`,
  ).join("\n");
  const manyClassifiers = validate("class", "", classifiers);
  assertLimit(manyClassifiers, "classes", MAX_CLASS_CLASSIFIERS + 1, MAX_CLASS_CLASSIFIERS);

  const relationships = Array.from(
    { length: MAX_CLASS_RELATIONSHIPS + 1 },
    () =>
      "- kind: relationship\n  form: association\n  from: c0\n  to: c1",
  ).join("\n");
  const manyRelationships = validate(
    "class",
    "",
    ["- kind: class\n  name: c0", "- kind: class\n  name: c1", relationships].join("\n"),
  );
  assertLimit(
    manyRelationships,
    "relationships",
    MAX_CLASS_RELATIONSHIPS + 1,
    MAX_CLASS_RELATIONSHIPS,
  );
});

test("Models header fields are shared, validated and defaulted alike", () => {
  const valid = validate("state", "id: order-lifecycle\nnumber: true\ntitle: Order lifecycle", STATE_BODY);
  assert.equal(valid.block.title, "Order lifecycle");

  const unknown = validate("state", "colour: red", STATE_BODY);
  assertCode(unknown, "unknown-field", { field: "colour" });

  const duplicate = validate("state", "id: one\nid: two", STATE_BODY);
  assertCode(duplicate, "duplicate-field", { field: "id" });

  const badNumber = validate("state", "number: yes", STATE_BODY);
  assertCode(badNumber, "unknown-kind", { field: "number", value: "yes" });

  const badId = validate("state", "id: Not-Kebab", STATE_BODY);
  assertCode(badId, "invalid-name");
});
