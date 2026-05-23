# Graph Report - tf_ai  (2026-05-22)

## Corpus Check
- 37 files · ~10,021 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 291 nodes · 507 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 90 edges
2. `compilerOptions` - 16 edges
3. `scripts` - 8 edges
4. `Button()` - 8 edges
5. `tailwind` - 6 edges
6. `aliases` - 6 edges
7. `streamAIResponse()` - 6 edges
8. `message()` - 6 edges
9. `resetIdleTimer()` - 5 edges
10. `useSidebar()` - 5 edges

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

## Communities (19 total, 5 thin omitted)

### Community 0 - "UI Components (Sidebar)"
Cohesion: 0.09
Nodes (40): GitHubIcon(), useIsMobile(), cn(), Input(), Separator(), Sheet(), SheetContent(), SheetDescription() (+32 more)

### Community 1 - "UI Components (Dialog)"
Cohesion: 0.05
Nodes (35): ComposerAddAttachment(), ComposerAttachments(), UserMessageAttachments(), Reasoning, ReasoningContent(), ReasoningFade(), ReasoningGroup, ReasoningRoot() (+27 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.10
Nodes (21): AttachmentPreview(), AttachmentPreviewDialog(), AttachmentPreviewProps, AttachmentThumb(), AttachmentUI(), useAttachmentSrc(), useFileSrc(), Avatar() (+13 more)

### Community 3 - "Tailwind & Aliases"
Cohesion: 0.15
Nodes (13): geistMono, geistSans, metadata, CodeHeader(), defaultComponents, MarkdownText, useCopyToClipboard(), TooltipIconButton (+5 more)

### Community 4 - "Package Scripts"
Cohesion: 0.08
Nodes (25): dependencies, ai, @ai-sdk/google, @ai-sdk/openai, @assistant-ui/react, @assistant-ui/react-ai-sdk, @assistant-ui/react-markdown, class-variance-authority (+17 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.28
Nodes (3): ThreadList(), Button(), buttonVariants

### Community 6 - "Thread Components"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 7 - "App Navigation"
Cohesion: 0.10
Nodes (20): devDependencies, @biomejs/biome, concurrently, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+12 more)

### Community 8 - "Tool Group"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Reasoning Components"
Cohesion: 0.19
Nodes (11): Assistant(), useWebSocketChat(), Thread(), ThreadListSidebar(), Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink() (+3 more)

### Community 15 - "PostCSS Config"
Cohesion: 0.32
Nodes (10): message(), open(), resetIdleTimer(), runAI(), send(), Session, sessions, sleep() (+2 more)

## Knowledge Gaps
- **98 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+93 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Components (Sidebar)` to `UI Components (Dialog)`, `Package Dependencies`, `Tailwind & Aliases`, `Package Scripts`, `TypeScript Config`, `Reasoning Components`?**
  _High betweenness centrality (0.393) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Scripts` to `App Navigation`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `clsx` connect `Package Scripts` to `UI Components (Sidebar)`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _98 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Components (Sidebar)` be split into smaller, more focused modules?**
  _Cohesion score 0.08627450980392157 - nodes in this community are weakly interconnected._
- **Should `UI Components (Dialog)` be split into smaller, more focused modules?**
  _Cohesion score 0.05117845117845118 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10256410256410256 - nodes in this community are weakly interconnected._