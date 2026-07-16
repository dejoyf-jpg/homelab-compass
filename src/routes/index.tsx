import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import { AlertTriangle, Cpu, Zap, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const [cfg, , hydrated] = useConfig();
  const evalResult = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const empty = cfg.nodes.length === 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {empty
              ? "No homelab configured yet. Start by describing your setup."
              : `${cfg.labName} — ${cfg.nodes.length} node${cfg.nodes.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/intake">
            {empty ? "Get started" : "Update config"} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {empty ? (
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <Cpu className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="text-lg font-medium">Describe your homelab in plain English</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              List your nodes, CPUs, GPUs, RAM, storage, network, and what you run.
              AI will structure it, score it, and suggest upgrades.
            </p>
            <Button asChild size="lg">
              <Link to="/intake">Start intake</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        evalResult && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-normal">Overall score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold">{evalResult.overall}</div>
                  <Progress value={evalResult.overall} className="mt-3" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-normal">Est. monthly power</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold">${evalResult.power.monthlyCostUSD}</div>
                  <div className="text-xs text-muted-foreground mt-3">
                    {evalResult.power.totalIdleW}W idle / {evalResult.power.totalLoadW}W load @ ${cfg.kWhCost}/kWh
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-normal">Bottlenecks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold">{evalResult.bottlenecks.length}</div>
                  <div className="text-xs text-muted-foreground mt-3">
                    Weak spots across {evalResult.dimensions.length} dimensions
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-primary" /> Dimension scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {evalResult.dimensions.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{d.label}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(d.score)}</span>
                    </div>
                    <Progress value={d.score} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {evalResult.bottlenecks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Top bottlenecks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {evalResult.bottlenecks.slice(0, 6).map((b, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="mt-0.5 text-xs">{i + 1}</Badge>
                      <span>{b}</span>
                    </div>
                  ))}
                  <Button asChild variant="secondary" className="mt-2">
                    <Link to="/upgrades">See upgrade recommendations</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}
