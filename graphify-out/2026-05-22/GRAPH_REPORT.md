# Graph Report - .  (2026-05-22)

## Corpus Check
- Corpus is ~8,737 words - fits in a single context window. You may not need a graph.

## Summary
- 270 nodes · 476 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 150 input · 200 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 90 edges
2. `compilerOptions` - 16 edges
3. `scripts` - 8 edges
4. `Button()` - 8 edges
5. `tailwind` - 6 edges
6. `aliases` - 6 edges
7. `useSidebar()` - 5 edges
8. `SidebarMenuButton()` - 5 edges
9. `TooltipContent()` - 5 edges
10. `useAttachmentSrc()` - 4 edges

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

## Communities (15 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (40): GitHubIcon(), useIsMobile(), cn(), Input(), Separator(), Sheet(), SheetContent(), SheetDescription() (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (16): CodeHeader(), defaultComponents, MarkdownText, useCopyToClipboard(), Reasoning, ReasoningContent(), ReasoningFade(), ReasoningGroup (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (24): AttachmentPreview(), AttachmentPreviewDialog(), AttachmentPreviewProps, AttachmentThumb(), AttachmentUI(), ComposerAddAttachment(), ComposerAttachments(), useAttachmentSrc() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (21): statusIconMap, ToolFallback, ToolFallbackArgs(), ToolFallbackContent(), ToolFallbackError(), ToolFallbackImpl(), ToolFallbackResult(), ToolFallbackRoot() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (25): dependencies, ai, @ai-sdk/google, @ai-sdk/openai, @assistant-ui/react, @assistant-ui/react-ai-sdk, @assistant-ui/react-markdown, class-variance-authority (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (11): geistMono, geistSans, metadata, ThreadList(), TooltipIconButtonProps, Button(), buttonVariants, Tooltip() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): devDependencies, @biomejs/biome, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom, typescript (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (10): Assistant(), Thread(), ThreadListSidebar(), Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList() (+2 more)

## Knowledge Gaps
- **93 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 9`?**
  _High betweenness centrality (0.448) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 4` to `Community 7`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Why does `clsx` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08627450980392157 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0784313725490196 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0896551724137931 - nodes in this community are weakly interconnected._