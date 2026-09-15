---
azemark: 2
title: Diagram mode scenarios
author: AzeForge Proto
---

# Diagram scenarios

This document exercises the General diagrams family against the contract §13 scenarios: a branching process with a cycle, a tree written with forward references, and a grouped service architecture with nested groups, ports and undirected multi-edges. All three share one node/edge/group/port model and differ only in the `mode:` that selects structural validation and the layout regime.

// Branching process (contract §13): a flowchart whose cache warms back into the
// classifier, so the graph is cyclic. `classify` is a shape, not a semantic
// claim, and the cycle is legal outside `tree`.

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

// Tree with forward references (contract §13): every edge is authored before
// the nodes it names and the group follows its member, so the whole declaration
// list resolves in two passes. A tree admits exactly one root and exactly one
// incoming edge per other node.

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

// Grouped service architecture (contract §13): nested groups carry containment
// only and are never edge endpoints, ports name attachment points without
// direction or electrical meaning, and undirected multi-edges stay ordered.

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

Layout is total: every valid Block renders, including the cyclic flowchart and the disconnected branch of the tree scenario above. Placement is engine-derived and never becomes connectivity — two nodes are adjacent when an `- kind: edge` says so, and reordering the declaration list can move pixels without changing what the document means.
