"use client";

import { Suspense, useState, useEffect } from "react";
import { Card, Button, Input, ModelSelectModal, CardSkeleton } from "@/shared/components";

export default function ArenaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const [models, setModels] = useState(["", ""]);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState([null, null]);
  const [loading, setLoading] = useState([false, false]);
  const [showModelPicker, setShowModelPicker] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [activeApiKey, setActiveApiKey] = useState("");
  const [conclusion, setConclusion] = useState(null);
  const [conclusionLoading, setConclusionLoading] = useState(false);
  const [conclusionModel, setConclusionModel] = useState("cc/claude-sonnet-4.5");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [providersRes, aliasesRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/models/alias"),
          fetch("/api/keys"),
        ]);
        if (providersRes.ok) {
          const pData = await providersRes.json();
          setActiveProviders(pData.connections || []);
        }
        if (aliasesRes.ok) {
          const aData = await aliasesRes.json();
          setModelAliases(aData.aliases || {});
        }
        if (keysRes.ok) {
          const kData = await keysRes.json();
          const firstActiveKey = (kData.keys || []).find((k) => k.isActive !== false);
          if (firstActiveKey?.key) {
            setActiveApiKey(firstActiveKey.key);
          }
        }
      } catch (e) {
        console.error("Error fetching providers/aliases/keys:", e);
      }
    };
    fetchData();
  }, []);

  const handleSelectModel = (modelObj, index) => {
    const newModels = [...models];
    newModels[index] = modelObj.value;
    setModels(newModels);
    setShowModelPicker(null);
  };

  const buildAuthHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    if (activeApiKey) headers["Authorization"] = `Bearer ${activeApiKey}`;
    return headers;
  };

  const handleRunComparison = async () => {
    if (!prompt.trim()) return;

    setResults([null, null]);
    setConclusion(null);
    setLoading([true, true]);

    models.forEach(async (model, index) => {
      if (!model) {
        setLoading((prev) => { const n = [...prev]; n[index] = false; return n; });
        return;
      }

      const start = Date.now();
      try {
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        });

        const end = Date.now();
        const data = await res.json();

        setResults((prev) => {
          const n = [...prev];
          if (res.ok) {
            n[index] = {
              success: true,
              content: data.choices?.[0]?.message?.content || JSON.stringify(data),
              time: end - start,
              tokens: data.usage || {},
            };
          } else {
            n[index] = {
              success: false,
              content: data.error?.message || data.error || "Unknown Error",
              time: end - start,
            };
          }
          return n;
        });
      } catch (e) {
        setResults((prev) => {
          const n = [...prev];
          n[index] = { success: false, content: e.message, time: Date.now() - start };
          return n;
        });
      } finally {
        setLoading((prev) => { const n = [...prev]; n[index] = false; return n; });
      }
    });
  };

  const handleGenerateConclusion = async () => {
    if (!results[0] && !results[1]) return;
    setConclusionLoading(true);
    setConclusion(null);

    const buildLocalStats = () => {
      const r0 = results[0];
      const r1 = results[1];
      if (!r0 || !r1) return null;
      const speedWinner = r0.time < r1.time ? 0 : 1;
      const t0 = r0.tokens?.total_tokens || 0;
      const t1 = r1.tokens?.total_tokens || 0;
      const tokenWinner = t0 === t1 ? -1 : (t0 < t1 ? 0 : 1);
      return { speedWinner, tokenWinner, t0, t1 };
    };

    const localStats = buildLocalStats();

    try {
      const judgePrompt = `You are an expert AI judge comparing two model responses side by side. Analyze and provide a structured verdict.

USER PROMPT:
${prompt}

MODEL 1 (${models[0] || "unknown"}):
${results[0] ? `Latency: ${results[0].time}ms | Tokens: ${results[0].tokens?.total_tokens || 0}\nResponse:\n${results[0].content}` : "(no result)"}

MODEL 2 (${models[1] || "unknown"}):
${results[1] ? `Latency: ${results[1].time}ms | Tokens: ${results[1].tokens?.total_tokens || 0}\nResponse:\n${results[1].content}` : "(no result)"}

Produce your analysis in this EXACT format (use markdown):

## 🏆 Winner
<Write "Model 1" or "Model 2" or "Tie" and explain why in 1-2 sentences>

## ⚡ Speed
<Faster model name and by how much, e.g. "Model 2 is 320ms faster">

## 💰 Token Efficiency
<More efficient model with total token counts of both>

## 🎯 Quality
<Compare accuracy, helpfulness, and completeness of the two responses. Pick a winner or declare a tie.>

## 💡 Recommendation
<Which model should the user pick for this kind of task and why. Short.>`;

      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          model: conclusionModel,
          messages: [
            { role: "system", content: "You are a precise AI model evaluator. Respond ONLY in the requested format. Be concise and data-driven." },
            { role: "user", content: judgePrompt },
          ],
          stream: false,
        }),
      });

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || (data.error?.message || "Failed to analyze");
      setConclusion({ content, localStats });
    } catch (e) {
      setConclusion({ content: `Failed to generate conclusion: ${e.message}`, localStats });
    } finally {
      setConclusionLoading(false);
    }
  };

  const bothDone = !loading[0] && !loading[1] && (results[0] || results[1]);
  const winnerIndex = (r) => r ? (r.success ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500") : "";

  return (
    <div className="flex flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">swords</span>
          Model Arena
        </h1>
        <p className="text-sm text-text-muted">
          Run the same prompt through two models side-by-side and compare speed, cost, and quality.
        </p>
      </div>

      <Card padding="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.map((model, index) => (
              <div key={index} className="flex flex-col gap-2">
                <label className="text-sm font-medium">Model {index + 1}</label>
                <div className="flex gap-2">
                  <Input
                    value={model}
                    onChange={(e) => {
                      const newModels = [...models];
                      newModels[index] = e.target.value;
                      setModels(newModels);
                    }}
                    placeholder="e.g. cc/claude-sonnet-4.5"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button variant="secondary" icon="search" onClick={() => setShowModelPicker(index)} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-medium">Test Prompt</label>
            <textarea
              className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-surface-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="Write a python script to parse CSV..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-xs text-text-muted whitespace-nowrap">Judge model:</label>
              <Input
                value={conclusionModel}
                onChange={(e) => setConclusionModel(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
            </div>
            <Button
              icon="play_arrow"
              onClick={handleRunComparison}
              disabled={!prompt.trim() || (!models[0] && !models[1]) || loading[0] || loading[1]}
            >
              {loading[0] || loading[1] ? "Running..." : "Run Comparison"}
            </Button>
          </div>
        </div>
      </Card>

      {(results[0] || results[1] || loading[0] || loading[1]) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((index) => (
              <Card key={index} padding="sm" className="h-full flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                  <span className="font-mono text-sm font-semibold truncate pr-2">
                    {models[index] || "None"}
                  </span>
                  {results[index] && (
                    <span className={`text-xs px-2 py-1 rounded font-mono ${winnerIndex(results[index])}`}>
                      {results[index].time}ms
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto bg-black/5 dark:bg-white/5 rounded-lg p-3">
                  {loading[index] ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-text-muted">
                      <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                      <span className="text-sm">Waiting for response...</span>
                    </div>
                  ) : results[index] ? (
                    <div className="flex flex-col h-full">
                      <pre className="text-sm font-mono whitespace-pre-wrap flex-1 break-words">
                        {results[index].content}
                      </pre>
                      {results[index].success && results[index].tokens && (
                        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-text-muted flex gap-4">
                          <span>Input: {results[index].tokens.prompt_tokens || 0}</span>
                          <span>Output: {results[index].tokens.completion_tokens || 0}</span>
                          <span>Total: {results[index].tokens.total_tokens || 0}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-text-muted text-sm">
                      No result
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {bothDone && (
            <Card padding="md" className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">psychology</span>
                  Auto Conclusion
                </h2>
                <Button
                  icon="auto_awesome"
                  onClick={handleGenerateConclusion}
                  loading={conclusionLoading}
                  disabled={conclusionLoading}
                  variant="secondary"
                >
                  {conclusionLoading ? "Analyzing..." : (conclusion ? "Regenerate" : "Generate Conclusion")}
                </Button>
              </div>

              {conclusion?.localStats && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5">
                    <p className="text-xs text-text-muted mb-1">Speed</p>
                    <p className="font-medium">
                      {conclusion.localStats.speedWinner === 0
                        ? `${models[0]} is ${Math.abs((results[0]?.time || 0) - (results[1]?.time || 0))}ms faster`
                        : `${models[1]} is ${Math.abs((results[0]?.time || 0) - (results[1]?.time || 0))}ms faster`}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5">
                    <p className="text-xs text-text-muted mb-1">Token Efficiency</p>
                    <p className="font-medium">
                      {conclusion.localStats.tokenWinner === -1
                        ? "Equal token usage"
                        : conclusion.localStats.tokenWinner === 0
                        ? `${models[0]} used fewer tokens (${conclusion.localStats.t0} vs ${conclusion.localStats.t1})`
                        : `${models[1]} used fewer tokens (${conclusion.localStats.t1} vs ${conclusion.localStats.t0})`}
                    </p>
                  </div>
                </div>
              )}

              {conclusionLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-text-muted">
                  <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
                  <span className="text-sm">AI judge is analyzing both responses...</span>
                </div>
              )}

              {conclusion && !conclusionLoading && (
                <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                  <div dangerouslySetInnerHTML={{ __html: conclusion.content
                    .replace(/^## (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
                    .replace(/^### (.*$)/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/`(.*?)`/g, '<code class="px-1 rounded bg-black/10 dark:bg-white/10 text-sm">$1</code>')
                    .replace(/\n\n/g, '<div class="my-2"></div>')
                    .replace(/\n/g, "<br>")
                  }} />
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {showModelPicker !== null && (
        <ModelSelectModal
          isOpen={true}
          onClose={() => setShowModelPicker(null)}
          onSelect={(modelObj) => handleSelectModel(modelObj, showModelPicker)}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Select Model ${showModelPicker + 1}`}
        />
      )}
    </div>
  );
}
