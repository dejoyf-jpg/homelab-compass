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
import { applyDeltas, recommendDeltas, type Delta } from "@/lib/engine/simulate";
import { X, Plus, Sparkles } from "lucide-react";


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
  const recommendations = useMemo(
    () => (hydrated ? recommendDeltas(simulatedCfg) : []),
    [simulatedCfg, hydrated],
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

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Scenario builder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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
