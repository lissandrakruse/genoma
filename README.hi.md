# Ollama Copilot Dev+DS

VS Code ke liye Copilot-style assistant, jisme:
- VS Code Chat panel me Super Chat
- Side Webview chat UI
- Local Ollama aur cloud Ollama-compatible endpoints
- Modes: Dev, Data Science, Dev+DS, DevOps/Infra, aur Power BI

## Super Chat kaise kholen

1. `View -> Chat` kholen
2. `@ollama-cloud-chat` type karein
3. Endpoint + model chunne ke liye `/provider` chalayein

## Commands

| Command | Vivaran |
|---|---|
| `/help` | Upalabdh commands dikhata hai |
| `/provider` ya `/endpoint` | Endpoint + model select karta hai |
| `/mode code` | Software engineering mode |
| `/mode ds` | Data science mode |
| `/mode devds` | Hybrid developer + data science mode |
| `/mode devops` | DevOps mode (PowerShell-first) |
| `/mode infra` | Infrastructure mode (PowerShell-first) |
| `/mode pbi` | Power BI mode |
| `/action <name>` | Action set karta hai (mode ke hisab se validated) |
| `/context file` | Cursor ke aas-paas file snippet use karta hai |
| `/context selection` | Selected text use karta hai |
| `/context off` | Editor context band |
| `/temp 0.3` | Temperature set karta hai (`0..2`) |
| `/status` | Session state dikhata hai |
| `/reset` | Session state reset karta hai |

## Modes

- `code`: explain, refactor, tests, fix, review, security
- `ds`: eda, sql, features, train_eval, debug, doc
- `devds`: software + data ka end-to-end workflow
- `devops` / `infra`: PowerShell-first operations guidance
- `pbi`: pbi_model, pbi_m, pbi_dax, pbi_visuals, pbi_checks

## Webview Features

- Common workflows ke liye presets
- Markdown rendering (code blocks, links, lists)
- Last request ke liye retry button
- Last answer copy/apply
- Provider/model/mode/action/context controls

## Cloud Commands (Command Palette)

- `Ollama Copilot: Open Ollama Cloud Signup / Keys`
- `Ollama Copilot: Open Cloud API Keys`
- `Ollama Copilot: Set Cloud API Key`

## Local-first

Support karta hai:
- Local Ollama (`http://localhost:11434`)
- Remote Ollama-compatible APIs
