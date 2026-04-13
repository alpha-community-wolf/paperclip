import { useEffect, useRef, useCallback, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select, type Selection } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { drag as d3Drag } from "d3-drag";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GraphNodeType = "agent" | "project" | "category" | "topic" | "memory" | "file";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: GraphNodeType;
  /** connection count — drives node radius */
  weight: number;
  /** 0–1, used for memory nodes */
  confidence?: number;
  /** Per-node color override (used by file graph for agent-based coloring) */
  color?: string;
  /** extra payload shown in the detail panel */
  meta?: Record<string, unknown>;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  id: string;
  edgeType: string;
}

// ---------------------------------------------------------------------------
// Color palette — "bioluminescent neural observatory"
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<GraphNodeType, { fill: string; glow: string; stroke: string }> = {
  agent:    { fill: "#f472b6", glow: "#f472b680", stroke: "#fb7185" },  // pink-400
  project:  { fill: "#4ade80", glow: "#4ade8080", stroke: "#86efac" },  // green-400
  category: { fill: "#60a5fa", glow: "#60a5fa80", stroke: "#93c5fd" },  // blue-400
  topic:    { fill: "#fb923c", glow: "#fb923c80", stroke: "#fdba74" },  // orange-400
  memory:   { fill: "#94a3b8", glow: "#94a3b840", stroke: "#cbd5e1" },  // slate-400
  file:     { fill: "#a78bfa", glow: "#a78bfa80", stroke: "#c4b5fd" },  // violet-400 (default; overridden per-agent)
};

/** Resolve the display colors for a node, respecting per-node `color` overrides. */
function nodeColors(d: GraphNode): { fill: string; glow: string; stroke: string } {
  if (d.color) {
    return { fill: d.color, glow: d.color + "80", stroke: d.color + "cc" };
  }
  return NODE_COLORS[d.type] ?? { fill: "#94a3b8", glow: "#94a3b840", stroke: "#cbd5e1" };
}

function nodeRadius(n: GraphNode): number {
  if (n.type === "memory") return 3 + Math.min(n.weight, 6);
  if (n.type === "file") return 4 + Math.min(n.weight * 2.5, 18);
  return 8 + Math.min(n.weight * 1.5, 20);
}

function memoryContentPreview(d: GraphNode): string | null {
  if (d.type !== "memory" || !d.meta || typeof d.meta !== "object") return null;
  const c = (d.meta as { content?: unknown }).content;
  return typeof c === "string" ? c : null;
}

/** Native SVG tooltip + full-graph label source */
function nodeHoverCaption(d: GraphNode): string {
  const body = memoryContentPreview(d);
  if (body) return body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
  return `${d.type}: ${d.label}`;
}

// Lucide-aligned paths (24×24), stroke icons on filled nodes — see legend icons on Knowledge Graph page.
type GlyphPart =
  | { k: "p"; d: string; fill?: string }
  | { k: "c"; cx: number; cy: number; r: number; fill?: string; stroke?: boolean };

const NODE_GLYPHS: Record<GraphNodeType, GlyphPart[]> = {
  agent: [
    { k: "p", d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" },
    { k: "c", cx: 12, cy: 7, r: 4, stroke: true },
  ],
  project: [
    {
      k: "p",
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
    },
  ],
  category: [
    { k: "p", d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" },
    { k: "p", d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" },
    { k: "p", d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" },
  ],
  topic: [
    {
      k: "p",
      d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
    },
    { k: "c", cx: 7.5, cy: 7.5, r: 0.5, fill: "rgba(255,255,255,0.92)" },
  ],
  memory: [{ k: "c", cx: 12, cy: 12, r: 10, stroke: true }],
  file: [
    { k: "p", d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" },
    { k: "p", d: "M14 2v5a1 1 0 0 0 1 1h5" },
    { k: "p", d: "M10 9H8" },
    { k: "p", d: "M16 13H8" },
    { k: "p", d: "M16 17H8" },
  ],
};

const GLYPH_STROKE = "rgba(255,255,255,0.92)";
const GLYPH_STROKE_W = 2;

function appendNodeGlyphs(nodeG: Selection<SVGGElement, GraphNode, SVGGElement, unknown>) {
  nodeG.each(function (d: GraphNode) {
    const host = select(this);
    host.select("g.node-glyph").remove();
    const r = nodeRadius(d);
    if (r < 5.25) return;

    const glyph = host.append("g").attr("class", "node-glyph").attr("pointer-events", "none");
    const s = Math.min(0.5, (r * 0.9) / 12);
    // Lucide paths use a 24×24 box centered at (12,12). Scale about that point so the glyph sits on the node center.
    // SVG applies transforms right-to-left: translate then scale → center maps to (0,0) in node space.
    glyph.attr("transform", `scale(${s}) translate(-12, -12)`);

    for (const part of NODE_GLYPHS[d.type]) {
      if (part.k === "p") {
        const p = glyph.append("path").attr("d", part.d);
        if (part.fill) {
          p.attr("fill", part.fill).attr("stroke", "none");
        } else {
          p.attr("fill", "none")
            .attr("stroke", GLYPH_STROKE)
            .attr("stroke-width", GLYPH_STROKE_W)
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round");
        }
      } else {
        const c = glyph.append("circle").attr("cx", part.cx).attr("cy", part.cy).attr("r", part.r);
        if (part.fill) {
          c.attr("fill", part.fill).attr("stroke", "none");
        } else if (part.stroke) {
          c.attr("fill", "none")
            .attr("stroke", GLYPH_STROKE)
            .attr("stroke-width", GLYPH_STROKE_W)
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round");
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Layout (d3-force) — tunable via Knowledge Graph UI popover
// ---------------------------------------------------------------------------

export type KnowledgeGraphLayoutParams = {
  /** Preferred link length (pixels). */
  linkDistance: number;
  /** Positive repulsion magnitude for memory nodes (sim uses negative charge). */
  chargeMemory: number;
  /** Positive repulsion for agent / project / category / topic / file nodes. */
  chargeHub: number;
  /** Extra pixels around each node’s radius for collision (spacing). */
  collidePadding: number;
  /** How strongly nodes are pulled toward the canvas center (0 = free drift). */
  centerGravity: number;
};

export const DEFAULT_KNOWLEDGE_GRAPH_LAYOUT: KnowledgeGraphLayoutParams = {
  linkDistance: 115,
  chargeMemory: 125,
  chargeHub: 320,
  collidePadding: 16,
  centerGravity: 0,
};

function mergeKnowledgeGraphLayout(
  partial?: Partial<KnowledgeGraphLayoutParams> | null,
): KnowledgeGraphLayoutParams {
  return { ...DEFAULT_KNOWLEDGE_GRAPH_LAYOUT, ...partial };
}

const GRAPH_LAYOUT_STORAGE_PREFIX = "paperclip:kg-layout:";

function persistGraphLayoutSnapshot(
  persistenceKey: string,
  nodeData: GraphNode[],
  zoom: ZoomTransform,
) {
  try {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of nodeData) {
      if (n.x != null && n.y != null && Number.isFinite(n.x) && Number.isFinite(n.y)) {
        positions[n.id] = { x: n.x, y: n.y };
      }
    }
    sessionStorage.setItem(
      `${GRAPH_LAYOUT_STORAGE_PREFIX}${persistenceKey}`,
      JSON.stringify({
        positions,
        zoom: { k: zoom.k, x: zoom.x, y: zoom.y },
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  searchTerm?: string;
  selectedNodeId?: string | null;
  /** Neighbors of the selected node (same ids as graph edges); keeps them visible when focusing a selection. */
  linkedNodeIds?: ReadonlySet<string> | null;
  /** When true (neighborhood mode), show a short caption under memory dots — full text still on hover via `<title>`. */
  showMemoryLabels?: boolean;
  /** Force-directed layout tuning; merges with {@link DEFAULT_KNOWLEDGE_GRAPH_LAYOUT}. */
  layout?: Partial<KnowledgeGraphLayoutParams> | null;
  /** When set, node positions + pan/zoom are restored from `sessionStorage` after navigation (per company + graph mode). */
  persistenceKey?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
}

export function KnowledgeGraphCanvas({
  nodes,
  edges,
  searchTerm,
  selectedNodeId,
  linkedNodeIds = null,
  showMemoryLabels = false,
  layout: layoutPartial = null,
  persistenceKey = null,
  onSelectNode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const zoomTransformRef = useRef<ZoomTransform>(zoomIdentity);
  const layoutHydrationKeyRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceKeyRef = useRef(persistenceKey);
  persistenceKeyRef.current = persistenceKey;

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Track dimensions via ResizeObserver
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const parent = svg.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Determine which nodes match the search
  const matchIds = useRef(new Set<string>());
  useEffect(() => {
    const set = new Set<string>();
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q)) set.add(n.id);
      }
    }
    matchIds.current = set;
  }, [searchTerm, nodes]);

  // -----------------------------------------------------------------------
  // Build / rebuild simulation
  // -----------------------------------------------------------------------
  const buildSim = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;

    const { width, height } = dimensions;
    const L = mergeKnowledgeGraphLayout(layoutPartial);
    const nodeIds = new Set(nodes.map((n) => n.id));

    for (const k of [...positionsRef.current.keys()]) {
      if (!nodeIds.has(k)) positionsRef.current.delete(k);
    }

    if (persistenceKey !== layoutHydrationKeyRef.current) {
      layoutHydrationKeyRef.current = persistenceKey;
      zoomTransformRef.current = zoomIdentity;
      if (persistenceKey) {
        try {
          const raw = sessionStorage.getItem(`${GRAPH_LAYOUT_STORAGE_PREFIX}${persistenceKey}`);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              positions?: Record<string, { x?: number; y?: number }>;
              zoom?: { k?: number; x?: number; y?: number };
            };
            if (parsed.positions && typeof parsed.positions === "object") {
              for (const id of nodeIds) {
                const pt = parsed.positions[id];
                if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
                  positionsRef.current.set(id, { x: pt.x, y: pt.y });
                }
              }
            }
            if (parsed.zoom && typeof parsed.zoom.k === "number") {
              zoomTransformRef.current = zoomIdentity
                .translate(parsed.zoom.x ?? 0, parsed.zoom.y ?? 0)
                .scale(parsed.zoom.k);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Ensure we have a root <g>
    const root = select(svg);
    root.selectAll("g.graph-root").remove();
    const g = root.append("g").attr("class", "graph-root");
    gRef.current = g.node();

    // Hit target behind links/nodes: click empty space → clear selection (return to full graph on parent).
    g.append("rect")
      .attr("class", "graph-bg-hit")
      .attr("x", -1e6)
      .attr("y", -1e6)
      .attr("width", 2e6)
      .attr("height", 2e6)
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .style("cursor", "default")
      .on("click", (event) => {
        event.stopPropagation();
        onSelectNode?.(null);
      });

    // Defs — glow filter
    const defs = root.select("defs").empty() ? root.append("defs") : root.select("defs");
    (defs.selectAll as (s: string) => ReturnType<typeof defs.selectAll>)("*").remove();

    const filter = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Clone data so d3 can mutate x/y; seed from last tick / sessionStorage so the graph does not re-explode on each rebuild.
    const nodeData: GraphNode[] = nodes.map((n) => ({ ...n }));
    let seededFromHistory = 0;
    for (const n of nodeData) {
      const p = positionsRef.current.get(n.id);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        n.x = p.x;
        n.y = p.y;
        seededFromHistory++;
      } else {
        n.x = width / 2 + (Math.random() - 0.5) * 120;
        n.y = height / 2 + (Math.random() - 0.5) * 120;
      }
    }
    const nodeMap = new Map(nodeData.map((n) => [n.id, n]));
    const edgeData: GraphEdge[] = edges
      .map((e) => ({
        ...e,
        source: nodeMap.get(typeof e.source === "string" ? e.source : (e.source as GraphNode).id)!,
        target: nodeMap.get(typeof e.target === "string" ? e.target : (e.target as GraphNode).id)!,
      }))
      .filter((e) => e.source && e.target);

    // Links
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(edgeData)
      .join("line")
      .attr("stroke", "var(--color-border)")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 0.8);

    // Node groups
    const nodeG = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodeData, (d) => d.id)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNode?.(d);
      });

    nodeG.append("title").text((d) => nodeHoverCaption(d));

    // Glow circle (behind)
    nodeG
      .append("circle")
      .attr("r", (d) => nodeRadius(d) + 4)
      .attr("fill", (d) => nodeColors(d).glow)
      .attr("filter", "url(#glow)")
      .attr("opacity", 0.6);

    // Main circle
    nodeG
      .append("circle")
      .attr("class", "node-main")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => nodeColors(d).fill)
      .attr("stroke", (d) => nodeColors(d).stroke)
      .attr("stroke-width", 1.5);

    appendNodeGlyphs(nodeG);

    // Labels (memory caption visibility toggled in an effect — avoids rebuilding the sim on drill / breadcrumb).
    nodeG
      .filter((d) => !(d.type === "file" && d.weight === 0))
      .append("text")
      .attr("class", "node-label")
      .each(function (d) {
        const raw =
          d.type === "memory"
            ? (memoryContentPreview(d) ?? d.label)
            : d.label;
        const line =
          d.type === "memory" && raw.length > 42 ? `${raw.slice(0, 42)}…` : raw;
        select(this).text(line);
      })
      .attr("dy", (d) => nodeRadius(d) + (d.type === "memory" ? 11 : 14))
      .attr("text-anchor", "middle")
      .attr("fill", "var(--color-foreground)")
      .attr("font-size", (d) => (d.type === "memory" ? "9px" : "11px"))
      .attr("font-family", "'JetBrains Mono', ui-monospace, monospace")
      .attr("opacity", (d) => (d.type === "memory" ? 0.88 : 1))
      .style("display", (d) => (d.type === "memory" ? "none" : "block"))
      .attr("pointer-events", "none");

    // Drag behaviour
    const dragBehavior = d3Drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeG.call(dragBehavior);

    const schedulePersist = () => {
      const key = persistenceKeyRef.current;
      if (!key) return;
      if (persistTimerRef.current != null) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        persistGraphLayoutSnapshot(key, nodeData, zoomTransformRef.current);
      }, 400);
    };

    // Simulation — cool gently when most nodes already have stable coordinates
    const sim = forceSimulation<GraphNode>(nodeData)
      .alpha(seededFromHistory / Math.max(1, nodeData.length) > 0.65 ? 0.22 : 0.9)
      .alphaDecay(0.045)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edgeData)
          .id((d) => d.id)
          .distance(L.linkDistance),
      )
      .force("charge", forceManyBody().strength((d: SimulationNodeDatum) => {
        const gn = d as GraphNode;
        return gn.type === "memory" ? -L.chargeMemory : -L.chargeHub;
      }))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<GraphNode>().radius((d) => nodeRadius(d) + L.collidePadding))
      .force("x", forceX(width / 2).strength(L.centerGravity))
      .force("y", forceY(height / 2).strength(L.centerGravity))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as GraphNode).x!)
          .attr("y1", (d) => (d.source as GraphNode).y!)
          .attr("x2", (d) => (d.target as GraphNode).x!)
          .attr("y2", (d) => (d.target as GraphNode).y!);

        nodeG.attr("transform", (d) => `translate(${d.x},${d.y})`);

        for (const d of nodeData) {
          if (d.x != null && d.y != null) {
            positionsRef.current.set(d.id, { x: d.x, y: d.y });
          }
        }
        schedulePersist();
      });

    simRef.current = sim;

    // Zoom — restore last pan/zoom; persist on change
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        g.attr("transform", event.transform);
        schedulePersist();
      });

    root.call(zoomBehavior);
    root.call(zoomBehavior.transform, zoomTransformRef.current);

    return () => {
      if (persistTimerRef.current != null) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const key = persistenceKeyRef.current;
      if (key) {
        persistGraphLayoutSnapshot(key, nodeData, zoomTransformRef.current);
      }
      sim.stop();
    };
  }, [nodes, edges, dimensions, onSelectNode, layoutPartial, persistenceKey]);

  useEffect(() => {
    const cleanup = buildSim();
    return () => cleanup?.();
  }, [buildSim]);

  // -----------------------------------------------------------------------
  // Highlight search matches + selected node (via CSS class toggling)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    const sel = select(g);
    const hasSearch = matchIds.current.size > 0;
    const linked = linkedNodeIds;

    const GHOST_NODE_OPACITY = 0.07;

    sel.selectAll<SVGGElement, GraphNode>("g.nodes g").each(function (d) {
      const el = select(this);
      const isMatch = hasSearch && matchIds.current.has(d.id);
      const isSelected = selectedNodeId === d.id;
      const isLinked = !!(linked && linked.has(d.id));
      const inNeighborhood =
        !selectedNodeId || isSelected || isLinked;

      const strokeDefault = nodeColors(d).stroke;
      let stroke = strokeDefault;
      let strokeW = 1.5;
      if (isSelected) {
        stroke = "#facc15";
        strokeW = 3;
      } else if (isLinked) {
        stroke = "#fde047";
        strokeW = 2.4;
      } else if (isMatch && inNeighborhood) {
        stroke = "#fbbf24";
        strokeW = 2.5;
      }

      el.select("circle.node-main").attr("stroke-width", strokeW).attr("stroke", stroke);

      let opacity = 1;
      if (selectedNodeId) {
        if (!inNeighborhood) {
          opacity = GHOST_NODE_OPACITY;
        } else if (hasSearch && !isMatch && !isSelected && !isLinked) {
          opacity = 0.28;
        }
      } else if (hasSearch && !isMatch) {
        opacity = 0.2;
      }

      el.attr("opacity", opacity);
    });

    sel.selectAll<SVGLineElement, GraphEdge>("g.links line").each(function (d) {
      const sId = (d.source as GraphNode).id;
      const tId = (d.target as GraphNode).id;
      const incident = !!(selectedNodeId && (sId === selectedNodeId || tId === selectedNodeId));
      const line = select(this);
      if (!selectedNodeId && !hasSearch) {
        line.attr("stroke-opacity", 0.35).attr("stroke-width", 0.8);
      } else if (selectedNodeId && linked) {
        const sIn = sId === selectedNodeId || linked.has(sId);
        const tIn = tId === selectedNodeId || linked.has(tId);
        if (!sIn && !tIn) {
          line.attr("stroke-opacity", 0.02).attr("stroke-width", 0.45);
        } else if (sIn && tIn) {
          if (incident) {
            line.attr("stroke-opacity", 0.52).attr("stroke-width", 1.35);
          } else {
            line.attr("stroke-opacity", 0.16).attr("stroke-width", 0.72);
          }
        } else {
          line.attr("stroke-opacity", 0.07).attr("stroke-width", 0.65);
        }
      } else if (selectedNodeId) {
        line.attr("stroke-opacity", incident ? 0.55 : 0.1).attr("stroke-width", incident ? 1.4 : 0.75);
      } else {
        line.attr("stroke-opacity", 0.12).attr("stroke-width", 0.8);
      }
    });
  }, [
    searchTerm,
    selectedNodeId,
    linkedNodeIds,
    dimensions.width,
    dimensions.height,
    nodes.length,
    edges.length,
    layoutPartial,
  ]);

  useEffect(() => {
    const gEl = gRef.current;
    if (!gEl) return;
    select(gEl)
      .selectAll<SVGGElement, GraphNode>("g.nodes g")
      .select("text.node-label")
      .style("display", function (d) {
        const n = d as GraphNode;
        if (n.type === "memory") return showMemoryLabels ? "block" : "none";
        return "block";
      });
  }, [
    showMemoryLabels,
    dimensions.width,
    dimensions.height,
    nodes.length,
    edges.length,
    layoutPartial,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-background border border-border">
      {/* Subtle radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, color-mix(in oklab, var(--primary) 6%, transparent) 0%, transparent 70%)",
        }}
      />
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        style={{ display: "block" }}
      />
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No graph data to display
        </div>
      )}
    </div>
  );
}
