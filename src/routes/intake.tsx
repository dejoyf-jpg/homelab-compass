import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { parseIntake } from "@/lib/homelab.functions";
import { useConfig } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
import type { Node } from "@/lib/engine/types";

export const Route = createFileRoute("/intake")({
  head: () => ({
    meta: [
      { title: "Intake — HomelabIQ" },
      { name: "description", content: "Describe your homelab and let AI structure it." },
    ],
  }),
  component: Intake,
});

const EXAMPLE = `I run Proxmox on a Ryzen 5900X with 64GB DDR4 (non-ECC), 1TB NVMe + 4x8TB HDD in ZFS raidz1. Second node is an Intel N100 mini-PC with 16GB RAM for Home Assistant. UniFi USW-Lite 8, no VLANs yet. Comcast 1Gbps down / 35Mbps up. I run ~8 LXCs, Plex with 2-3 4K transcodes, and want to run Ollama with a 13B model but only have iGPU right now. No UPS.`;

function Intake() {
  const [cfg, setCfg, hydrated] = useConfig();
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const parse = useServerFn(parseIntake);
  const navigate = useNavigate();

  const analyze = async () => {
    if (desc.trim().length < 10) {
      toast.error("Describe your setup in a bit more detail first.");
      return;
    }
    setLoading(true);
    try {
      const result = await parse({ data: { description: desc } });
      setCfg(result);
      toast.success("Parsed! Review below or head to the evaluation.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse.");
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intake</h1>
        <p className="text-muted-foreground mt-1">
          Describe your homelab. AI extracts nodes, hardware, network, and workloads.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI intake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={EXAMPLE}
            rows={9}
            className="font-mono text-sm"
          />
          <div className="flex justify-between items-center gap-3">
            <button
              type="button"
              onClick={() => setDesc(EXAMPLE)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Load example
            </button>
            <Button onClick={analyze} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing…</> : "Analyze with AI"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {cfg.nodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & edit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Lab name</Label>
                <Input value={cfg.labName} onChange={(e) => setCfg({ ...cfg, labName: e.target.value })} />
              </div>
              <div>
                <Label>Electricity ($/kWh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cfg.kWhCost}
                  onChange={(e) => setCfg({ ...cfg, kWhCost: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>LAN backbone (Gbps)</Label>
                <Input
                  type="number"
                  value={cfg.network.lanGbps}
                  onChange={(e) =>
                    setCfg({ ...cfg, network: { ...cfg.network, lanGbps: Number(e.target.value) || 0 } })
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Nodes</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      nodes: [
                        ...cfg.nodes,
                        {
                          id: `node-${Date.now()}`,
                          name: "New node",
                          role: "general",
                          cpuModel: "",
                          cpuCores: 4,
                          cpuTier: "mid",
                          ramGB: 16,
                          ecc: false,
                          gpu: { model: "", vramGB: 0, tier: "none" },
                          storage: [],
                          nicGbps: 1,
                          idleWatts: 30,
                          loadWatts: 90,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Add node
                </Button>
              </div>
              {cfg.nodes.map((n, i) => (
                <NodeEditor
                  key={n.id}
                  node={n}
                  onChange={(next) => {
                    const nodes = [...cfg.nodes];
                    nodes[i] = next;
                    setCfg({ ...cfg, nodes });
                  }}
                  onDelete={() => setCfg({ ...cfg, nodes: cfg.nodes.filter((_, j) => j !== i) })}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate({ to: "/evaluate" })}>
                Continue to evaluation →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NodeEditor({
  node,
  onChange,
  onDelete,
}: {
  node: Node;
  onChange: (n: Node) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <Input
          value={node.name}
          onChange={(e) => onChange({ ...node, name: e.target.value })}
          className="max-w-xs font-medium"
        />
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4 text-sm">
        <div>
          <Label className="text-xs">CPU</Label>
          <Input value={node.cpuModel} onChange={(e) => onChange({ ...node, cpuModel: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Cores</Label>
          <Input type="number" value={node.cpuCores} onChange={(e) => onChange({ ...node, cpuCores: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">RAM (GB)</Label>
          <Input type="number" value={node.ramGB} onChange={(e) => onChange({ ...node, ramGB: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">GPU VRAM (GB)</Label>
          <Input
            type="number"
            value={node.gpu.vramGB}
            onChange={(e) => onChange({ ...node, gpu: { ...node.gpu, vramGB: Number(e.target.value) || 0 } })}
          />
        </div>
        <div>
          <Label className="text-xs">GPU model</Label>
          <Input value={node.gpu.model} onChange={(e) => onChange({ ...node, gpu: { ...node.gpu, model: e.target.value } })} />
        </div>
        <div>
          <Label className="text-xs">NIC (Gbps)</Label>
          <Input type="number" value={node.nicGbps} onChange={(e) => onChange({ ...node, nicGbps: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Idle W</Label>
          <Input type="number" value={node.idleWatts} onChange={(e) => onChange({ ...node, idleWatts: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Load W</Label>
          <Input type="number" value={node.loadWatts} onChange={(e) => onChange({ ...node, loadWatts: Number(e.target.value) || 0 })} />
        </div>
      </div>
    </div>
  );
}
