import type { HomelabConfig, Node, Workload } from "./types";

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-100
  notes: string[];
}

export interface Evaluation {
  overall: number;
  dimensions: DimensionScore[];
  bottlenecks: string[];
  power: { totalIdleW: number; totalLoadW: number; monthlyCostUSD: number };
  workloadFit: WorkloadFit[];
}

export interface WorkloadFit {
  workloadId: string;
  label: string;
  status: "ok" | "tight" | "insufficient";
  detail: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const cpuTierScore: Record<Node["cpuTier"], number> = {
  low: 30,
  mid: 60,
  high: 85,
  server: 95,
};

const gpuTierVram: Record<Node["gpu"]["tier"], number> = {
  none: 0,
  igpu: 0,
  entry: 8,
  mid: 12,
  high: 24,
  datacenter: 40,
};

const gpuTierPerf: Record<Node["gpu"]["tier"], number> = {
  none: 0,
  igpu: 15,
  entry: 45,
  mid: 70,
  high: 90,
  datacenter: 100,
};

function scoreCompute(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  if (cfg.nodes.length === 0) return { key: "compute", label: "Compute", score: 0, notes: ["No nodes defined."] };
  const totalCores = cfg.nodes.reduce((a, n) => a + n.cpuCores, 0);
  const bestTier = cfg.nodes.reduce((a, n) => Math.max(a, cpuTierScore[n.cpuTier]), 0);
  const coreScore = clamp((totalCores / 24) * 100);
  const score = clamp(0.5 * bestTier + 0.5 * coreScore);
  if (totalCores < 8) notes.push("Fewer than 8 total CPU cores — VM/container density will be limited.");
  if (bestTier < 60) notes.push("No mid/high-tier CPU present.");
  return { key: "compute", label: "Compute", score, notes };
}

function scoreMemory(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  const totalRam = cfg.nodes.reduce((a, n) => a + n.ramGB, 0);
  const anyEcc = cfg.nodes.some((n) => n.ecc);
  const ramScore = clamp((totalRam / 128) * 100);
  const eccBonus = anyEcc ? 10 : 0;
  const score = clamp(ramScore + eccBonus);
  if (totalRam < 32) notes.push("Under 32GB total RAM — tight for multi-VM Proxmox / TrueNAS.");
  if (!anyEcc) notes.push("No ECC memory detected — consider ECC for ZFS/NAS workloads.");
  return { key: "memory", label: "Memory", score, notes };
}

function scoreStorage(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  let totalTB = 0;
  let hasNvme = false;
  let hasHdd = false;
  for (const n of cfg.nodes) {
    for (const s of n.storage) {
      totalTB += (s.sizeGB * s.count) / 1000;
      if (s.kind === "nvme") hasNvme = true;
      if (s.kind === "hdd") hasHdd = true;
    }
  }
  const capScore = clamp((totalTB / 20) * 100);
  const tierBonus = (hasNvme ? 15 : 0) + (hasHdd ? 5 : 0);
  const score = clamp(0.7 * capScore + tierBonus);
  if (totalTB < 2) notes.push("Under 2TB total storage.");
  if (!hasNvme) notes.push("No NVMe present — VM latency and DB workloads will suffer.");
  return { key: "storage", label: "Storage", score, notes };
}

function scoreNetwork(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  const lan = cfg.network.lanGbps;
  const lanScore = lan >= 10 ? 100 : lan >= 2.5 ? 75 : lan >= 1 ? 45 : 20;
  const wanScore = clamp(((cfg.network.wanDownMbps + cfg.network.wanUpMbps * 3) / 1500) * 100);
  const mgmtBonus = (cfg.network.managedSwitch ? 8 : 0) + (cfg.network.vlansConfigured ? 8 : 0);
  const score = clamp(0.6 * lanScore + 0.3 * wanScore + mgmtBonus);
  if (lan < 2.5) notes.push("LAN backbone under 2.5GbE — bulk transfers/backups will bottleneck.");
  if (!cfg.network.managedSwitch) notes.push("No managed switch — no VLANs, no port monitoring.");
  if (cfg.network.wanUpMbps < 20) notes.push("Low WAN upload — remote access & offsite backup will be slow.");
  return { key: "network", label: "Network", score, notes };
}

function scorePower(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  const loadW = cfg.nodes.reduce((a, n) => a + n.loadWatts, 0);
  const idleW = cfg.nodes.reduce((a, n) => a + n.idleWatts, 0);
  const perNodeAvg = cfg.nodes.length ? idleW / cfg.nodes.length : 0;
  let score = 80;
  if (perNodeAvg > 80) score -= 25;
  if (perNodeAvg > 150) score -= 25;
  if (loadW > 800) score -= 15;
  if (perNodeAvg > 80) notes.push(`Average idle draw ${perNodeAvg.toFixed(0)}W/node — look at efficient N100/Ryzen options.`);
  if (loadW > 800) notes.push("Total load draw over 800W — check circuit and cooling.");
  return { key: "power", label: "Power & Thermal", score: clamp(score), notes };
}

function scoreReliability(cfg: HomelabConfig): DimensionScore {
  const notes: string[] = [];
  let score = 20;
  if (cfg.reliability.ups) score += 25; else notes.push("No UPS — a power blip can corrupt VMs and ZFS.");
  if (cfg.reliability.offsiteBackup) score += 25; else notes.push("No offsite backup — your data isn't safe from fire/theft.");
  if (cfg.reliability.raid !== "none") score += 15; else notes.push("No redundant array — single-disk failure = downtime.");
  if (cfg.reliability.monitoring) score += 15; else notes.push("No monitoring — you'll notice outages last.");
  return { key: "reliability", label: "Reliability", score: clamp(score), notes };
}

function scoreNoise(cfg: HomelabConfig): DimensionScore {
  // Higher score = quieter. Estimated from acoustic proxies since we don't
  // model chassis/fans directly: spinning HDDs, rackmount server CPUs,
  // blower-style datacenter GPUs, sustained load wattage, and node count.
  const notes: string[] = [];
  if (cfg.nodes.length === 0) {
    return { key: "noise", label: "Noise", score: 100, notes: ["No nodes — silent."] };
  }
  let score = 95;

  const hddCount = cfg.nodes.reduce(
    (a, n) => a + n.storage.filter((s) => s.kind === "hdd" || s.kind === "sas").reduce((b, s) => b + s.count, 0),
    0,
  );
  if (hddCount >= 2) {
    const penalty = Math.min(25, 4 + hddCount * 2);
    score -= penalty;
    notes.push(`${hddCount} spinning disks — audible hum/seek under load.`);
  }

  const serverCpus = cfg.nodes.filter((n) => n.cpuTier === "server").length;
  if (serverCpus > 0) {
    score -= 20 + (serverCpus - 1) * 8;
    notes.push(`${serverCpus} server-tier CPU node${serverCpus > 1 ? "s" : ""} — rackmount fans are loud at spin-up and under load.`);
  }

  const loudGpus = cfg.nodes.filter((n) => n.gpu.tier === "datacenter").length;
  const highGpus = cfg.nodes.filter((n) => n.gpu.tier === "high").length;
  if (loudGpus > 0) {
    score -= 20;
    notes.push("Datacenter GPU present — blower fans are shrill under inference load.");
  } else if (highGpus > 0) {
    score -= 6;
  }

  const totalLoadW = cfg.nodes.reduce((a, n) => a + n.loadWatts, 0);
  if (totalLoadW > 600) {
    score -= 10;
    notes.push(`Total load draw ${totalLoadW}W — sustained cooling will be audible.`);
  } else if (totalLoadW > 300) {
    score -= 4;
  }

  if (cfg.nodes.length >= 4) {
    score -= 4;
    notes.push(`${cfg.nodes.length} nodes running — combined fan noise adds up.`);
  }

  if (score >= 85) notes.push("Fine for a living room or bedroom-adjacent closet.");
  else if (score >= 65) notes.push("Better placed in an office or utility room.");
  else if (score >= 40) notes.push("Best isolated to a garage, basement, or dedicated closet.");
  else notes.push("Rack-loud — plan for a soundproofed room or separate structure.");

  return { key: "noise", label: "Noise", score: clamp(score), notes };
}

export function estimateLlmTokensPerSec(node: Node, modelSizeGB: number): number | null {
  if (node.gpu.tier === "none") return null;
  const vram = Math.max(node.gpu.vramGB, gpuTierVram[node.gpu.tier]);
  if (vram < modelSizeGB) return null;
  const perf = gpuTierPerf[node.gpu.tier];
  // rough: bigger model → fewer tok/s. baseline: perf/modelSize scaling.
  return Math.round((perf / Math.max(modelSizeGB, 4)) * 6);
}

function evaluateWorkloads(cfg: HomelabConfig): WorkloadFit[] {
  const fits: WorkloadFit[] = [];
  for (const w of cfg.workloads) {
    fits.push(evaluateWorkload(cfg, w));
  }
  return fits;
}

function evaluateWorkload(cfg: HomelabConfig, w: Workload): WorkloadFit {
  const totalRam = cfg.nodes.reduce((a, n) => a + n.ramGB, 0);
  const totalCores = cfg.nodes.reduce((a, n) => a + n.cpuCores, 0);
  const bestGpu = cfg.nodes.reduce<Node | null>((best, n) => {
    if (n.gpu.tier === "none") return best;
    if (!best) return n;
    return gpuTierPerf[n.gpu.tier] > gpuTierPerf[best.gpu.tier] ? n : best;
  }, null);

  switch (w.kind) {
    case "llm-inference": {
      const size = Number(w.params.modelSizeGB ?? 8);
      const target = Number(w.params.targetTokPerSec ?? 15);
      if (!bestGpu) return { workloadId: w.id, label: w.label, status: "insufficient", detail: "No GPU available for inference." };
      const tps = estimateLlmTokensPerSec(bestGpu, size);
      if (tps == null) return { workloadId: w.id, label: w.label, status: "insufficient", detail: `Model needs ~${size}GB VRAM, GPU can't hold it.` };
      if (tps < target) return { workloadId: w.id, label: w.label, status: "tight", detail: `~${tps} tok/s vs target ${target}.` };
      return { workloadId: w.id, label: w.label, status: "ok", detail: `~${tps} tok/s (target ${target}).` };
    }
    case "plex-transcode": {
      const streams = Number(w.params.streams ?? 2);
      const has = cfg.nodes.some((n) => n.gpu.tier !== "none");
      if (!has) return { workloadId: w.id, label: w.label, status: streams > 1 ? "insufficient" : "tight", detail: "No HW transcoding — CPU-only can't handle multiple 4K streams." };
      return { workloadId: w.id, label: w.label, status: "ok", detail: `HW transcoding supports ~${streams * 3} concurrent streams.` };
    }
    case "vms":
    case "containers": {
      const count = Number(w.params.count ?? 5);
      const ramPer = Number(w.params.ramPerGB ?? 4);
      const coresPer = Number(w.params.coresEach ?? 1);
      const needRam = count * ramPer + 8;
      const needCores = count * coresPer + 2;
      if (totalRam < needRam) return { workloadId: w.id, label: w.label, status: "insufficient", detail: `Need ${needRam}GB RAM, have ${totalRam}GB.` };
      if (totalCores < needCores * 0.6) return { workloadId: w.id, label: w.label, status: "tight", detail: `Cores tight: ${totalCores} vs ~${needCores} needed.` };
      return { workloadId: w.id, label: w.label, status: "ok", detail: `${count} × ${ramPer}GB fits in ${totalRam}GB RAM.` };
    }
    case "backup": {
      const dataTB = Number(w.params.dataTB ?? 1);
      const upMbps = cfg.network.wanUpMbps;
      const hours = upMbps > 0 ? (dataTB * 1000 * 8) / (upMbps * 3.6) : Infinity;
      if (hours === Infinity) return { workloadId: w.id, label: w.label, status: "insufficient", detail: "No WAN upload configured." };
      if (hours > 48) return { workloadId: w.id, label: w.label, status: "tight", detail: `Initial seed ~${hours.toFixed(0)}h at ${upMbps} Mbps upload.` };
      return { workloadId: w.id, label: w.label, status: "ok", detail: `Initial seed ~${hours.toFixed(1)}h.` };
    }
    default:
      return { workloadId: w.id, label: w.label, status: "ok", detail: "No specific model — assumed OK." };
  }
}

export function evaluate(cfg: HomelabConfig): Evaluation {
  const dims = [
    scoreCompute(cfg),
    scoreMemory(cfg),
    scoreStorage(cfg),
    scoreNetwork(cfg),
    scorePower(cfg),
    scoreReliability(cfg),
    scoreNoise(cfg),
  ];
  const overall = Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length);
  const bottlenecks = dims
    .filter((d) => d.score < 55)
    .flatMap((d) => d.notes.map((n) => `[${d.label}] ${n}`));

  const totalIdleW = cfg.nodes.reduce((a, n) => a + n.idleWatts, 0);
  const totalLoadW = cfg.nodes.reduce((a, n) => a + n.loadWatts, 0);
  // assume 70% idle / 30% load duty cycle
  const avgW = totalIdleW * 0.7 + totalLoadW * 0.3;
  const monthlyKwh = (avgW / 1000) * 24 * 30;
  const monthlyCostUSD = Math.round(monthlyKwh * cfg.kWhCost * 100) / 100;

  return {
    overall,
    dimensions: dims,
    bottlenecks,
    power: { totalIdleW, totalLoadW, monthlyCostUSD },
    workloadFit: evaluateWorkloads(cfg),
  };
}
