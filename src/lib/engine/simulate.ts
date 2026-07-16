import type { HomelabConfig, Node } from "./types";

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
