'use client';

import { useMemo, useState } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import { Network, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { AgentPhase, SystemMode } from '@/lib/types/agent';
import type { SourceCitation } from '@/lib/types/citation';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph/entity-extractor';
import type { EntityType, KnowledgeEntity } from '@/lib/knowledge-graph/entity-extractor';

// ── Pipeline graph constants ──────────────────────────────────────────────────

const PHASE_NODE_ID: Partial<Record<AgentPhase, string>> = {
  plan: 'plan',
  retrieve: 'retrieve',
  reflect: 'reflect',
  self_correct: 'self_correct',
  respond: 'respond',
};

type PipelineNode = { id: string; label: string; sub?: string };

const PIPELINE_GRAPH_NODES: PipelineNode[] = [
  { id: 'query',        label: 'User Query',    sub: 'input' },
  { id: 'plan',         label: 'Plan',          sub: 'classify + decompose' },
  { id: 'retrieve',     label: 'Retrieve',      sub: 'hybrid vector+keyword' },
  { id: 'sources',      label: 'Sources',       sub: 'pgvector + trgm' },
  { id: 'reflect',      label: 'Reflect',       sub: 'quality assessment' },
  { id: 'self_correct', label: 'Self-Correct',  sub: 'query rewrite' },
  { id: 'webllm',       label: 'Local WebLLM',  sub: 'browser-native AI' },
  { id: 'respond',      label: 'Respond',       sub: 'grounded answer' },
];

const PIPELINE_POSITIONS: Record<string, { x: number; y: number }> = {
  query:        { x: 110, y: 0 },
  plan:         { x: 110, y: 80 },
  retrieve:     { x: 110, y: 160 },
  sources:      { x: 290, y: 160 },
  reflect:      { x: 110, y: 240 },
  self_correct: { x: 110, y: 320 },
  webllm:       { x: 290, y: 320 },
  respond:      { x: 110, y: 400 },
};

const PIPELINE_EDGES_DEF: Array<{
  source: string; target: string; sourceHandle: string; targetHandle: string;
}> = [
  { source: 'query',        target: 'plan',         sourceHandle: 'bottom', targetHandle: 'top'   },
  { source: 'plan',         target: 'retrieve',     sourceHandle: 'bottom', targetHandle: 'top'   },
  { source: 'retrieve',     target: 'sources',      sourceHandle: 'right',  targetHandle: 'left'  },
  { source: 'retrieve',     target: 'reflect',      sourceHandle: 'bottom', targetHandle: 'top'   },
  { source: 'reflect',      target: 'self_correct', sourceHandle: 'bottom', targetHandle: 'top'   },
  { source: 'self_correct', target: 'webllm',       sourceHandle: 'right',  targetHandle: 'left'  },
  { source: 'self_correct', target: 'respond',      sourceHandle: 'bottom', targetHandle: 'top'   },
];

// ── Pipeline node colour helper ───────────────────────────────────────────────

function pipelineNodeColor(
  nodeId: string,
  activeNodeId: string | undefined,
  phase: AgentPhase,
  systemMode: SystemMode,
): { border: string; glow: string; text: string; bg: string } {
  const isActive = nodeId === activeNodeId;
  const isWebLLMActive = nodeId === 'webllm' && systemMode === 'local-webllm';
  if (isActive || isWebLLMActive) {
    if (isWebLLMActive)
      return { border: '#8b5cf6', glow: 'rgba(139,92,246,0.5)',  text: '#c4b5fd', bg: 'rgba(139,92,246,0.12)' };
    if (phase === 'error')
      return { border: '#ef4444', glow: 'rgba(239,68,68,0.5)',   text: '#fca5a5', bg: 'rgba(239,68,68,0.12)'  };
    return   { border: '#22d3ee', glow: 'rgba(34,211,238,0.5)',  text: '#a5f3fc', bg: 'rgba(34,211,238,0.12)' };
  }
  if (nodeId === 'sources')
    return { border: '#8b5cf6', glow: 'transparent', text: '#c4b5fd', bg: 'rgba(139,92,246,0.06)' };
  return { border: 'rgba(255,255,255,0.1)', glow: 'transparent', text: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.03)' };
}

// ── Entity type palette ───────────────────────────────────────────────────────

type EntityPalette = { border: string; bg: string; text: string; badge: string };

const ENTITY_PALETTE: Record<EntityType, EntityPalette> = {
  person:  { border: '#22d3ee', bg: 'rgba(34,211,238,0.08)',  text: '#a5f3fc', badge: '#22d3ee' },
  place:   { border: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', text: '#c4b5fd', badge: '#8b5cf6' },
  date:    { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', text: '#fcd34d', badge: '#f59e0b' },
  event:   { border: '#10b981', bg: 'rgba(16,185,129,0.08)', text: '#6ee7b7', badge: '#10b981' },
  concept: { border: '#f43f5e', bg: 'rgba(244,63,94,0.08)',  text: '#fda4af', badge: '#f43f5e' },
};

// Pentagon angles in React Flow space (0°=right, 90°=down)
const TYPE_ANGLES_DEG: Record<EntityType, number> = {
  person:  270, // top
  place:   342, // top-right
  date:     54, // bottom-right
  event:   126, // bottom-left
  concept: 198, // top-left
};

const KG_RADIUS = 175;

function computeKnowledgeLayout(
  entities: KnowledgeEntity[],
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {
    __hub__: { x: -36, y: -36 }, // offset so 72×72 hub is visually centred at origin
  };

  const byType = new Map<EntityType, KnowledgeEntity[]>();
  for (const e of entities) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e);
    byType.set(e.type, arr);
  }

  for (const [type, group] of byType.entries()) {
    const baseRad = (TYPE_ANGLES_DEG[type] * Math.PI) / 180;
    const fanRad  = ((Math.min(group.length - 1, 3) * 24) * Math.PI) / 180; // max 72° fan
    const step    = group.length > 1 ? fanRad / (group.length - 1) : 0;
    const start   = baseRad - fanRad / 2;

    group.forEach((e, i) => {
      const angle = start + i * step;
      positions[e.id] = {
        x: Math.round(KG_RADIUS * Math.cos(angle) - 48), // -48 centres ~96px-wide entity card
        y: Math.round(KG_RADIUS * Math.sin(angle) - 22), // -22 centres ~44px-tall entity card
      };
    });
  }

  return positions;
}

// ── Custom nodes — all defined at module level for stable NODE_TYPES ─────────

const HANDLE_STYLE: React.CSSProperties = { opacity: 0, width: 6, height: 6 };

// Pipeline node ---

type CustomNodeData = {
  label: string; sub?: string;
  colors: ReturnType<typeof pipelineNodeColor>;
  isActive: boolean;
};

function AivoraGraphNode({ data }: { data: CustomNodeData }) {
  return (
    <>
      <Handle type="target" position={Position.Top}   id="top"    style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left}  id="left"   style={HANDLE_STYLE} />
      <motion.div
        animate={
          data.isActive
            ? { boxShadow: [`0 0 0px ${data.colors.glow}`, `0 0 16px ${data.colors.glow}`, `0 0 0px ${data.colors.glow}`] }
            : {}
        }
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{
          background: data.colors.bg,
          border: `1px solid ${data.colors.border}`,
          borderRadius: 10,
          padding: '6px 12px',
          minWidth: 120,
        }}
      >
        <div className="text-[11px] font-semibold" style={{ color: data.colors.text }}>
          {data.label}
        </div>
        {data.sub && (
          <div className="text-[9px] mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {data.sub}
          </div>
        )}
      </motion.div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right}  id="right"  style={HANDLE_STYLE} />
    </>
  );
}

// Knowledge hub ---

type HubNodeData = { label: string };

function KnowledgeHubNode({ data }: { data: HubNodeData }) {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="s-top"    style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left}   id="s-left"   style={HANDLE_STYLE} />
      <motion.div
        animate={{
          boxShadow: [
            '0 0 0px rgba(34,211,238,0.3)',
            '0 0 22px rgba(34,211,238,0.5)',
            '0 0 0px rgba(34,211,238,0.3)',
          ],
        }}
        transition={{ duration: 2.2, repeat: Infinity }}
        style={{
          background: 'rgba(34,211,238,0.06)',
          border: '1px solid rgba(34,211,238,0.35)',
          borderRadius: '50%',
          width: 72,
          height: 72,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <div className="text-[8px] font-bold text-cyan-300 uppercase tracking-widest">
          Knowledge
        </div>
        <div
          className="text-[7px] font-mono text-white/30 leading-tight text-center"
          style={{ maxWidth: 58 }}
        >
          {data.label.length > 16 ? data.label.slice(0, 14) + '…' : data.label}
        </div>
      </motion.div>
      <Handle type="target" position={Position.Top}    id="t-top"    style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right}  id="t-right"  style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left}   id="t-left"   style={HANDLE_STYLE} />
    </>
  );
}

// Entity node ---

type EntityNodeData = {
  label: string;
  type: EntityType;
  frequency: number;
  palette: EntityPalette;
};

function EntityGraphNode({ data }: { data: EntityNodeData }) {
  const { palette, label, type, frequency } = data;
  return (
    <>
      <Handle type="target" position={Position.Top}    id="t-top"    style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right}  id="t-right"  style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left}   id="t-left"   style={HANDLE_STYLE} />
      <div
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          borderRadius: 8,
          padding: '5px 10px',
          minWidth: 80,
          maxWidth: 120,
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <span
            className="text-[7px] font-bold uppercase tracking-widest px-1 py-0.5 rounded"
            style={{
              color: palette.badge,
              background: `${palette.badge}18`,
              border: `1px solid ${palette.badge}28`,
            }}
          >
            {type}
          </span>
          {frequency > 1 && (
            <span className="text-[8px] font-mono" style={{ color: palette.badge }}>
              ×{frequency}
            </span>
          )}
        </div>
        <div className="text-[10px] font-semibold leading-tight" style={{ color: palette.text }}>
          {label}
        </div>
      </div>
      <Handle type="source" position={Position.Top}    id="s-top"    style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right}  id="s-right"  style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left}   id="s-left"   style={HANDLE_STYLE} />
    </>
  );
}

// Stable reference — defined at module level so React Flow never remounts nodes.
const NODE_TYPES = {
  custom: AivoraGraphNode,
  hub: KnowledgeHubNode,
  entity: EntityGraphNode,
};

// ── Component ────────────────────────────────────────────────────────────────

type GraphMode = 'pipeline' | 'knowledge';

type AgentGraphProps = {
  phase: AgentPhase;
  systemMode: SystemMode;
  citations?: SourceCitation[];
  className?: string;
};

export function AgentGraph({ phase, systemMode, citations = [], className }: AgentGraphProps) {
  const [graphMode, setGraphMode] = useState<GraphMode>('pipeline');
  const activeNodeId = PHASE_NODE_ID[phase];

  // ── Pipeline nodes / edges ────────────────────────────────────────────────
  const pipelineNodes: Node[] = useMemo(
    () =>
      PIPELINE_GRAPH_NODES.map((n) => {
        const colors = pipelineNodeColor(n.id, activeNodeId, phase, systemMode);
        const isActive = n.id === activeNodeId || (n.id === 'webllm' && systemMode === 'local-webllm');
        return {
          id: n.id,
          position: PIPELINE_POSITIONS[n.id] ?? { x: 0, y: 0 },
          data: { label: n.label, sub: n.sub, colors, isActive },
          type: 'custom',
          draggable: false,
          selectable: false,
        };
      }),
    [activeNodeId, phase, systemMode],
  );

  const pipelineEdges: Edge[] = useMemo(
    () =>
      PIPELINE_EDGES_DEF.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: phase !== 'idle',
        style: { stroke: 'rgba(34,211,238,0.2)', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(34,211,238,0.3)', width: 10, height: 10 },
      })),
    [phase],
  );

  // ── Knowledge graph nodes / edges ─────────────────────────────────────────
  const kg = useMemo(() => buildKnowledgeGraph(citations), [citations]);
  const hasEntities = kg.entities.length > 0;

  const knowledgeNodes: Node[] = useMemo(() => {
    if (!hasEntities) return [];
    const positions = computeKnowledgeLayout(kg.entities);

    const hub: Node = {
      id: '__hub__',
      position: positions['__hub__'] ?? { x: 0, y: 0 },
      data: { label: kg.sourceLabel },
      type: 'hub',
      draggable: false,
      selectable: false,
    };

    const entityNodes: Node[] = kg.entities.map((e) => ({
      id: e.id,
      position: positions[e.id] ?? { x: 0, y: 0 },
      data: { label: e.label, type: e.type, frequency: e.frequency, palette: ENTITY_PALETTE[e.type] },
      type: 'entity',
      draggable: false,
      selectable: false,
    }));

    return [hub, ...entityNodes];
  }, [kg, hasEntities]);

  const knowledgeEdges: Edge[] = useMemo(() => {
    if (!hasEntities) return [];

    const spokeEdges: Edge[] = kg.entities.map((e) => ({
      id: `spoke:${e.id}`,
      source: '__hub__',
      target: e.id,
      type: 'straight',
      animated: false,
      style: { stroke: `${ENTITY_PALETTE[e.type].border}45`, strokeWidth: 1, strokeDasharray: '4 3' },
    }));

    const coEdges: Edge[] = kg.edges.map((edge) => {
      const srcEntity = kg.entities.find((e) => e.id === edge.source);
      const color = srcEntity ? ENTITY_PALETTE[srcEntity.type].border : 'rgba(255,255,255,0.3)';
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: true,
        style: { stroke: `${color}70`, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: `${color}90`, width: 7, height: 7 },
      };
    });

    return [...spokeEdges, ...coEdges];
  }, [kg, hasEntities]);

  return (
    <div className={cn('relative w-full h-full flex flex-col', className)}>

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
          <button
            onClick={() => setGraphMode('pipeline')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider transition-all',
              graphMode === 'pipeline'
                ? 'bg-cyan-400/15 border border-cyan-400/25 text-cyan-300'
                : 'text-white/30 hover:text-white/60',
            )}
          >
            <Share2 className="w-2.5 h-2.5" />
            Agent Loop
          </button>
          <button
            onClick={() => setGraphMode('knowledge')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider transition-all',
              graphMode === 'knowledge'
                ? 'bg-violet-400/15 border border-violet-400/25 text-violet-300'
                : 'text-white/30 hover:text-white/60',
            )}
          >
            <Network className="w-2.5 h-2.5" />
            Knowledge
          </button>
        </div>
        {graphMode === 'knowledge' && hasEntities && (
          <span className="text-[8px] font-mono text-white/25">
            {kg.entities.length} entities · {kg.edges.length} links
          </span>
        )}
      </div>

      {/* ── Graph canvas ── */}
      <div className="flex-1 relative overflow-hidden">

        {graphMode === 'pipeline' && (
          <ReactFlow
            nodes={pipelineNodes}
            edges={pipelineEdges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            preventScrolling={false}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(34,211,238,0.06)"
            />
          </ReactFlow>
        )}

        {graphMode === 'knowledge' && !hasEntities && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center">
              <Network className="w-4 h-4 text-white/15" />
            </div>
            <p className="text-white/25 text-xs font-mono leading-relaxed">
              No entities extracted yet.
              <br />
              Ask a question or run a document action to populate the knowledge graph.
            </p>
          </div>
        )}

        {graphMode === 'knowledge' && hasEntities && (
          <ReactFlow
            nodes={knowledgeNodes}
            edges={knowledgeEdges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1.4 }}
            proOptions={{ hideAttribution: true }}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            preventScrolling={false}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(139,92,246,0.06)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
