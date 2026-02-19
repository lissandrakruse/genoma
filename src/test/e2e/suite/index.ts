import * as path from "path";
import * as fs from "fs";
import Mocha = require("mocha");

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 60_000,
  });

  const testsRoot = path.resolve(__dirname);
  const entries = fs.readdirSync(testsRoot);
  for (const file of entries) {
    if (file.endsWith(".e2e.js")) {
      mocha.addFile(path.resolve(testsRoot, file));
    }
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}
