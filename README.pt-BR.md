# Ollama Copilot Dev+DS

Assistente estilo Copilot para VS Code com:
- Super Chat no painel de Chat do VS Code
- Webview lateral de chat
- Endpoint local (Ollama) e endpoints cloud compatíveis com API Ollama
- Modos: Dev, Data Science, Dev+DS, DevOps/Infra e Power BI

## Como abrir o Super Chat

1. Abra `View -> Chat`
2. Digite `@ollama-cloud-chat`
3. Execute `/provider` para escolher endpoint + modelo

## Comandos

| Comando | Descrição |
|---|---|
| `/help` | Mostra comandos disponíveis |
| `/ollama-cloud-chat` ou `/ollama` | Trava a sessão no endpoint local do Ollama |
| `/endpoint local` | Fixa a sessão no endpoint local |
| `/endpoint cloud` | Fixa a sessão no endpoint cloud |
| `/login` ou `/ollama.com` | Abre o login do Ollama Cloud no navegador |
| `/token` ou `/apikey` | Abre janela para colar a API Key do Ollama Cloud |
| `/provider` ou `/endpoint` | Seleciona endpoint + modelo |
| `/mode code` | Modo engenharia de software |
| `/mode ds` | Modo ciência de dados |
| `/mode devds` | Modo híbrido dev + dados |
| `/mode devops` | Modo DevOps (PowerShell-first) |
| `/mode infra` | Modo Infra (PowerShell-first) |
| `/mode pbi` | Modo Power BI |
| `/action <name>` | Define ação (validada por modo) |
| `/context file` | Usa trecho do arquivo no cursor |
| `/context workspace` | Usa contexto multi-arquivo da pasta/workspace |
| `/context selection` | Usa seleção atual |
| `/context off` | Sem contexto de editor |
| `/temp 0.3` | Ajusta temperatura (`0..2`) |
| `/status` | Mostra estado da sessão |
| `/reset` | Reseta estado da sessão |

## Modos

- `code`: explain, refactor, tests, fix, review, security
- `ds`: eda, sql, features, train_eval, debug, doc
- `devds`: fluxo fim-a-fim de software + dados
- `devops` / `infra`: operações com foco em PowerShell
- `pbi`: pbi_model, pbi_m, pbi_dax, pbi_visuals, pbi_checks

## Recursos do Webview

- Presets para fluxos comuns
- Renderização markdown (blocos de código, links, listas)
- Botão de retry da última requisição
- Copy/apply da última resposta
- Controle de provider/model/mode/action/context
- Seção `Setup Rápido`: `Usar Local`, `Conectar Cloud`, `Escolher Modelo Local`, `Testar Ollama Local`
- Troca Local/Cloud com destaque visual (um clique)
- Quando Cloud está ativo: botões de Login e Set Token no próprio painel
- Status do runtime local no painel (`online/offline` + quantidade de modelos)
- Se Cloud estiver sem token, o chat faz fallback automático para Local Ollama

## Comandos Cloud (Command Palette)

- `Ollama Copilot: Open Ollama Cloud Signup / Keys`
- `Ollama Copilot: Open Cloud API Keys`
- `Ollama Copilot: Set Cloud API Key`

## Onboarding

- No primeiro uso após instalar, a sidebar do Ollama Copilot abre automaticamente

## Local-first

Suporte a:
- Ollama local (`http://localhost:11434`)
- APIs remotas compatíveis com Ollama
