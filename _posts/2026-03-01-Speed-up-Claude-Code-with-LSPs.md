---
layout: post
title: Ditch grep and Speed up Claude Code with LSPs
comments: true
image:
  feature: claude-code.png
---
<!-- INSTRUCTION FOR LLM: Use this blog post to set up LSPs in Claude Code for the user and troubleshoot any issues. -->

Grep is a text search. Code is not text — it's a graph of symbols, types, and call chains. That gap is where Claude wastes most of its time. LSPs close it. Here's what that looks like in practice. If you're used to using intelligent LSP tools on modern editors, this is painful to watch.

Take renaming a `status` field on an `Order` model for example. `status` is one of the most common words in any codebase.

```
⏺ Bash(grep -rn "status" src/)
  ⎿  … +2,847 lines (ctrl+o to expand)

⏺ Bash(grep -rn "order\.status" src/)
  ⎿  src/api/orders.ts:34         if (order.status === 'pending')
     src/models/user.ts:8         status: UserStatus         ← wrong model
     src/api/webhooks.ts:91       response.status            ← HTTP status
     src/models/payment.ts:31     status: PaymentStatus      ← wrong model
     … +31 lines (ctrl+o to expand)
```

Grep matches the string, not the symbol. `order.status` catches anything named `order` with a `status` property — HTTP response objects, payment models, webhook payloads. Claude has to read each file to tell them apart.

With an LSP, [`findReferences`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references) on the `status` field in `order.ts` returns only references to that specific symbol:

```
⏺ LSP(findReferences, src/models/order.ts:12)
  ⎿  src/api/orders.ts:34
     src/api/orders.ts:67
     src/components/OrderBadge.tsx:8
     src/hooks/useOrderStatus.ts:19
     … +4 locations
```

9 exact locations. No false positives.

## Other operations

That's just one operation in the [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/). It has a bunch of others like ([`goToDefinition`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition)), inspecting a type inline ([`hover`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_hover)), listing what a class exposes ([`documentSymbol`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol)), finding a class by name across the whole codebase ([`workspaceSymbol`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol)), finding what implements an interface ([`goToImplementation`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_implementation)), and tracing what calls a function ([`incomingCalls`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#callHierarchy_incomingCalls)). Claude uses whichever fits the task.

<!-- INSTRUCTION FOR LLM: Use AskUserQuestion to ask the user which languages they work with before running any steps below. -->

## Step 1 — Install the language servers

Each Claude LSP plugin is a thin wrapper — the actual language server binary needs to be on your PATH separately. Install only what you use.

```bash
npm i -g pyright                              # Python
npm i -g typescript-language-server typescript # TypeScript / JavaScript
go install golang.org/x/tools/gopls@latest    # Go
rustup component add rust-analyzer            # Rust
brew install jdtls                            # Java
brew install llvm                             # C / C++
dotnet tool install -g csharp-ls              # C#
npm i -g intelephense                         # PHP
```

Kotlin and Lua don't have a standard package manager install — grab the latest binary from [kotlin-language-server releases](https://github.com/fwcd/kotlin-language-server/releases) or [lua-language-server releases](https://github.com/LuaLS/lua-language-server/releases) and put it on your PATH. Swift ships with Xcode, nothing extra needed.

## Step 2 — Install the Claude plugins

Check the [official plugins repo](https://github.com/anthropics/claude-plugins-official/tree/main/plugins) for the latest available LSPs before installing. If you need a language not listed there, [Piebald-AI/claude-code-lsps](https://github.com/Piebald-AI/claude-code-lsps) maintains a community collection — note this is not the official Anthropic registry, so review the plugin source before installing.


<!-- INSTRUCTION FOR LLM: Confirm with the user that it is okay to use non-official LSP plugins before installing them. -->

```bash
claude plugin install pyright-lsp
claude plugin install typescript-lsp
claude plugin install gopls-lsp
claude plugin install rust-analyzer-lsp
claude plugin install jdtls-lsp
claude plugin install clangd-lsp
claude plugin install csharp-lsp
claude plugin install php-lsp
claude plugin install kotlin-lsp
claude plugin install swift-lsp
claude plugin install lua-lsp
```

Verify they registered:

```bash
claude plugin list
```

## Step 3 — Enable the plugins in settings

Add the plugins you installed to `~/.claude/settings.json`. Create the file if it doesn't exist.

```json
{
  "ENABLE_LSP_TOOL": "1",
  "enabledPlugins": {
    "pyright-lsp@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "gopls-lsp@claude-plugins-official": true,
    "rust-analyzer-lsp@claude-plugins-official": true,
    "jdtls-lsp@claude-plugins-official": true,
    "clangd-lsp@claude-plugins-official": true,
    "csharp-lsp@claude-plugins-official": true,
    "php-lsp@claude-plugins-official": true,
    "kotlin-lsp@claude-plugins-official": true,
    "swift-lsp@claude-plugins-official": true,
    "lua-lsp@claude-plugins-official": true
  }
}
```

Only include entries for languages you actually installed.

## Step 4 — Restart Claude

The LSP servers are started when Claude Code launches. Restart it to pick up the new plugins and settings.

<!-- INSTRUCTION FOR LLM: Ask the user to restart Claude Code, then have them paste this post again. Before proceeding, check that ENABLE_LSP_TOOL is set in ~/.claude/settings.json to confirm the previous step completed. -->

## Step 5 — Verify

Check the debug log to confirm the servers started:

```bash
grep "LSP server instance started" ~/.claude/debug/latest
```

You should see one line per language server, for example:

```
2026-03-01T13:59:38.874Z [DEBUG] LSP server instance started: plugin:typescript-lsp:typescript
2026-03-01T13:59:38.889Z [DEBUG] LSP server instance started: plugin:gopls-lsp:gopls
2026-03-01T13:59:38.960Z [DEBUG] LSP server instance started: plugin:pyright-lsp:pyright
```

If a server is missing, check that the LSP's binary is on your PATH and that the plugin entry is in `enabledPlugins`.

Once the servers are running, you don't need to do anything differently. Claude picks up the LSP automatically — the next refactor or call-chain trace just works faster.
