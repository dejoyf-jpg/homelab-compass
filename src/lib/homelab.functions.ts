import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatCompletion } from "./ai-gateway.server";
import { HomelabConfigSchema } from "./engine/types";

const MODEL = "google/gemini-3.5-flash";

const INTAKE_SYSTEM = `You are a homelab intake assistant. Given a free-form description of someone's homelab, return a JSON object matching this TypeScript type EXACTLY:

{
  labName: string,
  location: string,
  kWhCost: number,           // USD per kWh, default 0.15 if unknown
  nodes: Array<{
    id: string,              // slug like "node-1"
    name: string,
    role: string,            // "hypervisor" | "nas" | "gaming" | "edge" | "general"
    cpuModel: string,
    cpuCores: number,
    cpuTier: "low" | "mid" | "high" | "server",
    ramGB: number,
    ecc: boolean,
    gpu: { model: string, vramGB: number, tier: "none" | "igpu" | "entry" | "mid" | "high" | "datacenter" },
    storage: Array<{ kind: "nvme"|"sata-ssd"|"hdd"|"sas", sizeGB: number, count: number }>,
    nicGbps: number,
    idleWatts: number,
    loadWatts: number
  }>,
  network: {
    lanGbps: number,
    wifi: "none"|"wifi5"|"wifi6"|"wifi6e"|"wifi7",
    wanDownMbps: number,
    wanUpMbps: number,
    vlansConfigured: boolean,
    managedSwitch: boolean
  },
  reliability: {
    ups: boolean,
    offsiteBackup: boolean,
    raid: "none"|"mirror"|"raidz1"|"raidz2"|"raid10",
    monitoring: boolean
  },
  workloads: Array<{
    id: string,
    kind: "llm-inference"|"plex-transcode"|"vms"|"containers"|"backup"|"game-server"|"home-assistant"|"ci-runner"|"other",
    label: string,
    params: object   // e.g. { modelSizeGB: 8, targetTokPerSec: 20 } or { streams: 3 } or { count: 8, ramPerGB: 4 }
  }>,
  notes: string
}

Rules:
- Infer sensible defaults from CPU/GPU model names (idle/load watts, cpuTier, gpu tier/vram).
- If the user mentions Ollama/LLM/Llama, add an llm-inference workload with an estimated modelSizeGB.
- If Plex is mentioned, add a plex-transcode workload.
- If Proxmox/VMs mentioned, add a vms workload with a count guess.
- Respond with JSON only, no prose, no markdown fences.`;

export const parseIntake = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ description: z.string().min(4).max(50000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const raw = await chatCompletion({
      model: MODEL,
      jsonMode: true,
      temperature: 0.2,
      messages: [
        { role: "system", content: INTAKE_SYSTEM },
        { role: "user", content: data.description },
      ],
    });
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error("AI returned invalid JSON. Try rephrasing your description.");
    }
    const parsed = HomelabConfigSchema.safeParse(obj);
    if (!parsed.success) {
      // try partial merge with defaults
      const fallback = HomelabConfigSchema.parse({});
      return { ...fallback, ...(obj as object) } as unknown as ReturnType<typeof HomelabConfigSchema.parse>;
    }
    return parsed.data;
  });

const NARRATIVE_SYSTEM = `You are a homelab consultant. Given a JSON homelab config plus computed dimension scores and bottlenecks, write a short (120–200 word) markdown assessment. Cover:
- Overall verdict in one sentence.
- 2–3 biggest wins.
- 2–3 highest-priority upgrades with brief rationale (mention specific hardware category, not model names).
- 1 sentence on power/cost efficiency.
Keep it direct and technical. No headings, use short paragraphs and a bulleted list.`;

export const generateNarrative = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        summary: z.string().min(10).max(6000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const text = await chatCompletion({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: NARRATIVE_SYSTEM },
        { role: "user", content: data.summary },
      ],
    });
    return { text };
  });
