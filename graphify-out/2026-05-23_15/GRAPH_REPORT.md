# Graph Report - tf_ai  (2026-05-23)

## Corpus Check
- 54 files · ~13,210 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 539 nodes · 818 edges · 44 communities (39 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bcd6d913`
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
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 90 edges
2. `compilerOptions` - 16 edges
3. `columns` - 14 edges
4. `streamAIResponse()` - 11 edges
5. `public.conversations` - 11 edges
6. `public.inference_logs` - 11 edges
7. `public.messages` - 11 edges
8. `scripts` - 9 edges
9. `Button()` - 8 edges
10. `columns` - 8 edges

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

## Communities (44 total, 5 thin omitted)

### Community 0 - "UI Components (Sidebar)"
Cohesion: 0.06
Nodes (56): Assistant(), GEMINI_MODELS, GeminiModelId, TokenStats, useWebSocketChat(), GitHubIcon(), ThreadList(), Thread() (+48 more)

### Community 1 - "UI Components (Dialog)"
Cohesion: 0.11
Nodes (5): ComposerAddAttachment(), ComposerAttachments(), UserMessageAttachments(), AssistantMessage(), BranchPicker()

### Community 2 - "Package Dependencies"
Cohesion: 0.08
Nodes (31): geistMono, geistSans, metadata, AttachmentPreview(), AttachmentPreviewDialog(), AttachmentPreviewProps, AttachmentThumb(), AttachmentUI() (+23 more)

### Community 3 - "Tailwind & Aliases"
Cohesion: 0.18
Nodes (11): content, role, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 4 - "Package Scripts"
Cohesion: 0.07
Nodes (28): dependencies, ai, @ai-sdk/google, @ai-sdk/openai, @assistant-ui/react, @assistant-ui/react-ai-sdk, @assistant-ui/react-markdown, bullmq (+20 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.11
Nodes (31): buildContextWindow(), CoreMessage, estimateTokens(), warnIfOverBudget(), createConversation(), insertMessage(), updateConversationStatus(), updateConversationTitle() (+23 more)

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
Cohesion: 0.40
Nodes (5): output_tokens, name, notNull, primaryKey, type

### Community 15 - "PostCSS Config"
Cohesion: 0.32
Nodes (10): message(), open(), resetIdleTimer(), runAI(), send(), Session, sessions, sleep() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (29): messages_conversation_id_conversations_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo (+21 more)

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
Cohesion: 0.18
Nodes (11): model, title, name, notNull, primaryKey, type, columns, name (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (14): dialect, enums, id, _meta, columns, schemas, tables, policies (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (26): inference_logs_conversation_id_conversations_id_fk, inference_logs_message_id_messages_id_fk, columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom (+18 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (23): GET(), db, queryClient, cancelConversation(), getConversationsWithStats(), getConversationWithMessages(), insertInferenceLog(), conversations (+15 more)

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (3): dialect, entries, version

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (6): updated_at, default, name, notNull, primaryKey, type

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (5): error_message, name, notNull, primaryKey, type

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (5): input_preview, name, notNull, primaryKey, type

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (6): input_tokens, name, notNull, primaryKey, type, columns

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (5): latency_ms, name, notNull, primaryKey, type

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (5): message_id, name, notNull, primaryKey, type

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (6): created_at, default, name, notNull, primaryKey, type

### Community 39 - "Community 39"
Cohesion: 0.40
Nodes (5): output_preview, name, notNull, primaryKey, type

### Community 40 - "Community 40"
Cohesion: 0.40
Nodes (5): provider, name, notNull, primaryKey, type

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (5): status, name, notNull, primaryKey, type

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (6): id, default, name, notNull, primaryKey, type

### Community 43 - "Community 43"
Cohesion: 0.40
Nodes (5): conversation_id, name, notNull, primaryKey, type

## Knowledge Gaps
- **254 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Components (Sidebar)` to `UI Components (Dialog)`, `Package Dependencies`, `Package Scripts`, `Community 22`, `Community 23`, `Community 24`, `Community 25`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Scripts` to `App Navigation`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `clsx` connect `Package Scripts` to `UI Components (Sidebar)`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Components (Sidebar)` be split into smaller, more focused modules?**
  _Cohesion score 0.056049213943950786 - nodes in this community are weakly interconnected._
- **Should `UI Components (Dialog)` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07751937984496124 - nodes in this community are weakly interconnected._