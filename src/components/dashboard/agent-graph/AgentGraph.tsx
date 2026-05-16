'use client';

import { useMemo } from 'react';
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
import { cn } from '@/lib/utils/cn';
import type { AgentPhase, SystemMode } from '@/lib/types/agent';

const PHASE_NODE_ID: Partial<Record<AgentPhase, string>> = {
  plan: 'plan',
  retrieve: 'retrieve',
  reflect: 'reflect',
  self_correct: 'self_correct',
  respond: 'respond',
};

type GraphNode = { id: string; label: string; sub?: string };

const GRAPH_NODES: GraphNode[] = [
  { id: 'query', label: 'User Query', sub: 'input' },
  { id: 'plan', label: 'Plan', sub: 'classify + decompose' },
  { id: 'retrieve', label: 'Retrieve', sub: 'hybrid vector+keyword' },
  { id: 'sources', label: 'Sources', sub: 'pgvector + trgm' },
  { id: 'reflect', label: 'Reflect', sub: 'quality assessment' },
  { id: 'self_correct', label: 'Self-Correct', sub: 'query rewrite' },
  { id: 'webllm', label: 'Local WebLLM', sub: 'browser-native AI' },
  { id: 'respond', label: 'Respond', sub: 'grounded answer' },
];

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  query:        { x: 110, y: 0 },
  plan:         { x: 110, y: 80 },
  retrieve:     { x: 110, y: 160 },
  sources:      { x: 290, y: 160 },
  reflect:      { x: 110, y: 240 },
  self_correct: { x: 110, y: 320 },
  webllm:       { x: 290, y: 320 },
  respond:      { x: 110, y: 400 },
};

// Each edge explicitly names its handle ids so React Flow can resolve connection points.
const EDGES: Array<{
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}> = [
  { source: 'query',       target: 'plan',         sourceHandle: 'bottom', targetHandle: 'top'    },
  { source: 'plan',        target: 'retrieve',      sourceHandle: 'bottom', targetHandle: 'top'    },
  { source: 'retrieve',    target: 'sources',       sourceHandle: 'right',  targetHandle: 'left'   },
  { source: 'retrieve',    target: 'reflect',       sourceHandle: 'bottom', targetHandle: 'top'    },
  { source: 'reflect',     target: 'self_correct',  sourceHandle: 'bottom', targetHandle: 'top'    },
  { source: 'self_correct',target: 'webllm',        sourceHandle: 'right',  targetHandle: 'left'   },
  { source: 'self_correct',target: 'respond',       sourceHandle: 'bottom', targetHandle: 'top'    },
];

function nodeColor(
  nodeId: string,
  activeNodeId: string | undefined,
  phase: AgentPhase,
  systemMode: SystemMode
): { border: string; glow: string; text: string; bg: string } {
  const isActive = nodeId === activeNodeId;
  const isWebLLM = nodeId === 'webllm';
  const isWebLLMActive = isWebLLM && systemMode === 'local-webllm';

  if (isActive || isWebLLMActive) {
    const c = isWebLLMActive
      ? { border: '#8b5cf6', glow: 'rgba(139,92,246,0.5)', text: '#c4b5fd', bg: 'rgba(139,92,246,0.12)' }
      : phase === 'error'
      ? { border: '#ef4444', glow: 'rgba(239,68,68,0.5)', text: '#fca5a5', bg: 'rgba(239,68,68,0.12)' }
      : { border: '#22d3ee', glow: 'rgba(34,211,238,0.5)', text: '#a5f3fc', bg: 'rgba(34,211,238,0.12)' };
    return c;
  }
  if (nodeId === 'sources') {
    return { border: '#8b5cf6', glow: 'transparent', text: '#c4b5fd', bg: 'rgba(139,92,246,0.06)' };
  }
  return { border: 'rgba(255,255,255,0.1)', glow: 'transparent', text: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.03)' };
}

// ── Custom node — defined outside AgentGraph so nodeTypes is referentially stable ──

type CustomNodeData = {
  label: string;
  sub?: string;
  colors: ReturnType<typeof nodeColor>;
  isActive: boolean;
};

const HANDLE_STYLE: React.CSSProperties = { opacity: 0, width: 6, height: 6 };

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

// Stable reference — defined once at module level so React Flow never remounts nodes.
const NODE_TYPES = { custom: AivoraGraphNode };

// ─────────────────────────────────────────────────────────────────────────────

type AgentGraphProps = {
  phase: AgentPhase;
  systemMode: SystemMode;
  className?: string;
};

export function AgentGraph({ phase, systemMode, className }: AgentGraphProps) {
  const activeNodeId = PHASE_NODE_ID[phase];

  const nodes: Node[] = useMemo(
    () =>
      GRAPH_NODES.map((n) => {
        const colors = nodeColor(n.id, activeNodeId, phase, systemMode);
        const isActive = n.id === activeNodeId || (n.id === 'webllm' && systemMode === 'local-webllm');
        return {
          id: n.id,
          position: NODE_POSITIONS[n.id] ?? { x: 0, y: 0 },
          data: { label: n.label, sub: n.sub, colors, isActive },
          type: 'custom',
          draggable: false,
          selectable: false,
        };
      }),
    [activeNodeId, phase, systemMode]
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGES.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: phase !== 'idle',
        style: { stroke: 'rgba(34,211,238,0.2)', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(34,211,238,0.3)', width: 10, height: 10 },
      })),
    [phase]
  );

  return (
    <div className={cn('relative w-full h-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
    </div>
  );
}
