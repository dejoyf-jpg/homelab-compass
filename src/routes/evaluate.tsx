import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import { generateNarrative } from "@/lib/homelab.functions";
import { Loader2, Sparkles } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/evaluate")({
  head: () => ({
    meta: [
      { title: "Evaluate — HomelabIQ" },
      { name: "description", content: "Deterministic scorecard plus AI narrative." },
    ],
  }),
  component: Evaluate,
});

function Evaluate() {
  const [cfg, , hydrated] = useConfig();
  const evalResult = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const gen = useServerFn(generateNarrative);

  useEffect(() => { setNarrative(""); }, [cfg]);

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (cfg.nodes.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold">No config yet</h1>
        <Button asChild><Link to="/intake">Start intake</Link></Button>
      </div>
    );

  const runNarrative = async () => {
    if (!evalResult) return;
    setLoading(true);
    try {
      const summary = JSON.stringify({
        config: {
          nodes: cfg.nodes.map((n) => ({
            name: n.name, role: n.role, cpu: `${n.cpuModel} (${n.cpuCores}c, ${n.cpuTier})`,
            ram: `${n.ramGB}GB${n.ecc ? " ECC" : ""}`, gpu: n.gpu, nicGbps: n.nicGbps,
            storage: n.storage,
          })),
          network: cfg.network, reliability: cfg.reliability, workloads: cfg.workloads,
        },
        scores: evalResult.dimensions,
        bottlenecks: evalResult.bottlenecks,
        power: evalResult.power,
      });
      const res = await gen({ data: { summary } });
      setNarrative(res.text);
    } catch (e) {
      setNarrative(e instanceof Error ? `Error: ${e.message}` : "Error");
    } finally {
      setLoading(false);
    }
  };

  const radarData = evalResult!.dimensions.map((d) => ({ dim: d.label, score: Math.round(d.score) }));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evaluation</h1>
          <p className="text-muted-foreground mt-1">
            Overall score: <span className="font-semibold text-foreground">{evalResult!.overall}/100</span>
          </p>
        </div>
        <Button onClick={runNarrative} disabled={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking…</> : <><Sparkles className="mr-2 h-4 w-4" /> AI assessment</>}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Scorecard</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dimension detail</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {evalResult!.dimensions.map((d) => (
              <div key={d.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d.label}</span>
                  <Badge variant={d.score >= 70 ? "default" : d.score >= 50 ? "secondary" : "destructive"}>
                    {Math.round(d.score)}
                  </Badge>
                </div>
                {d.notes.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                    {d.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {narrative && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> AI assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {narrative}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
