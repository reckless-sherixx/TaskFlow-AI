# Graph Report - tf_ai  (2026-05-23)

## Corpus Check
- 52 files · ~11,622 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 513 nodes · 758 edges · 31 communities (25 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fffa2d10`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Components (Sidebar)|UI Components (Sidebar)]]
- [[_COMMUNITY_UI Components (Dialog)|UI Components (Dialog)]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Tailwind & Aliases|Tailwind & Aliases]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Thread Components|Thread Components]]
- [[_COMMUNITY_App Navigation|App Navigation]]
- [[_COMMUNITY_Tool Group|Tool Group]]
- [[_COMMUNITY_Reasoning Components|Reasoning Components]]
- [[_COMMUNITY_Thread List|Thread List]]
- [[_COMMUNITY_Markdown Component|Markdown Component]]
- [[_COMMUNITY_Chat API Route|Chat API Route]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Next Env Types|Next Env Types]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 90 edges
2. `compilerOptions` - 16 edges
3. `columns` - 14 edges
4. `public.conversations` - 11 edges
5. `public.inference_logs` - 11 edges
6. `public.messages` - 11 edges
7. `scripts` - 9 edges
8. `Button()` - 8 edges
9. `columns` - 8 edges
10. `created_at` - 8 edges

## Surprising Connections (you probably didn't know these)
- `cn()` --calls--> `clsx`  [INFERRED]
  lib/utils.ts → package.json
- `AttachmentPreview()` --calls--> `cn()`  [EXTRACTED]
  components/attachment.tsx → lib/utils.ts
- `AttachmentUI()` --calls--> `cn()`  [EXTRACTED]
  components/attachment.tsx → lib/utils.ts
- `ReasoningFade()` --calls--> `cn()`  [EXTRACTED]
  components/reasoning.tsx → lib/utils.ts
- `AssistantMessage()` --calls--> `cn()`  [EXTRACTED]
  components/thread.tsx → lib/utils.ts

## Communities (31 total, 6 thin omitted)

### Community 0 - "UI Components (Sidebar)"
Cohesion: 0.06
Nodes (57): Assistant(), useWebSocketChat(), GitHubIcon(), Thread(), ThreadListSidebar(), useIsMobile(), cn(), Avatar() (+49 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.07
Nodes (29): geistMono, geistSans, metadata, AttachmentPreview(), AttachmentPreviewDialog(), AttachmentPreviewProps, AttachmentThumb(), AttachmentUI() (+21 more)

### Community 3 - "Tailwind & Aliases"
Cohesion: 0.05
Nodes (41): content, conversation_id, id, role, name, notNull, primaryKey, type (+33 more)

### Community 4 - "Package Scripts"
Cohesion: 0.07
Nodes (28): dependencies, ai, @ai-sdk/google, @ai-sdk/openai, @assistant-ui/react, @assistant-ui/react-ai-sdk, @assistant-ui/react-markdown, bullmq (+20 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.17
Nodes (16): fireLog(), getIngestUrl(), LoggerOptions, LogPayload, sendLog(), TokenUsage, withLogger(), fetch() (+8 more)

### Community 6 - "Thread Components"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 7 - "App Navigation"
Cohesion: 0.08
Nodes (23): devDependencies, @biomejs/biome, concurrently, drizzle-kit, tailwindcss, @tailwindcss/postcss, @types/node, @types/pg (+15 more)

### Community 8 - "Tool Group"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Reasoning Components"
Cohesion: 0.05
Nodes (41): error_message, input_preview, input_tokens, latency_ms, message_id, output_preview, output_tokens, status (+33 more)

### Community 15 - "PostCSS Config"
Cohesion: 0.32
Nodes (10): message(), open(), resetIdleTimer(), runAI(), send(), Session, sessions, sleep() (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (10): ToolGroup, ToolGroupComponent, ToolGroupContent(), ToolGroupRoot(), ToolGroupRootProps, ToolGroupTrigger(), toolGroupVariants, Collapsible() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (9): Reasoning, ReasoningContent(), ReasoningFade(), ReasoningGroup, ReasoningRoot(), ReasoningRootProps, ReasoningText(), ReasoningTrigger() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (11): statusIconMap, ToolFallback, ToolFallbackArgs(), ToolFallbackContent(), ToolFallbackError(), ToolFallbackImpl(), ToolFallbackResult(), ToolFallbackRoot() (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (5): CodeHeader(), defaultComponents, MarkdownText, useCopyToClipboard(), TooltipIconButton

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (38): created_at, model, provider, title, updated_at, default, name, notNull (+30 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (26): inference_logs_conversation_id_conversations_id_fk, inference_logs_message_id_messages_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom (+18 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (14): dialect, enums, id, _meta, columns, schemas, tables, policies (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (18): db, queryClient, createConversation(), insertInferenceLog(), insertMessage(), conversations, inferenceLogs, messages (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (3): dialect, entries, version

## Knowledge Gaps
- **248 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+243 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Components (Sidebar)` to `UI Components (Dialog)`, `Package Dependencies`, `Package Scripts`, `Community 22`, `Community 23`, `Community 24`, `Community 25`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Scripts` to `App Navigation`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `clsx` connect `Package Scripts` to `UI Components (Sidebar)`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _248 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Components (Sidebar)` be split into smaller, more focused modules?**
  _Cohesion score 0.0609009009009009 - nodes in this community are weakly interconnected._
- **Should `UI Components (Dialog)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06765327695560254 - nodes in this community are weakly interconnected._