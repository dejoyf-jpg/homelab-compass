import { HomelabConfigSchema, type HomelabConfig, type Node } from "./engine/types";

const CPU_PATTERNS: Array<[RegExp, Node["cpuTier"], number]> = [
  [/ultra\s*9|i9|ryzen\s*9|threadripper|xeon|epyc/i, "high", 16],
  [/ultra\s*7|i7|ryzen\s*7/i, "high", 12],
  [/ultra\s*5|i5|ryzen\s*5|n100/i, "mid", 6],
  [/celeron|pentium|atom/i, "low", 4],
];

function coerceNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonLike(raw: string): unknown | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  const candidates = new Set<string>();
  for (let i = cleaned.length - 1; i > start; i -= 1) {
    if (cleaned[i] === "}") candidates.add(cleaned.slice(start, i + 1));
  }

  for (const candidate of candidates) {
    const attempts = [
      candidate,
      candidate.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"),
      candidate
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/"notes"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?}\s*$/, (_, notes: string) => {
          const safeNotes = notes.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          return `"notes":"${safeNotes}"}`;
        }),
    ];

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch {
        // Try the next repair strategy.
      }
    }
  }

  return null;
}

function normalizeConfig(input: unknown): HomelabConfig | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const base = HomelabConfigSchema.parse({});

  const merged = {
    ...base,
    ...data,
    kWhCost: coerceNumber(data.kWhCost, base.kWhCost),
    nodes: Array.isArray(data.nodes) ? data.nodes : base.nodes,
    network: typeof data.network === "object" && data.network ? { ...base.network, ...data.network } : base.network,
    reliability:
      typeof data.reliability === "object" && data.reliability
        ? { ...base.reliability, ...data.reliability }
        : base.reliability,
    workloads: Array.isArray(data.workloads) ? data.workloads : base.workloads,
    notes: typeof data.notes === "string" ? data.notes : base.notes,
  };

  const parsed = HomelabConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

function extractFirstNumber(text: string, pattern: RegExp, fallback: number) {
  const match = text.match(pattern);
  return match ? coerceNumber(match[1], fallback) : fallback;
}

function inferCpu(text: string) {
  const cpuModel =
    text.match(/(?:intel\s+)?core\s+ultra\s+\d+\s+\w+|i[3579]-?\d{4,5}[a-z]*|ryzen\s+\d\s+\d{4,5}[a-z]*|intel\s+n100|xeon\s+[\w-]+|epyc\s+[\w-]+/i)?.[0] ??
    "CPU";
  const pattern = CPU_PATTERNS.find(([regex]) => regex.test(cpuModel) || regex.test(text));
  return {
    cpuModel,
    cpuTier: pattern?.[1] ?? "mid",
    cpuCores: extractFirstNumber(text, /(\d+)\s*(?:cpu\s*)?cores?/i, pattern?.[2] ?? 8),
  };
}

function inferGpu(text: string): Node["gpu"] {
  const model = text.match(/rtx\s*\d{4}(?:\s*laptop)?|tesla\s+\w+|quadro\s+\w+|radeon\s+[\w\s-]+/i)?.[0] ?? "";
  const vramGB = extractFirstNumber(text, /(\d+(?:\.\d+)?)\s*GB\s+(?:physical\s+)?VRAM/i, model ? 8 : 0);
  const tier: Node["gpu"]["tier"] = /4090|3090|4080|datacenter|tesla|a\d{2,}/i.test(model)
    ? "high"
    : /4070|3080|3070|3060|4060/i.test(model)
      ? "mid"
      : model
        ? "entry"
        : /igpu|integrated/i.test(text)
          ? "igpu"
          : "none";
  return { model, vramGB, tier };
}

function inferStorage(text: string): Node["storage"] {
  const storage: Node["storage"] = [];
  for (const match of text.matchAll(/(?:(\d+)x)?\s*(\d+(?:\.\d+)?)\s*(TB|GB)\s*(NVMe|SSD|HDD|SAS|T9|X10)/gi)) {
    const count = coerceNumber(match[1], 1);
    const size = coerceNumber(match[2], 0) * (match[3].toLowerCase() === "tb" ? 1000 : 1);
    const label = match[4].toLowerCase();
    const kind = label.includes("hdd") ? "hdd" : label.includes("sas") ? "sas" : label.includes("nvme") ? "nvme" : "sata-ssd";
    storage.push({ kind, sizeGB: size, count });
  }
  return storage.length ? storage.slice(0, 8) : [{ kind: "nvme", sizeGB: 1000, count: 1 }];
}

export function parseHomelabAiResponse(raw: string): HomelabConfig | null {
  const obj = parseJsonLike(raw);
  return normalizeConfig(obj);
}

export function inferHomelabConfig(description: string): HomelabConfig {
  const text = description.trim();
  const cpu = inferCpu(text);
  const gpu = inferGpu(text);
  const ramGB = extractFirstNumber(text, /(\d+)\s*GB\s*(?:RAM|DDR\d?|memory)/i, 32);
  const hasVm = /vm|kvm|qemu|proxmox|hypervisor|libvirt/i.test(text);
  const hasOllama = /ollama|llm|llama|local inference|open webui/i.test(text);
  const hasBackup = /backup|backblaze|b2|rclone|rear|rescuezilla/i.test(text);
  const hasContainers = /docker|compose|container/i.test(text);

  return HomelabConfigSchema.parse({
    labName: /xps\s*16/i.test(text) ? "XPS 16 AI & Automation Platform" : "Parsed Homelab",
    location: "",
    kWhCost: 0.15,
    nodes: [
      {
        id: "node-1",
        name: text.match(/dell\s+xps\s+16\s*\d*/i)?.[0] ?? "Primary node",
        role: hasVm ? "hypervisor" : hasOllama ? "general" : "general",
        ...cpu,
        ramGB,
        ecc: /ecc/i.test(text) && !/non-ecc/i.test(text),
        gpu,
        storage: inferStorage(text),
        nicGbps: /10\s*gb|10gbe/i.test(text) ? 10 : /2\.5\s*gb|2.5gbe/i.test(text) ? 2.5 : 1,
        idleWatts: /laptop|xps/i.test(text) ? 18 : 45,
        loadWatts: gpu.tier === "mid" ? 115 : 90,
      },
    ],
    network: {
      lanGbps: /10\s*gb|10gbe/i.test(text) ? 10 : /2\.5\s*gb|2.5gbe/i.test(text) ? 2.5 : 1,
      wifi: /wifi\s*7|wi-fi\s*7/i.test(text) ? "wifi7" : /wifi\s*6e|wi-fi\s*6e/i.test(text) ? "wifi6e" : "wifi6",
      wanDownMbps: extractFirstNumber(text, /(\d+)\s*(?:gbps|gbit).*down/i, 1) * 1000 || 300,
      wanUpMbps: extractFirstNumber(text, /(\d+)\s*mbps\s*(?:up|upload)|up(?:stream)?\s*(?:is\s*)?(?:only\s*)?(?:about\s*)?(\d+)\s*mbps/i, 40),
      vlansConfigured: /vlan/i.test(text) && !/no vlan/i.test(text),
      managedSwitch: /managed switch|unifi|mikrotik/i.test(text),
    },
    reliability: {
      ups: /\bups\b/i.test(text) && !/no ups/i.test(text),
      offsiteBackup: /offsite|backblaze|\bb2\b|cloud backup/i.test(text),
      raid: /raidz2/i.test(text) ? "raidz2" : /raidz1/i.test(text) ? "raidz1" : /raid10/i.test(text) ? "raid10" : /mirror/i.test(text) ? "mirror" : "none",
      monitoring: /monitoring|health|baseline/i.test(text),
    },
    workloads: [
      ...(hasOllama
        ? [
            {
              id: "local-llm",
              kind: "llm-inference" as const,
              label: "Local LLM inference",
              params: { modelSizeGB: gpu.vramGB ? Math.min(8, gpu.vramGB) : 7, targetTokPerSec: 20 },
            },
          ]
        : []),
      ...(hasVm ? [{ id: "vms", kind: "vms" as const, label: "Virtual machines", params: { count: 1, ramPerGB: 16 } }] : []),
      ...(hasContainers
        ? [{ id: "containers", kind: "containers" as const, label: "Containerized services", params: { count: 3, ramPerGB: 2 } }]
        : []),
      ...(hasBackup ? [{ id: "backup", kind: "backup" as const, label: "Backup workflow", params: { dataTB: 1 } }] : []),
    ],
    notes: text.slice(0, 280),
  });
}