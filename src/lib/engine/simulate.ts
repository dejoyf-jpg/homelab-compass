import type { HomelabConfig, Node } from "./types";
import { evaluate } from "./score";

export type Delta =
  | { kind: "add-ram"; nodeId: string; gb: number }
  | { kind: "add-gpu"; nodeId: string; tier: Node["gpu"]["tier"]; vramGB: number; model: string }
  | { kind: "add-nvme"; nodeId: string; sizeGB: number }
  | { kind: "upgrade-lan"; gbps: number }
  | { kind: "upgrade-wan"; downMbps: number; upMbps: number }
  | { kind: "add-ups" }
  | { kind: "add-offsite" }
  | { kind: "add-managed-switch" }
  | { kind: "add-node"; node: Node };


export function applyDeltas(cfg: HomelabConfig, deltas: Delta[]): HomelabConfig {
  const next: HomelabConfig = structuredClone(cfg);
  for (const d of deltas) {
    switch (d.kind) {
      case "add-ram": {
        const n = next.nodes.find((x) => x.id === d.nodeId);
        if (n) n.ramGB += d.gb;
        break;
      }
      case "add-gpu": {
        const n = next.nodes.find((x) => x.id === d.nodeId);
        if (n) n.gpu = { tier: d.tier, vramGB: d.vramGB, model: d.model };
        break;
      }
      case "add-nvme": {
        const n = next.nodes.find((x) => x.id === d.nodeId);
        if (n) n.storage.push({ kind: "nvme", sizeGB: d.sizeGB, count: 1 });
        break;
      }
      case "upgrade-lan":
        next.network.lanGbps = d.gbps;
        break;
      case "upgrade-wan":
        next.network.wanDownMbps = d.downMbps;
        next.network.wanUpMbps = d.upMbps;
        break;
      case "add-ups":
        next.reliability.ups = true;
        break;
      case "add-offsite":
        next.reliability.offsiteBackup = true;
        break;
      case "add-managed-switch":
        next.network.managedSwitch = true;
        next.network.vlansConfigured = true;
        break;
      case "add-node":
        next.nodes.push(d.node);
        break;
    }
  }
  return next;
}

export interface Scenario {
  id: string;
  name: string;
  deltas: Delta[];
}

export type RecCategory = "performance" | "reliability" | "cost" | "network";

export interface Recommendation {
  delta: Delta;
  label: string;
  reason: string;
  gain: number; // projected overall-score gain
  categories: RecCategory[];
  monthlyCostDeltaUSD: number; // added running cost (power) per month
  score: number; // priority-weighted ranking score
}

export type PriorityWeights = Partial<Record<RecCategory, number>>;

export const DEFAULT_WEIGHTS: Required<PriorityWeights> = {
  performance: 1,
  reliability: 1,
  cost: 0,
  network: 1,
};

const CATEGORY_BY_KIND: Record<Delta["kind"], RecCategory[]> = {
  "add-ups": ["reliability"],
  "add-offsite": ["reliability"],
  "add-managed-switch": ["reliability", "network"],
  "upgrade-lan": ["performance", "network"],
  "upgrade-wan": ["performance", "network"],
  "add-ram": ["performance"],
  "add-nvme": ["performance"],
  "add-gpu": ["performance"],
  "add-node": ["performance", "reliability"],
};


function pickWeakestNode(cfg: HomelabConfig, key: "ram" | "storage" | "gpu"): Node | null {
  if (cfg.nodes.length === 0) return null;
  const list = [...cfg.nodes];
  if (key === "ram") list.sort((a, b) => a.ramGB - b.ramGB);
  if (key === "storage") {
    const tb = (n: Node) => n.storage.reduce((a, s) => a + (s.sizeGB * s.count) / 1000, 0);
    list.sort((a, b) => tb(a) - tb(b));
  }
  if (key === "gpu") {
    const rank = { none: 0, igpu: 1, entry: 2, mid: 3, high: 4, datacenter: 5 } as const;
    list.sort((a, b) => rank[a.gpu.tier] - rank[b.gpu.tier]);
  }
  return list[0];
}

function projectedGain(cfg: HomelabConfig, delta: Delta): number {
  const base = evaluate(cfg).overall;
  const after = evaluate(applyDeltas(cfg, [delta])).overall;
  return after - base;
}

function projectedMonthlyCostDelta(cfg: HomelabConfig, delta: Delta): number {
  const base = evaluate(cfg).power.monthlyCostUSD;
  const after = evaluate(applyDeltas(cfg, [delta])).power.monthlyCostUSD;
  return Math.round((after - base) * 100) / 100;
}

export function recommendDeltas(cfg: HomelabConfig): Recommendation[] {

  if (cfg.nodes.length === 0) return [];
  const evalNow = evaluate(cfg);
  const dimBy = Object.fromEntries(evalNow.dimensions.map((d) => [d.key, d.score]));
  const candidates: Delta[] = [];

  // Reliability
  if (!cfg.reliability.ups) candidates.push({ kind: "add-ups" });
  if (!cfg.reliability.offsiteBackup) candidates.push({ kind: "add-offsite" });

  // Network
  if (!cfg.network.managedSwitch) candidates.push({ kind: "add-managed-switch" });
  if (cfg.network.lanGbps < 2.5) candidates.push({ kind: "upgrade-lan", gbps: 2.5 });
  else if (cfg.network.lanGbps < 10 && (dimBy.network ?? 100) < 70)
    candidates.push({ kind: "upgrade-lan", gbps: 10 });
  if (cfg.network.wanUpMbps < 50)
    candidates.push({
      kind: "upgrade-wan",
      downMbps: Math.max(cfg.network.wanDownMbps, 1000),
      upMbps: Math.max(cfg.network.wanUpMbps, 100),
    });

  // Memory
  if ((dimBy.memory ?? 100) < 75) {
    const n = pickWeakestNode(cfg, "ram");
    if (n) candidates.push({ kind: "add-ram", nodeId: n.id, gb: n.ramGB < 16 ? 16 : 32 });
  }

  // Storage — add NVMe if none, else grow weakest
  const hasNvme = cfg.nodes.some((n) => n.storage.some((s) => s.kind === "nvme"));
  if (!hasNvme || (dimBy.storage ?? 100) < 65) {
    const n = pickWeakestNode(cfg, "storage");
    if (n) candidates.push({ kind: "add-nvme", nodeId: n.id, sizeGB: 2000 });
  }

  // GPU — if any workload needs LLM/transcode and best GPU is weak
  const wantsGpu = cfg.workloads.some(
    (w) => w.kind === "llm-inference" || w.kind === "plex-transcode",
  );
  const bestGpuTier = cfg.nodes.reduce<Node["gpu"]["tier"]>(
    (best, n) => {
      const rank = { none: 0, igpu: 1, entry: 2, mid: 3, high: 4, datacenter: 5 } as const;
      return rank[n.gpu.tier] > rank[best] ? n.gpu.tier : best;
    },
    "none",
  );
  if (wantsGpu && (bestGpuTier === "none" || bestGpuTier === "igpu" || bestGpuTier === "entry")) {
    const n = pickWeakestNode(cfg, "gpu");
    if (n) candidates.push({ kind: "add-gpu", nodeId: n.id, tier: "mid", vramGB: 12, model: "RTX 4070-class" });
  }

  // Compute — if compute score low and only 1 node, suggest adding a node
  if ((dimBy.compute ?? 100) < 55 && cfg.nodes.length < 3) {
    candidates.push({
      kind: "add-node",
      node: {
        id: `rec-node-${Date.now()}`,
        name: "Mini-PC (recommended)",
        role: "general",
        cpuModel: "Intel N100",
        cpuCores: 4,
        cpuTier: "low",
        ramGB: 16,
        ecc: false,
        gpu: { model: "", vramGB: 0, tier: "igpu" },
        storage: [{ kind: "nvme", sizeGB: 1000, count: 1 }],
        nicGbps: 2.5,
        idleWatts: 8,
        loadWatts: 25,
      },
    });
  }

  const reasons: Record<Delta["kind"], string> = {
    "add-ups": "Protects VMs and ZFS from power blips.",
    "add-offsite": "Safeguards data against fire, theft, and ransomware.",
    "add-managed-switch": "Unlocks VLANs, port monitoring, and network segmentation.",
    "upgrade-lan": "Removes LAN bottleneck for backups and bulk transfers.",
    "upgrade-wan": "Improves remote access and offsite backup throughput.",
    "add-ram": "Raises VM/container density and cache headroom.",
    "add-nvme": "Cuts VM/database latency dramatically vs spinning rust.",
    "add-gpu": "Enables local LLM inference and hardware transcoding.",
    "add-node": "Adds a second host for HA, quorum, and spare capacity.",
  };

  const labelFor = (d: Delta): string => {
    const node = (id: string) => cfg.nodes.find((n) => n.id === id)?.name ?? id;
    switch (d.kind) {
      case "add-ram": return `+${d.gb}GB RAM on ${node(d.nodeId)}`;
      case "add-gpu": return `Add ${d.tier} GPU (${d.vramGB}GB) to ${node(d.nodeId)}`;
      case "add-nvme": return `+${d.sizeGB}GB NVMe on ${node(d.nodeId)}`;
      case "upgrade-lan": return `Upgrade LAN to ${d.gbps}GbE`;
      case "upgrade-wan": return `WAN → ${d.downMbps}/${d.upMbps} Mbps`;
      case "add-ups": return "Add UPS";
      case "add-offsite": return "Add offsite backup";
      case "add-managed-switch": return "Add managed switch + VLANs";
      case "add-node": return `Add node: ${d.node.name}`;
    }
  };

  return candidates.map((delta) => {
    const gain = projectedGain(cfg, delta);
    const monthlyCostDeltaUSD = projectedMonthlyCostDelta(cfg, delta);
    return {
      delta,
      label: labelFor(delta),
      reason: reasons[delta.kind],
      gain,
      monthlyCostDeltaUSD,
      categories: CATEGORY_BY_KIND[delta.kind],
      score: gain, // filled in by rankRecommendations
    };
  });
}

/**
 * Re-rank + filter recommendations for the user's priorities.
 * - Any category with weight 0 is treated as a hard filter (dropped unless another selected category matches).
 * - `cost` weight penalizes items that add monthly power cost, and rewards those that reduce it.
 */
export function rankRecommendations(
  recs: Recommendation[],
  weights: PriorityWeights,
  limit = 6,
): Recommendation[] {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const anySelected =
    (w.performance > 0 || w.reliability > 0 || w.network > 0);

  const scored = recs
    .filter((r) => {
      if (!anySelected) return true;
      return r.categories.some((c) => c !== "cost" && (w[c] ?? 0) > 0);
    })
    .map((r) => {
      const catBoost = r.categories.reduce(
        (a, c) => a + (c === "cost" ? 0 : (w[c] ?? 0)),
        0,
      );
      // cost weight: 1 => strong penalty per $/mo added; negative delta boosts score
      const costPenalty = (w.cost ?? 0) * r.monthlyCostDeltaUSD * 2;
      const score = r.gain * (1 + 0.35 * catBoost) - costPenalty;
      return { ...r, score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}


