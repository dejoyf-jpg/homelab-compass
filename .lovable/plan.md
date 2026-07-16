# HomelabIQ — Evaluate, Simulate, Upgrade

A single-user, browser-local app that captures your homelab, scores it, simulates upgrade/workflow scenarios with a hybrid heuristic + AI engine, and surfaces shopping and service links.

## Core flow

1. **Intake (AI-assisted)** — Describe your lab in plain English (nodes, CPUs, GPUs, RAM, storage, NICs, switches, ISP, workloads like Proxmox VMs, Plex, Home Assistant, Ollama). AI extracts a structured `HomelabConfig` JSON you can review/edit in a form.
2. **Evaluation** — Deterministic scoring across Compute, Memory, Storage (capacity + IOPS tier), Network (LAN + WAN), Power/Thermal, Reliability (backups, ECC, UPS), and Workload fit. Each dimension gets 0–100 + flagged bottlenecks. AI adds a short narrative.
3. **Simulate** — "What-if" panel: swap/add GPU, add RAM, upgrade to 10GbE, add NAS, migrate workload to a mini-PC cluster, etc. Heuristics recompute scores + estimated tokens/sec, VM headroom, storage throughput, watts, monthly power cost. AI writes rationale + risks.
4. **Workflow modeling** — Pick workloads (LLM inference @ model size, Plex 4K transcodes, N VMs, backup window, CI runners). Engine estimates whether current + simulated config meets targets.
5. **Shop & services** — Each recommendation renders cards with Amazon / Newegg / eBay search links (pre-filled queries) and managed-service suggestions (Backblaze B2, Cloudflare Tunnel, Tailscale, etc.) as outbound links.

## Screens (routes)

```
/                    Dashboard: current score, top bottlenecks, quick actions
/intake              AI chat-style intake + structured editor
/evaluate            Full scorecard with per-dimension breakdown
/simulate            Scenario builder, side-by-side diff vs baseline
/workflows           Workload targets and fit analysis
/upgrades            Recommendation feed with shopping/service links
```

## Data & persistence

- All state in `localStorage` under `homelabiq:v1` (config, scenarios, workload targets).
- Import/export JSON button for backup/sharing.
- No auth, no database.

## AI usage (Lovable AI Gateway)

- **Intake parser**: `google/gemini-3.5-flash` with structured output → `HomelabConfig`.
- **Narrative + recommendations**: same model, streaming, given config + heuristic scores as context.
- Keys and calls stay server-side via `createServerFn` in `src/lib/homelab.functions.ts`.

## Heuristic engine (deterministic, transparent)

Pure TS in `src/lib/engine/`:
- `score.ts` — per-dimension 0–100 with weighted sub-metrics.
- `workloads.ts` — estimators: LLM tok/s from GPU VRAM + mem bandwidth tier; Plex transcodes from iGPU/GPU class; VM headroom from cores/RAM after overhead; storage MB/s + IOPS by disk-class tier.
- `power.ts` — idle+load watts by component class, $/mo from user's kWh rate.
- `simulate.ts` — apply a `Delta` (add/remove/replace components) to config, rerun scoring.
- `catalog.ts` — small curated component catalog (GPU/CPU/NIC/NAS/UPS classes) with tiers, typical price ranges, and search-query templates for Amazon/Newegg/eBay.

## Tech

- TanStack Start routes as listed; `__root.tsx` header nav; per-route `head()` metadata.
- shadcn UI + Tailwind tokens; AI Elements for the intake chat surface.
- Zod schemas for `HomelabConfig`, `Scenario`, `WorkloadTarget`.
- Recharts radar chart for the scorecard.

## Out of scope (v1)

- Live scraping of prices (links are pre-filled search URLs, not price lookups).
- Multi-user accounts / cloud sync.
- Direct SSH/API discovery of running gear.

Approve and I'll build it.