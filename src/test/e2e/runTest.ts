import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../../..");
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");
  const workspacePath = path.resolve(__dirname, "./fixtures/test.code-workspace");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: {
      OLLAMA_COPILOT_TEST_MODE: "1",
    },
    launchArgs: [workspacePath, "--disable-extensions", "--skip-release-notes", "--skip-welcome"],
  });
}

main().catch((err) => {
  console.error("E2E tests failed:", err);
  process.exit(1);
});
