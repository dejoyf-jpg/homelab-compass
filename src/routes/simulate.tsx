import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import {
  applyDeltas,
  applyConstraints,
  recommendDeltas,
  rankRecommendations,
  DEFAULT_WEIGHTS,
  DEFAULT_CONSTRAINTS,
  type Delta,
  type Constraints,
  type PriorityWeights,
  type RecCategory,
} from "@/lib/engine/simulate";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { X, Plus, Sparkles, Zap, ShieldCheck, DollarSign, Network, ChevronDown, Info } from "lucide-react";
import type { Recommendation } from "@/lib/engine/simulate";
import type { HomelabConfig } from "@/lib/engine/types";




export const Route = createFileRoute("/simulate")({
  head: () => ({
    meta: [
      { title: "Simulate — HomelabIQ" },
      { name: "description", content: "What-if scenarios for hardware, network, and reliability upgrades." },
    ],
  }),
  component: Simulate,
});

function Simulate() {
  const [cfg, , hydrated] = useConfig();
  const [deltas, setDeltas] = useState<Delta[]>([]);

  const simulatedCfg = useMemo(() => applyDeltas(cfg, deltas), [cfg, deltas]);
  const base = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);
  const simulated = useMemo(
    () => (hydrated ? evaluate(simulatedCfg) : null),
    [simulatedCfg, hydrated],
  );
  const [weights, setWeights] = useState<PriorityWeights>(DEFAULT_WEIGHTS);
  const [constraints, setConstraints] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const rawRecommendations = useMemo(
    () => (hydrated ? recommendDeltas(simulatedCfg) : []),
    [simulatedCfg, hydrated],
  );
  const rankedRecommendations = useMemo(
    () => rankRecommendations(rawRecommendations, weights, 20),
    [rawRecommendations, weights],
  );
  const recommendations = useMemo(
    () => applyConstraints(simulatedCfg, rankedRecommendations, constraints)
      .filter((r) => r.feasible)
      .slice(0, 6),
    [simulatedCfg, rankedRecommendations, constraints],
  );
  const blockedRecommendations = useMemo(
    () => applyConstraints(simulatedCfg, rankedRecommendations, constraints)
      .filter((r) => !r.feasible)
      .slice(0, 4),
    [simulatedCfg, rankedRecommendations, constraints],
  );


  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (cfg.nodes.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold">No config yet</h1>
        <Button asChild><Link to="/intake">Start intake</Link></Button>
      </div>
    );


  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Simulate upgrades</h1>
        <p className="text-muted-foreground mt-1">Stack changes and see side-by-side scoring.</p>
      </div>

      <PriorityFilters weights={weights} onChange={setWeights} />
      <ConstraintsPanel constraints={constraints} onChange={setConstraints} />




      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Scenario builder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {recommendations.length > 0 && (
              <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Suggested upgrades
                </div>
                <div className="space-y-2">
                  {recommendations.slice(0, 4).map((r, i) => (
                    <SuggestionCard
                      key={i}
                      cfg={simulatedCfg}
                      rec={r}
                      onAdd={() => setDeltas([...deltas, r.delta])}
                    />
                  ))}
                </div>

              </div>
            )}
            <AddDeltaForm cfg={cfg} onAdd={(d) => setDeltas([...deltas, d])} />
            <div className="space-y-2">
              {deltas.length === 0 && (
                <p className="text-sm text-muted-foreground">No changes yet — add one above.</p>
              )}
              {deltas.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm border rounded-md p-2 bg-muted/30">
                  <span>{describeDelta(d, cfg)}</span>
                  <Button size="icon" variant="ghost" onClick={() => setDeltas(deltas.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Baseline → Simulated</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm border-b pb-2">
              <span className="font-medium">Overall</span>
              <span className="tabular-nums">
                {base!.overall} → <span className="font-semibold text-primary">{simulated!.overall}</span>
                <Delta n={simulated!.overall - base!.overall} />
              </span>
            </div>
            {base!.dimensions.map((d, i) => {
              const s = simulated!.dimensions[i];
              return (
                <div key={d.key} className="flex items-center justify-between text-sm">
                  <span>{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(d.score)} → <span className="text-foreground">{Math.round(s.score)}</span>
                    <Delta n={Math.round(s.score - d.score)} />
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span>Monthly power</span>
              <span className="tabular-nums">
                ${base!.power.monthlyCostUSD} → ${simulated!.power.monthlyCostUSD}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Recommended additions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing obvious to add — current simulated build looks balanced.
            </p>
          ) : (
            recommendations.map((r, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 text-sm border rounded-md p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.reason}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    {r.categories.map((c) => (
                      <span key={c} className="rounded bg-muted px-1.5 py-0.5 capitalize">
                        {c}
                      </span>
                    ))}
                    {r.monthlyCostDeltaUSD !== 0 && (
                      <span
                        className={`rounded px-1.5 py-0.5 tabular-nums ${
                          r.monthlyCostDeltaUSD > 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {r.monthlyCostDeltaUSD > 0 ? "+" : ""}${r.monthlyCostDeltaUSD}/mo
                      </span>
                    )}
                    {r.upfrontCostUSD > 0 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                        ~${r.upfrontCostUSD} upfront
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.gain > 0 && (
                    <Badge variant="secondary" className="tabular-nums">
                      +{r.gain} overall
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setDeltas([...deltas, r.delta])}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
            ))

          )}
        </CardContent>
      </Card>

      {blockedRecommendations.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Blocked by your constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {blockedRecommendations.map((r, i) => (
              <div key={i} className="text-sm border rounded-md p-2.5 bg-muted/20 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  {r.gain > 0 && (
                    <Badge variant="outline" className="tabular-nums text-xs">
                      would give +{r.gain}
                    </Badge>
                  )}
                </div>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  {r.blockedReasons.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}





      <Card>
        <CardHeader><CardTitle className="text-base">Workload fit</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {simulated!.workloadFit.length === 0 && (
            <p className="text-sm text-muted-foreground">No workloads defined — add some in Intake or Workflows.</p>
          )}
          {simulated!.workloadFit.map((w) => (
            <div key={w.workloadId} className="flex items-center justify-between text-sm border rounded-md p-2">
              <span>{w.label}</span>
              <div className="flex items-center gap-2">
                <Badge variant={w.status === "ok" ? "default" : w.status === "tight" ? "secondary" : "destructive"}>
                  {w.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{w.detail}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const PRIORITY_OPTIONS: { key: RecCategory; label: string; icon: typeof Zap; hint: string }[] = [
  { key: "performance", label: "Performance", icon: Zap, hint: "CPU, RAM, GPU, storage speed" },
  { key: "reliability", label: "Reliability", icon: ShieldCheck, hint: "UPS, offsite backup, HA" },
  { key: "network", label: "Network", icon: Network, hint: "LAN/WAN, managed switch, VLANs" },
  { key: "cost", label: "Low running cost", icon: DollarSign, hint: "Penalize $/mo power increases" },
];

function SuggestionCard({
  cfg,
  rec,
  onAdd,
}: {
  cfg: HomelabConfig;
  rec: Recommendation;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const impact = useMemo(() => {
    const before = evaluate(cfg);
    const after = evaluate(applyDeltas(cfg, [rec.delta]));
    const dims = before.dimensions.map((b, i) => ({
      key: b.key,
      label: b.label,
      before: Math.round(b.score),
      after: Math.round(after.dimensions[i].score),
      delta: Math.round(after.dimensions[i].score - b.score),
    }));
    return {
      dims,
      changed: dims.filter((d) => d.delta !== 0),
      powerBefore: before.power.monthlyCostUSD,
      powerAfter: after.power.monthlyCostUSD,
      bottlenecksResolved: before.bottlenecks.filter((b) => !after.bottlenecks.includes(b)),
    };
  }, [cfg, rec.delta]);

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-start justify-between gap-2 p-2.5">
        <button
          type="button"
          className="flex-1 min-w-0 text-left flex items-start gap-2"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 mt-0.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{rec.label}</div>
            <div className="text-xs text-muted-foreground truncate">{rec.reason}</div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {rec.gain > 0 && (
            <Badge variant="secondary" className="tabular-nums">+{rec.gain}</Badge>
          )}
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t px-3 py-2.5 space-y-2 bg-muted/20">
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Applied on top of the currently simulated config.</span>
          </div>

          <div>
            <div className="text-xs font-medium mb-1">Metric impact</div>
            {impact.changed.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No dimension score changes — this is a qualitative improvement (e.g. capability unlocked).
              </div>
            ) : (
              <div className="grid gap-1">
                {impact.changed.map((d) => (
                  <div key={d.key} className="flex items-center justify-between text-xs">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.before} → <span className="text-foreground">{d.after}</span>
                      <span className={`ml-1.5 ${d.delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                        ({d.delta > 0 ? "+" : ""}{d.delta})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t">
            <span className="text-muted-foreground">Monthly power</span>
            <span className="tabular-nums">
              ${impact.powerBefore} → ${impact.powerAfter}
              {impact.powerAfter !== impact.powerBefore && (
                <span
                  className={`ml-1.5 ${
                    impact.powerAfter > impact.powerBefore ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  ({impact.powerAfter > impact.powerBefore ? "+" : ""}$
                  {(impact.powerAfter - impact.powerBefore).toFixed(2)})
                </span>
              )}
            </span>
          </div>

          {impact.bottlenecksResolved.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Bottlenecks resolved</div>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                {impact.bottlenecksResolved.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-1 pt-1">
            {rec.categories.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConstraintsPanel({
  constraints,
  onChange,
}: {
  constraints: Constraints;
  onChange: (c: Constraints) => void;
}) {
  const update = <K extends keyof Constraints>(k: K, v: Constraints[K]) =>
    onChange({ ...constraints, [k]: v });
  const numOrUndef = (v: string): number | undefined => {
    const n = Number(v);
    return v === "" || Number.isNaN(n) ? undefined : n;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Constraints</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Budget (USD, one-time)</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxBudgetUSD ?? ""}
            onChange={(e) => update("maxBudgetUSD", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Max monthly power ($)</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxMonthlyPowerCostUSD ?? ""}
            onChange={(e) => update("maxMonthlyPowerCostUSD", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Space for new nodes</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxAddedNodes ?? ""}
            onChange={(e) => update("maxAddedNodes", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">NVMe slots / node</Label>
          <Input
            type="number"
            placeholder="4"
            value={constraints.maxNvmeSlotsPerNode ?? ""}
            onChange={(e) => update("maxNvmeSlotsPerNode", numOrUndef(e.target.value))}
          />
        </div>
        <div className="md:col-span-4 flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">Allow discrete GPUs</Label>
            <p className="text-xs text-muted-foreground">
              Off = only iGPU / no-GPU changes (fits SFF, low-power builds).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={constraints.allowDiscreteGpu !== false}
              onCheckedChange={(v) => update("allowDiscreteGpu", v)}
            />
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => onChange(DEFAULT_CONSTRAINTS)}
            >
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityFilters({


  weights,
  onChange,
}: {
  weights: PriorityWeights;
  onChange: (w: PriorityWeights) => void;
}) {
  return (
    <Card>
      <CardContent className="py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-2">
          Prioritize
        </span>
        {PRIORITY_OPTIONS.map(({ key, label, icon: Icon, hint }) => {
          const on = (weights[key] ?? 0) > 0;
          return (
            <Toggle
              key={key}
              pressed={on}
              onPressedChange={(v) => onChange({ ...weights, [key]: v ? 1 : 0 })}
              variant="outline"
              size="sm"
              title={hint}
              className="gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Toggle>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-xs"
          onClick={() => onChange(DEFAULT_WEIGHTS)}
        >
          Reset
        </Button>
      </CardContent>
    </Card>
  );
}


function Delta({ n }: { n: number }) {
  if (n === 0) return null;
  const good = n > 0;
  return (
    <span className={`ml-2 text-xs ${good ? "text-emerald-600" : "text-destructive"}`}>
      ({good ? "+" : ""}{n})
    </span>
  );
}

function describeDelta(d: Delta, cfg: { nodes: { id: string; name: string }[] }): string {
  const nodeName = (id: string) => cfg.nodes.find((n) => n.id === id)?.name ?? id;
  switch (d.kind) {
    case "add-ram": return `+${d.gb}GB RAM on ${nodeName(d.nodeId)}`;
    case "add-gpu": return `Add GPU (${d.tier}, ${d.vramGB}GB) to ${nodeName(d.nodeId)}`;
    case "add-nvme": return `+${d.sizeGB}GB NVMe on ${nodeName(d.nodeId)}`;
    case "upgrade-lan": return `Upgrade LAN to ${d.gbps}GbE`;
    case "upgrade-wan": return `WAN → ${d.downMbps}/${d.upMbps} Mbps`;
    case "add-ups": return "Add UPS";
    case "add-offsite": return "Add offsite backup";
    case "add-managed-switch": return "Add managed switch + VLANs";
    case "add-node": return `Add node: ${d.node.name}`;
  }
}

function AddDeltaForm({
  cfg,
  onAdd,
}: {
  cfg: ReturnType<typeof useConfig>[0];
  onAdd: (d: Delta) => void;
}) {
  const [kind, setKind] = useState<Delta["kind"]>("add-ram");
  const [nodeId, setNodeId] = useState(cfg.nodes[0]?.id ?? "");
  const [n1, setN1] = useState("32");
  const [n2, setN2] = useState("12");

  const submit = () => {
    let d: Delta;
    switch (kind) {
      case "add-ram": d = { kind, nodeId, gb: Number(n1) || 0 }; break;
      case "add-gpu": d = { kind, nodeId, tier: "mid", vramGB: Number(n1) || 12, model: "RTX 4070-class" }; break;
      case "add-nvme": d = { kind, nodeId, sizeGB: Number(n1) || 1000 }; break;
      case "upgrade-lan": d = { kind, gbps: Number(n1) || 10 }; break;
      case "upgrade-wan": d = { kind, downMbps: Number(n1) || 1000, upMbps: Number(n2) || 100 }; break;
      case "add-ups": d = { kind }; break;
      case "add-offsite": d = { kind }; break;
      case "add-managed-switch": d = { kind }; break;
      case "add-node":
        d = { kind, node: {
          id: `node-${Date.now()}`, name: "New mini-PC", role: "general",
          cpuModel: "Intel N100", cpuCores: 4, cpuTier: "low", ramGB: 16, ecc: false,
          gpu: { model: "", vramGB: 0, tier: "igpu" }, storage: [{ kind: "nvme", sizeGB: 500, count: 1 }],
          nicGbps: 2.5, idleWatts: 8, loadWatts: 25,
        } };
        break;
    }
    onAdd(d);
  };

  const needsNode = ["add-ram", "add-gpu", "add-nvme"].includes(kind);
  const needsN1 = ["add-ram", "add-gpu", "add-nvme", "upgrade-lan", "upgrade-wan"].includes(kind);
  const needsN2 = kind === "upgrade-wan";

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto] items-end">
      <div>
        <Label className="text-xs">Change</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as Delta["kind"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="add-ram">Add RAM</SelectItem>
            <SelectItem value="add-gpu">Add / swap GPU</SelectItem>
            <SelectItem value="add-nvme">Add NVMe</SelectItem>
            <SelectItem value="upgrade-lan">Upgrade LAN</SelectItem>
            <SelectItem value="upgrade-wan">Upgrade WAN</SelectItem>
            <SelectItem value="add-managed-switch">Add managed switch</SelectItem>
            <SelectItem value="add-ups">Add UPS</SelectItem>
            <SelectItem value="add-offsite">Add offsite backup</SelectItem>
            <SelectItem value="add-node">Add new node</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {needsNode ? (
        <div>
          <Label className="text-xs">Node</Label>
          <Select value={nodeId} onValueChange={setNodeId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {cfg.nodes.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : <div />}
      {needsN1 ? (
        <div>
          <Label className="text-xs">{kind === "upgrade-lan" ? "Gbps" : kind === "upgrade-wan" ? "Down Mbps" : kind === "add-gpu" ? "VRAM GB" : "GB"}</Label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={n1} onChange={(e) => setN1(e.target.value)} />
        </div>
      ) : <div />}
      {needsN2 ? (
        <div>
          <Label className="text-xs">Up Mbps</Label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={n2} onChange={(e) => setN2(e.target.value)} />
        </div>
      ) : <div />}
      <Button size="sm" onClick={submit}><Plus className="h-4 w-4 mr-1" /> Add</Button>
    </div>
  );
}
