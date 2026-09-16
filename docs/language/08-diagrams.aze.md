---
azemark: 2
title: Diagrams
author:
  - AzeForge examples
---

# Diagrams

The diagram family authors one flat, ordered declaration list of nodes, groups, ports, and edges over one shared model, and a required `mode:` selects the structural rules and the layout regime. Read the sections in order: a flowchart first, then the graph and tree regimes, then grouped architecture, and finally the raw Mermaid escape hatch for figures the native model does not cover.

## Flowchart

A flowchart is an ordered flow of steps: nodes carry a shape and a label, edges carry a direction, and a branch is named by the label on the edge that leaves the decision.

A water treatment line is the minimal case — three nodes in authored order with no branch labels, the first drawn as a `circle` and the last as a `cylinder`.

:::: diagram
id: diagram-water-treatment-line
title: Water treatment line
mode: flowchart
flow: top-to-bottom
----
- kind: node
  name: intake
  label: Raw water intake
  shape: circle
- kind: node
  name: filter
  label: Sand filter
- kind: node
  name: chlorinate
  label: Chlorination
  shape: cylinder
- kind: edge
  from: intake
  to: filter
- kind: edge
  from: filter
  to: chlorinate
::::

A quality gate branches: the `diamond` is a shape and nothing more, so the two outgoing edges are told apart by their `label:` fields.

:::: diagram
id: diagram-library-qc
title: Sequencing library check
mode: flowchart
flow: top-to-bottom
----
- kind: node
  name: assay
  label: Measure library yield
  shape: parallelogram
- kind: node
  name: gate
  label: Passes QC?
  shape: diamond
- kind: node
  name: sequence
  label: Load sequencer
- kind: node
  name: hold
  label: Hold for review
- kind: edge
  from: assay
  to: gate
- kind: edge
  from: gate
  to: sequence
  label: pass
- kind: edge
  from: gate
  to: hold
  label: fail
::::

Warming a cache closes the graph back into the classifier, and a flowchart admits that cycle: placement is engine-derived, so a loop is drawn rather than rejected.

:::: diagram
id: diagram-branching-process
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

## Graph

Graph mode drops the flow reading and keeps only adjacency, so `direction: undirected` is permitted and two records may join the same pair of nodes.

A collaboration graph is a plain undirected adjacency list: three nodes, three labelled links, and no implied hierarchy.

:::: diagram
id: diagram-collaboration-graph
title: Collaboration graph
mode: graph
flow: left-to-right
----
- kind: node
  name: ana
  label: Ana
  shape: circle
- kind: node
  name: bo
  label: Bo
  shape: circle
- kind: node
  name: wet-lab
  label: Wet lab
  shape: rounded
- kind: edge
  from: ana
  to: bo
  label: co-author
  direction: undirected
- kind: edge
  from: bo
  to: wet-lab
  label: member
  direction: undirected
- kind: edge
  from: ana
  to: wet-lab
  label: member
  direction: undirected
::::

Parallel edges stay distinct records: the two links between the substations differ only by authored order and label, and neither is folded into the other.

:::: diagram
id: diagram-substation-links
title: Substation links
mode: graph
flow: left-to-right
----
- kind: node
  name: north
  label: North substation
  shape: hexagon
- kind: node
  name: south
  label: South substation
  shape: hexagon
- kind: node
  name: hydro
  label: Hydro plant
  shape: cylinder
- kind: node
  name: city
  label: City load
- kind: edge
  from: north
  to: south
  label: 132 kV line
  direction: undirected
- kind: edge
  from: north
  to: south
  label: 33 kV line
  direction: undirected
- kind: edge
  from: hydro
  to: north
  label: penstock
  direction: undirected
- kind: edge
  from: south
  to: city
  label: distribution
  direction: undirected
::::

## Tree

Tree mode keeps the flow reading and adds structure: exactly one root, exactly one incoming edge per other node, no cycle, and one connected component.

A specimen classification is the minimal tree — one root, two branches, and leaves that carry no incident edge other than their parent.

:::: diagram
id: diagram-specimen-tree
title: Specimen classification
mode: tree
flow: top-to-bottom
----
- kind: node
  name: specimen
  label: Specimen
  shape: rounded
- kind: node
  name: plant
  label: Plant
- kind: node
  name: animal
  label: Animal
- kind: node
  name: fern
  label: Fern
- kind: node
  name: moss
  label: Moss
- kind: edge
  from: specimen
  to: plant
- kind: edge
  from: specimen
  to: animal
- kind: edge
  from: plant
  to: fern
- kind: edge
  from: plant
  to: moss
::::

Forward references are the hard case: every edge is authored before the nodes it names and the group follows its member, so the whole declaration list resolves in two passes. A tree admits exactly one root and exactly one incoming edge per other node.

:::: diagram
id: diagram-tree-forward-refs
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
  parent: printing
- kind: group
  name: printing
  label: Printing
::::

## Architecture

Architecture mode adds containment: groups nest and are containers only, never edge endpoints, while ports are named attachment points with no direction and no electrical meaning.

A two-tier build pipeline is the minimal architecture — two flat groups, each holding at least one node, joined by directed edges.

:::: diagram
id: diagram-build-tiers
title: Build tiers
mode: architecture
flow: left-to-right
----
- kind: group
  name: build
  label: Build tier
- kind: group
  name: publish
  label: Publish tier
- kind: node
  name: builder
  label: Builder
  parent: build
- kind: node
  name: signer
  label: Signer
  parent: publish
- kind: node
  name: registry
  label: Registry
  parent: publish
- kind: edge
  from: builder
  to: signer
- kind: edge
  from: signer
  to: registry
::::

Nesting goes deeper and edges attach to named ports: `node.port` names one attachment point, `side:` places it on the node's box, and the undirected links carry no reading direction.

:::: diagram
id: diagram-signalling-rooms
title: Signalling rooms
mode: architecture
flow: left-to-right
----
- kind: group
  name: north-yard
  label: North yard
- kind: group
  name: control
  label: Control centre
  parent: north-yard
- kind: group
  name: field
  label: Field equipment
  parent: control
- kind: node
  name: controller
  label: Route controller
  parent: north-yard
  ports:
    - name: uplink
      side: right
- kind: node
  name: interlocking
  label: Interlocking
  parent: control
  shape: rounded
  ports:
    - name: panel
      side: top
    - name: trackside
      side: bottom
- kind: node
  name: signal
  label: Trackside signal
  parent: field
  shape: diamond
  ports:
    - name: feed
      side: top
- kind: edge
  from: controller.uplink
  to: interlocking.panel
  direction: undirected
- kind: edge
  from: interlocking.trackside
  to: signal.feed
  label: drive
  direction: undirected
::::

Nested groups, ports and undirected multi-edges meet in one Block: containment carries no connectivity, and the two undirected links from the catalog to the replica differ only by authored order and label.

:::: diagram
id: diagram-service-architecture
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

## Mermaid escape hatch

The Mermaid escape hatch takes bounded Mermaid source as the Block body and renders it through the pinned browser path; the header carries only `id`, `title`, and `description`, and the diagram type comes from the first body line.

A left-to-right flowchart is the smallest useful Mermaid figure, with a retry edge closing the loop.

:::: mermaid
id: mermaid-release-flow
title: Release flow
description: Validate, render, and retry until the source is clean
----
flowchart LR
  source[Write source] --> validate[Validate]
  validate --> render[Render]
  validate --> fix[Fix diagnostics]
  fix --> validate
::::

A sequence diagram authors lanes and then an ordered exchange; the dashed arrow is a return.

:::: mermaid
id: mermaid-sensor-exchange
title: Sensor exchange
description: A reading travels from sensor to store and is acknowledged
----
sequenceDiagram
  participant sensor
  participant gateway
  participant store
  sensor->>gateway: Reading
  gateway->>store: Persist
  store-->>gateway: Ack
  gateway-->>sensor: Confirmed
::::

A state machine reads as labelled transitions between named states, with `[*]` marking entry and exit.

:::: mermaid
id: mermaid-connection-states
title: Connection states
description: Idle, calibrating, and measuring transitions with cancel and completion
----
stateDiagram-v2
  [*] --> Idle
  Idle --> Calibrating: start
  Calibrating --> Idle: cancel
  Calibrating --> Measuring: ready
  Measuring --> [*]: complete
::::
