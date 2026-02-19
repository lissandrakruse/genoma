const ACTIONS_BY_MODE: Record<string, ReadonlyArray<string>> = {
  code: ["explain", "refactor", "tests", "fix", "review", "security"],
  ds: ["eda", "sql", "features", "train_eval", "debug", "doc"],
  devds: ["explain", "refactor", "tests", "fix", "review", "security", "eda", "sql", "features", "train_eval", "debug", "doc"],
  infra: ["infra_ps", "infra_ci", "infra_iac", "infra_obs", "infra_secops", "infra_runbook", "debug", "security", "doc"],
  devops: ["infra_ps", "infra_ci", "infra_iac", "infra_obs", "infra_secops", "infra_runbook", "debug", "security", "doc"],
  pbi: ["pbi_model", "pbi_m", "pbi_dax", "pbi_visuals", "pbi_checks"],
};

export function isActionAllowedForMode(mode: string, action: string | null): boolean {
  if (action === null) {
    return true;
  }
  const allowed = ACTIONS_BY_MODE[mode] ?? [];
  return allowed.includes(action);
}

export function normalizeActionForMode(mode: string, action: string | null): string | null {
  return isActionAllowedForMode(mode, action) ? action : null;
}

export function allowedActionsHint(mode: string): string {
  return (ACTIONS_BY_MODE[mode] ?? []).join(", ");
}

