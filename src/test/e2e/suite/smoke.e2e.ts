import * as assert from "assert";
import * as vscode from "vscode";
import { suite, test } from "mocha";

suite("E2E Smoke Suite", () => {
  test("extension activates and core commands are registered", async () => {
    const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === "ollama-copilot-devds");
    assert.ok(ext, "Extension should be installed in test host.");
    await ext!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("ollama-copilot-devds.openChat"));
    assert.ok(commands.includes("ollamaCopilot.setModelStrategy"));
    assert.ok(commands.includes("ollamaCopilot.setCloudCatalogPolicy"));
  });
});
