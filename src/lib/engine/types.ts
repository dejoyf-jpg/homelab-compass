import { z } from "zod";

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().default("general"), // e.g. "hypervisor", "nas", "gaming", "edge"
  cpuModel: z.string().default(""),
  cpuCores: z.number().int().nonnegative().default(0),
  cpuTier: z.enum(["low", "mid", "high", "server"]).default("mid"),
  ramGB: z.number().nonnegative().default(0),
  ecc: z.boolean().default(false),
  gpu: z
    .object({
      model: z.string().default(""),
      vramGB: z.number().nonnegative().default(0),
      tier: z.enum(["none", "igpu", "entry", "mid", "high", "datacenter"]).default("none"),
    })
    .default({ model: "", vramGB: 0, tier: "none" }),
  storage: z
    .array(
      z.object({
        kind: z.enum(["nvme", "sata-ssd", "hdd", "sas"]).default("sata-ssd"),
        sizeGB: z.number().nonnegative().default(0),
        count: z.number().int().positive().default(1),
      }),
    )
    .default([]),
  nicGbps: z.number().nonnegative().default(1),
  idleWatts: z.number().nonnegative().default(30),
  loadWatts: z.number().nonnegative().default(90),
});
export type Node = z.infer<typeof NodeSchema>;

export const NetworkSchema = z.object({
  lanGbps: z.number().nonnegative().default(1),
  wifi: z.enum(["none", "wifi5", "wifi6", "wifi6e", "wifi7"]).default("wifi6"),
  wanDownMbps: z.number().nonnegative().default(300),
  wanUpMbps: z.number().nonnegative().default(20),
  vlansConfigured: z.boolean().default(false),
  managedSwitch: z.boolean().default(false),
});
export type Network = z.infer<typeof NetworkSchema>;

export const ReliabilitySchema = z.object({
  ups: z.boolean().default(false),
  offsiteBackup: z.boolean().default(false),
  raid: z.enum(["none", "mirror", "raidz1", "raidz2", "raid10"]).default("none"),
  monitoring: z.boolean().default(false),
});
export type Reliability = z.infer<typeof ReliabilitySchema>;

export const WorkloadSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "llm-inference",
    "plex-transcode",
    "vms",
    "containers",
    "backup",
    "game-server",
    "home-assistant",
    "ci-runner",
    "other",
  ]),
  label: z.string(),
  // free-form params: model size GB, target tok/s, concurrent streams, count, etc.
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type Workload = z.infer<typeof WorkloadSchema>;

export const HomelabConfigSchema = z.object({
  labName: z.string().default("My Homelab"),
  location: z.string().default(""),
  kWhCost: z.number().nonnegative().default(0.15),
  nodes: z.array(NodeSchema).default([]),
  network: NetworkSchema.default({
    lanGbps: 1,
    wifi: "wifi6",
    wanDownMbps: 300,
    wanUpMbps: 20,
    vlansConfigured: false,
    managedSwitch: false,
  }),
  reliability: ReliabilitySchema.default({
    ups: false,
    offsiteBackup: false,
    raid: "none",
    monitoring: false,
  }),
  workloads: z.array(WorkloadSchema).default([]),
  notes: z.string().default(""),
});
export type HomelabConfig = z.infer<typeof HomelabConfigSchema>;

export const emptyConfig = (): HomelabConfig => HomelabConfigSchema.parse({});
