import type { HomelabConfig, Node } from "./types";
import { evaluate } from "./score";

export type Delta =
  | { kind: "add-ram"; nodeId: string; gb: number }
  | { kind: "add-gpu"; nodeId: string; tier: Node["gpu"]["tier"]; vramGB: number; model: string }
  | {
      kind: "add-egpu";
      nodeId: string;
      tier: Node["gpu"]["tier"];
      vramGB: number;
      model: string;
      interconnect: "thunderbolt" | "oculink" | "usb4";
    }
  | {
      kind: "add-cloud-gpu";
      provider: string; // e.g. "RunPod", "Lambda", "Vast.ai"
      tier: Node["gpu"]["tier"];
      vramGB: number;
      model: string; // e.g. "A100 80GB", "L40S"
      monthlyUSD: number; // expected monthly spend at your duty cycle
    }
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
      case "add-egpu": {
        const n = next.nodes.find((x) => x.id === d.nodeId);
        if (n) {
          n.gpu = { tier: d.tier, vramGB: d.vramGB, model: `${d.model} (eGPU ${d.interconnect})` };
          // enclosure + interconnect overhead
          n.loadWatts += 35;
          n.idleWatts += 8;
          if (n.nicGbps < 1) n.nicGbps = 1;
        }
        break;
      }
      case "add-cloud-gpu": {
        // Virtual node representing a rented cloud GPU — no local power draw.
        next.nodes.push({
          id: `cloud-${d.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
          name: `Cloud GPU: ${d.provider} ${d.model}`,
          role: "cloud-gpu",
          cpuModel: `${d.provider} host`,
          cpuCores: 8,
          cpuTier: "server",
          ramGB: 64,
          ecc: true,
          gpu: { model: d.model, vramGB: d.vramGB, tier: d.tier },
          storage: [{ kind: "nvme", sizeGB: 500, count: 1 }],
          nicGbps: 10,
          idleWatts: 0,
          loadWatts: 0,
        });
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

export type RecCategory =
  | "performance"
  | "reliability"
  | "network"
  | "cost"
  | "power"
  | "noise"
  | "space";

export const POSITIVE_CATEGORIES: RecCategory[] = ["performance", "reliability", "network"];
export const NEGATIVE_CATEGORIES: RecCategory[] = ["cost", "power", "noise", "space"];

export interface Recommendation {
  delta: Delta;
  label: string;
  reason: string;
  gain: number; // projected overall-score gain
  categories: RecCategory[];
  monthlyCostDeltaUSD: number; // added running cost (power) per month
  score: number; // priority-weighted ranking score
  upfrontCostUSD: number; // one-time hardware cost estimate
  addedNodes: number; // physical units added
  requiresDiscreteGpu: boolean;
  requiresFreeNvmeSlot: boolean;
  feasible: boolean;
  blockedReasons: string[];
}

export type PriorityWeights = Partial<Record<RecCategory, number>>;

/** Weights are 0..3 (Off / Low / Medium / High). */
export const DEFAULT_WEIGHTS: Required<PriorityWeights> = {
  performance: 2,
  reliability: 2,
  network: 2,
  cost: 1,
  power: 1,
  noise: 1,
  space: 1,
};

export interface Constraints {
  maxBudgetUSD?: number;              // total upfront budget for the stacked scenario
  maxMonthlyPowerCostUSD?: number;    // cap on total simulated $/mo (baseline + adds)
  maxAddedNodes?: number;             // physical units you have room for
  allowDiscreteGpu?: boolean;         // false = suggest only iGPU / no-GPU changes
  maxNvmeSlotsPerNode?: number;       // e.g. 2 for a mini-PC
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  allowDiscreteGpu: true,
  maxNvmeSlotsPerNode: 4,
};

const CATEGORY_BY_KIND: Record<Delta["kind"], RecCategory[]> = {
  "add-ups": ["reliability", "space"],
  "add-offsite": ["reliability", "cost"],
  "add-managed-switch": ["reliability", "network", "space", "power"],
  "upgrade-lan": ["performance", "network", "power"],
  "upgrade-wan": ["performance", "network", "cost"],
  "add-ram": ["performance"],
  "add-nvme": ["performance", "space"],
  "add-gpu": ["performance", "power", "noise"],
  "add-egpu": ["performance", "power", "noise", "space"],
  "add-cloud-gpu": ["performance", "cost"],
  "add-node": ["performance", "reliability", "power", "noise", "space"],

};

const GPU_TIER_COST: Record<Node["gpu"]["tier"], number> = {
  none: 0, igpu: 0, entry: 220, mid: 550, high: 1200, datacenter: 4000,
};

/** Rough hardware cost estimate for a single delta, in USD. */
export function estimateUpfrontCost(delta: Delta): number {
  switch (delta.kind) {
    case "add-ram": return Math.round(delta.gb * 4);
    case "add-nvme": return Math.round(delta.sizeGB * 0.08);
    case "add-gpu": return GPU_TIER_COST[delta.tier] ?? 500;
    case "add-egpu": return (GPU_TIER_COST[delta.tier] ?? 500) + 250; // GPU + enclosure
    case "add-cloud-gpu": return 0; // pay-as-you-go, no upfront hardware

    case "upgrade-lan": return delta.gbps >= 10 ? 350 : delta.gbps >= 2.5 ? 120 : 60;
    case "upgrade-wan": return 0; // ISP plan change, not hardware
    case "add-ups": return 220;
    case "add-offsite": return 0; // subscription — counted in monthly if user cares
    case "add-managed-switch": return 180;
    case "add-node": return 500;
  }
}

function metaFor(cfg: HomelabConfig, delta: Delta) {
  const addedNodes = delta.kind === "add-node" ? 1 : 0;
  const requiresDiscreteGpu =
    delta.kind === "add-gpu" && delta.tier !== "igpu" && delta.tier !== "none";
  const requiresFreeNvmeSlot = delta.kind === "add-nvme";
  return { addedNodes, requiresDiscreteGpu, requiresFreeNvmeSlot };
}

function checkConstraints(
  cfg: HomelabConfig,
  delta: Delta,
  cumulative: { upfrontUSD: number; addedNodes: number; monthlyCostAfterUSD: number },
  c: Constraints,
): string[] {
  const reasons: string[] = [];
  const cost = estimateUpfrontCost(delta);
  const meta = metaFor(cfg, delta);

  if (c.maxBudgetUSD != null && cumulative.upfrontUSD + cost > c.maxBudgetUSD) {
    reasons.push(
      `Over budget: needs $${cost} (running total $${cumulative.upfrontUSD + cost} > $${c.maxBudgetUSD}).`,
    );
  }
  if (
    c.maxMonthlyPowerCostUSD != null &&
    cumulative.monthlyCostAfterUSD > c.maxMonthlyPowerCostUSD
  ) {
    reasons.push(
      `Would push monthly power to $${cumulative.monthlyCostAfterUSD} (cap $${c.maxMonthlyPowerCostUSD}).`,
    );
  }
  if (c.maxAddedNodes != null && cumulative.addedNodes + meta.addedNodes > c.maxAddedNodes) {
    reasons.push(`No physical space for another node (cap ${c.maxAddedNodes}).`);
  }
  if (meta.requiresDiscreteGpu && c.allowDiscreteGpu === false) {
    reasons.push("Discrete GPUs disallowed by your compatibility setting.");
  }
  if (meta.requiresFreeNvmeSlot && c.maxNvmeSlotsPerNode != null) {
    const nodeId = (delta as Extract<Delta, { kind: "add-nvme" }>).nodeId;
    const target = cfg.nodes.find((n) => n.id === nodeId);
    const used = target?.storage.filter((s) => s.kind === "nvme").length ?? 0;
    if (used >= c.maxNvmeSlotsPerNode) {
      reasons.push(`No free NVMe slot on ${target?.name ?? "node"} (max ${c.maxNvmeSlotsPerNode}).`);
    }
  }
  return reasons;
}



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
    const meta = metaFor(cfg, delta);
    return {
      delta,
      label: labelFor(delta),
      reason: reasons[delta.kind],
      gain,
      monthlyCostDeltaUSD,
      categories: CATEGORY_BY_KIND[delta.kind],
      score: gain,
      upfrontCostUSD: estimateUpfrontCost(delta),
      addedNodes: meta.addedNodes,
      requiresDiscreteGpu: meta.requiresDiscreteGpu,
      requiresFreeNvmeSlot: meta.requiresFreeNvmeSlot,
      feasible: true,
      blockedReasons: [],
    };
  });
}

/**
 * Enforce budget / power / space / compatibility constraints against the base
 * config, applying candidate deltas greedily in the order caller provides.
 * Infeasible recommendations are annotated (feasible=false, blockedReasons=[...])
 * so the UI can filter or explain them.
 */
export function applyConstraints(
  cfg: HomelabConfig,
  recs: Recommendation[],
  constraints: Constraints,
): Recommendation[] {
  const cumulative = {
    upfrontUSD: 0,
    addedNodes: 0,
    monthlyCostAfterUSD: evaluate(cfg).power.monthlyCostUSD,
  };
  return recs.map((r) => {
    const nextMonthly =
      Math.round((cumulative.monthlyCostAfterUSD + r.monthlyCostDeltaUSD) * 100) / 100;
    const reasons = checkConstraints(
      cfg,
      r.delta,
      {
        upfrontUSD: cumulative.upfrontUSD,
        addedNodes: cumulative.addedNodes,
        monthlyCostAfterUSD: nextMonthly,
      },
      constraints,
    );
    if (reasons.length === 0) {
      cumulative.upfrontUSD += r.upfrontCostUSD;
      cumulative.addedNodes += r.addedNodes;
      cumulative.monthlyCostAfterUSD = nextMonthly;
    }
    return { ...r, feasible: reasons.length === 0, blockedReasons: reasons };
  });
}


/**
 * Re-rank + filter recommendations for the user's priorities.
 * Weights are 0..3.
 * - Positive categories (performance, reliability, network) boost matching items.
 * - Negative categories (cost, power, noise, space) penalize items tagged with them;
 *   `cost` also scales with the monthly $ delta.
 * - Items with no positive tag matching a >0 weight are dropped when at least one
 *   positive weight is set.
 */
export function rankRecommendations(
  recs: Recommendation[],
  weights: PriorityWeights,
  limit = 6,
): Recommendation[] {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const anyPositive = POSITIVE_CATEGORIES.some((c) => (w[c] ?? 0) > 0);

  const scored = recs
    .filter((r) => {
      if (!anyPositive) return true;
      return r.categories.some((c) => POSITIVE_CATEGORIES.includes(c) && (w[c] ?? 0) > 0);
    })
    .map((r) => {
      const posBoost = r.categories.reduce(
        (a, c) => (POSITIVE_CATEGORIES.includes(c) ? a + (w[c] ?? 0) : a),
        0,
      );
      const negTagPenalty = r.categories.reduce(
        (a, c) => (NEGATIVE_CATEGORIES.includes(c) && c !== "cost" ? a + (w[c] ?? 0) : a),
        0,
      );
      // cost weight: scales per $/mo added; negative delta rewards
      const costPenalty = (w.cost ?? 0) * r.monthlyCostDeltaUSD * 2;
      const score = r.gain * (1 + 0.25 * posBoost) - costPenalty - negTagPenalty * 1.5;
      return { ...r, score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}



