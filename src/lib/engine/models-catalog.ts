import { z } from "zod";
import type { HomelabConfig, Node, Workload } from "./types";
import { estimateLlmTokensPerSec } from "./score";

export type ModelHosting = "local" | "hosted";

export interface ModelParamDefaults {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  contextTokens: number;
}

export interface ModelSpec {
  id: string;
  name: string;
  vendor: string;
  hosting: ModelHosting;
  // local models
  weightsGB?: number;
  minVramGB?: number;
  // hosted models
  endpoint?: string;
  costPer1MInputUSD?: number;
  costPer1MOutputUSD?: number;
  // both
  strengths: string[];
  defaults: ModelParamDefaults;
}

/**
 * A pragmatic catalog. Prices/sizes are approximate defaults —
 * the goal is to give the user sane starting parameters, not a live price feed.
 */
export const MODEL_CATALOG: ModelSpec[] = [
  // ─── Local (Ollama / llama.cpp style) ─────────────────────────────
  {
    id: "local:llama-3.1-8b-q4",
    name: "Llama 3.1 8B (Q4_K_M)",
    vendor: "Meta / Ollama",
    hosting: "local",
    weightsGB: 5,
    minVramGB: 8,
    strengths: ["General chat", "Coding help", "Runs on a single mid-range GPU"],
    defaults: { temperature: 0.7, topP: 0.9, maxOutputTokens: 1024, contextTokens: 8192 },
  },
  {
    id: "local:qwen2.5-14b-q4",
    name: "Qwen 2.5 14B (Q4_K_M)",
    vendor: "Alibaba / Ollama",
    hosting: "local",
    weightsGB: 9,
    minVramGB: 12,
    strengths: ["Strong reasoning for its size", "Multilingual", "Good tool-calling"],
    defaults: { temperature: 0.6, topP: 0.9, maxOutputTokens: 2048, contextTokens: 32768 },
  },
  {
    id: "local:mixtral-8x7b-q4",
    name: "Mixtral 8x7B (Q4_K_M)",
    vendor: "Mistral / Ollama",
    hosting: "local",
    weightsGB: 26,
    minVramGB: 28,
    strengths: ["MoE — fast inference for size", "Strong reasoning", "Needs a high-VRAM GPU"],
    defaults: { temperature: 0.6, topP: 0.9, maxOutputTokens: 2048, contextTokens: 32768 },
  },
  {
    id: "local:llama-3.1-70b-q4",
    name: "Llama 3.1 70B (Q4_K_M)",
    vendor: "Meta / Ollama",
    hosting: "local",
    weightsGB: 40,
    minVramGB: 48,
    strengths: ["Frontier-class local model", "Best local quality", "Datacenter-class GPU required"],
    defaults: { temperature: 0.7, topP: 0.9, maxOutputTokens: 2048, contextTokens: 32768 },
  },

  // ─── Hosted (recommended integrations) ────────────────────────────
  {
    id: "hosted:openai/gpt-5.4-mini",
    name: "GPT-5.4 mini",
    vendor: "OpenAI",
    hosting: "hosted",
    endpoint: "https://ai.gateway.lovable.dev/v1",
    costPer1MInputUSD: 0.25,
    costPer1MOutputUSD: 2.0,
    strengths: ["Strong general model", "Very low latency", "Cheap per token"],
    defaults: { temperature: 0.7, topP: 1, maxOutputTokens: 4096, contextTokens: 200_000 },
  },
  {
    id: "hosted:openai/gpt-5.5",
    name: "GPT-5.5",
    vendor: "OpenAI",
    hosting: "hosted",
    endpoint: "https://ai.gateway.lovable.dev/v1",
    costPer1MInputUSD: 3.0,
    costPer1MOutputUSD: 12.0,
    strengths: ["Frontier reasoning & coding", "Long context", "Best for hard tasks"],
    defaults: { temperature: 0.4, topP: 1, maxOutputTokens: 8192, contextTokens: 400_000 },
  },
  {
    id: "hosted:google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    vendor: "Google",
    hosting: "hosted",
    endpoint: "https://ai.gateway.lovable.dev/v1",
    costPer1MInputUSD: 0.15,
    costPer1MOutputUSD: 0.6,
    strengths: ["Multimodal (text + image + audio + video)", "Huge context", "Great $/token"],
    defaults: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096, contextTokens: 1_000_000 },
  },
  {
    id: "hosted:google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    vendor: "Google",
    hosting: "hosted",
    endpoint: "https://ai.gateway.lovable.dev/v1",
    costPer1MInputUSD: 1.25,
    costPer1MOutputUSD: 10.0,
    strengths: ["Top-tier multimodal reasoning", "Very long context", "Best when quality > latency"],
    defaults: { temperature: 0.4, topP: 0.95, maxOutputTokens: 8192, contextTokens: 2_000_000 },
  },
];

export interface ModelRecommendation {
  model: ModelSpec;
  fit: "ok" | "tight" | "insufficient" | "hosted";
  detail: string;
  estimatedTokPerSec?: number;
  estimatedMonthlyCostUSD?: number;
}

function bestGpuNode(cfg: HomelabConfig): Node | null {
  const rank = { none: 0, igpu: 1, entry: 2, mid: 3, high: 4, datacenter: 5 } as const;
  return cfg.nodes.reduce<Node | null>(
    (best, n) => (!best || rank[n.gpu.tier] > rank[best.gpu.tier] ? n : best),
    null,
  );
}

export function recommendModelsForWorkload(
  cfg: HomelabConfig,
  w: Workload,
  opts: { monthlyRequests?: number; avgTokensIn?: number; avgTokensOut?: number } = {},
): ModelRecommendation[] {
  if (w.kind !== "llm-inference") return [];

  const gpu = bestGpuNode(cfg);
  const targetTps = Number(w.params.targetTokPerSec ?? 15);
  const reqPerMonth = opts.monthlyRequests ?? 3000;
  const tokIn = opts.avgTokensIn ?? 800;
  const tokOut = opts.avgTokensOut ?? 400;

  return MODEL_CATALOG.map((m): ModelRecommendation => {
    if (m.hosting === "local") {
      if (!gpu || gpu.gpu.tier === "none") {
        return { model: m, fit: "insufficient", detail: "No local GPU available." };
      }
      const vram = gpu.gpu.vramGB;
      if (vram < (m.minVramGB ?? 0)) {
        return {
          model: m,
          fit: "insufficient",
          detail: `Needs ${m.minVramGB}GB VRAM, GPU has ${vram}GB.`,
        };
      }
      const tps = estimateLlmTokensPerSec(gpu, m.weightsGB ?? 8) ?? 0;
      const status: ModelRecommendation["fit"] = tps >= targetTps ? "ok" : "tight";
      return {
        model: m,
        fit: status,
        estimatedTokPerSec: tps,
        detail: `~${tps} tok/s on ${gpu.name} (target ${targetTps}).`,
      };
    }
    // hosted
    const cost =
      ((m.costPer1MInputUSD ?? 0) * tokIn + (m.costPer1MOutputUSD ?? 0) * tokOut) *
      (reqPerMonth / 1_000_000);
    return {
      model: m,
      fit: "hosted",
      estimatedMonthlyCostUSD: Math.round(cost * 100) / 100,
      detail: `~$${cost.toFixed(2)}/mo at ${reqPerMonth} req · ${tokIn} in / ${tokOut} out tok.`,
    };
  });
}
