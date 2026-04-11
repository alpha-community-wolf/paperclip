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
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity } from "d3-zoom";
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  searchTerm?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
}

export function KnowledgeGraphCanvas({
  nodes,
  edges,
  searchTerm,
  selectedNodeId,
  onSelectNode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
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

    // Ensure we have a root <g>
    const root = select(svg);
    root.selectAll("g.graph-root").remove();
    const g = root.append("g").attr("class", "graph-root");
    gRef.current = g.node();

    // Defs — glow filter
    const defs = root.select("defs").empty() ? root.append("defs") : root.select("defs");
    (defs.selectAll as (s: string) => ReturnType<typeof defs.selectAll>)("*").remove();

    const filter = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Clone data so d3 can mutate x/y
    const nodeData: GraphNode[] = nodes.map((n) => ({ ...n }));
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
      .on("click", (_event, d) => onSelectNode?.(d));

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

    // Labels: skip memory nodes; skip file nodes with no connections (weight=0)
    nodeG
      .filter((d) => d.type !== "memory" && !(d.type === "file" && d.weight === 0))
      .append("text")
      .text((d) => d.label)
      .attr("dy", (d) => nodeRadius(d) + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--color-foreground)")
      .attr("font-size", "11px")
      .attr("font-family", "'JetBrains Mono', ui-monospace, monospace")
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

    // Simulation
    const sim = forceSimulation<GraphNode>(nodeData)
      .force(
        "link",
        forceLink<GraphNode, GraphEdge>(edgeData)
          .id((d) => d.id)
          .distance(60),
      )
      .force("charge", forceManyBody().strength((d: SimulationNodeDatum) => {
        const gn = d as GraphNode;
        return gn.type === "memory" ? -30 : -120;
      }))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 4))
      .force("x", forceX(width / 2).strength(0.03))
      .force("y", forceY(height / 2).strength(0.03))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as GraphNode).x!)
          .attr("y1", (d) => (d.source as GraphNode).y!)
          .attr("x2", (d) => (d.target as GraphNode).x!)
          .attr("y2", (d) => (d.target as GraphNode).y!);

        nodeG.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    simRef.current = sim;

    // Zoom
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    root.call(zoomBehavior);

    // Fit initial view
    root.call(zoomBehavior.transform, zoomIdentity.translate(0, 0).scale(1));

    return () => {
      sim.stop();
    };
  }, [nodes, edges, dimensions, onSelectNode]);

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

    sel.selectAll<SVGGElement, GraphNode>("g.nodes g").each(function (d) {
      const el = select(this);
      const isMatch = hasSearch && matchIds.current.has(d.id);
      const isSelected = selectedNodeId === d.id;
      const dimmed = (hasSearch && !isMatch) || (selectedNodeId && !isSelected);

      el.select("circle.node-main")
        .attr("stroke-width", isSelected ? 3 : isMatch ? 2.5 : 1.5)
        .attr("stroke", isSelected ? "#facc15" : isMatch ? "#fbbf24" : nodeColors(d).stroke);

      el.attr("opacity", dimmed ? 0.2 : 1);
    });

    // Dim edges when filtering
    sel.selectAll<SVGLineElement, GraphEdge>("g.links line").attr("stroke-opacity", hasSearch || selectedNodeId ? 0.12 : 0.35);
  }, [searchTerm, selectedNodeId]);

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
