export type ModelStrategy = "best_local" | "user_selected" | "fastest";

export class TimedValueCache<T> {
  private storedAt = 0;
  private value: T | null = null;

  constructor(private ttlMs: number) {}

  getFresh(now = Date.now()): T | null {
    if (this.value === null) {
      return null;
    }
    if (now - this.storedAt > this.ttlMs) {
      return null;
    }
    return this.value;
  }

  set(value: T, now = Date.now()): void {
    this.value = value;
    this.storedAt = now;
  }
}

export function modelNameScore(name: string): number {
  const n = name.toLowerCase();
  let score = 0;

  if (/(coder|code|dev|instruct|chat)/.test(n)) {
    score += 80;
  }
  if (/(qwen|deepseek|codellama|llama|gpt-oss)/.test(n)) {
    score += 40;
  }
  if (/(embed|embedding|vision|whisper|tts|audio)/.test(n)) {
    score -= 120;
  }
  if (/(latest)$/.test(n)) {
    score += 8;
  }

  const sizeMatch = n.match(/(\d+)\s*b/);
  if (sizeMatch) {
    score += Math.min(60, Number(sizeMatch[1]) || 0);
  }

  return score;
}

export function sortModelsByQuality(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const diff = modelNameScore(b) - modelNameScore(a);
    if (diff !== 0) {
      return diff;
    }
    return a.localeCompare(b);
  });
}

export function modelSpeedScore(name: string): number {
  const n = name.toLowerCase();
  let score = 0;

  if (/(tiny|mini|small|q2|q3|q4)/.test(n)) {
    score += 45;
  }
  if (/(embed|embedding|vision|whisper|tts|audio)/.test(n)) {
    score -= 120;
  }

  const sizeMatch = n.match(/(\d+)\s*b/);
  if (sizeMatch) {
    const size = Number(sizeMatch[1]) || 0;
    score += Math.max(0, 80 - size);
  } else {
    score += 20;
  }

  return score;
}

export function sortModelsBySpeed(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const diff = modelSpeedScore(b) - modelSpeedScore(a);
    if (diff !== 0) {
      return diff;
    }
    return a.localeCompare(b);
  });
}

export function rankModelsByStrategy(models: string[], strategy: ModelStrategy): string[] {
  if (strategy === "fastest") {
    return sortModelsBySpeed(models);
  }
  return sortModelsByQuality(models);
}

export function nextBestModel(current: string, models: string[], strategy: ModelStrategy): string | null {
  const ranked = rankModelsByStrategy(models, strategy);
  for (const m of ranked) {
    if (m !== current) {
      return m;
    }
  }
  return null;
}

export function pickModel(
  preferred: string,
  defaultModel: string,
  models: string[],
  strategy: ModelStrategy
): string {
  const p = String(preferred ?? "").trim();
  if (p && (!models.length || models.includes(p))) {
    return p;
  }
  if (strategy === "user_selected") {
    const d = String(defaultModel ?? "").trim();
    if (d && (!models.length || models.includes(d))) {
      return d;
    }
  }
  if (models.length) {
    return rankModelsByStrategy(models, strategy)[0];
  }
  return defaultModel;
}

export function scoreAnswerQuality(answer: string, action: string | null): number {
  const t = String(answer || "");
  let score = 50;
  if (t.length >= 200) {
    score += 10;
  }
  if (t.length >= 800) {
    score += 8;
  }
  if (/##\s+/m.test(t)) {
    score += 8;
  }
  if (/\b(risk|risco|tradeoff|assumption|supos)/i.test(t)) {
    score += 8;
  }
  if (/\b(test|teste|verify|validar|validation)\b/i.test(t)) {
    score += 8;
  }
  if (action === "review" && /\b(high|medium|low|alto|medio|baixo)\b/i.test(t)) {
    score += 8;
  }
  if (t.length < 80) {
    score -= 20;
  }
  if (score < 0) {
    return 0;
  }
  if (score > 100) {
    return 100;
  }
  return score;
}

export function extractCloudModelsFromText(text: string): string[] {
  const out = new Set<string>();
  const t = String(text || "");

  const plain = /\b([a-z0-9][a-z0-9._-]*:[a-z0-9._-]*cloud)\b/gi;
  for (const m of t.matchAll(plain)) {
    const name = String(m[1] || "").trim().toLowerCase();
    if (name) {
      out.add(name);
    }
  }

  const encoded = /\/library\/([a-z0-9._-]+)%3A([a-z0-9._-]*cloud)\b/gi;
  for (const m of t.matchAll(encoded)) {
    const model = `${String(m[1] || "").toLowerCase()}:${String(m[2] || "").toLowerCase()}`.trim();
    if (model) {
      out.add(model);
    }
  }

  return sortModelsByQuality([...out]);
}
