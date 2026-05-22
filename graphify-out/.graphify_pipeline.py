import sys, json, glob
from pathlib import Path
from datetime import datetime, timezone
from graphify.cache import save_semantic_cache
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html
from graphify.detect import save_manifest

# Merge chunks
chunks = sorted(glob.glob('graphify-out/.graphify_chunk_*.json'))
all_nodes, all_edges, all_hyperedges = [], [], []
total_in, total_out = 0, 0
for c in chunks:
    d = json.loads(Path(c).read_text(encoding="utf-8"))
    all_nodes += d.get('nodes', [])
    all_edges += d.get('edges', [])
    all_hyperedges += d.get('hyperedges', [])
    total_in += d.get('input_tokens', 0)
    total_out += d.get('output_tokens', 0)
new_semantic = {
    'nodes': all_nodes, 'edges': all_edges, 'hyperedges': all_hyperedges,
    'input_tokens': total_in, 'output_tokens': total_out,
}
Path('graphify-out/.graphify_semantic_new.json').write_text(json.dumps(new_semantic, indent=2, ensure_ascii=False), encoding="utf-8")
saved = save_semantic_cache(new_semantic.get('nodes', []), new_semantic.get('edges', []), new_semantic.get('hyperedges', []))

# Merge Semantic
cached = json.loads(Path('graphify-out/.graphify_cached.json').read_text(encoding="utf-8")) if Path('graphify-out/.graphify_cached.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}
all_nodes = cached['nodes'] + new_semantic.get('nodes', [])
all_edges = cached['edges'] + new_semantic.get('edges', [])
all_hyperedges = cached.get('hyperedges', []) + new_semantic.get('hyperedges', [])
seen = set()
deduped = []
for n in all_nodes:
    if n['id'] not in seen:
        seen.add(n['id'])
        deduped.append(n)

merged_semantic = {
    'nodes': deduped,
    'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': new_semantic.get('input_tokens', 0),
    'output_tokens': new_semantic.get('output_tokens', 0),
}
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps(merged_semantic, indent=2, ensure_ascii=False), encoding="utf-8")

# Merge AST and Semantic
ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text(encoding="utf-8"))
seen_ids = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in merged_semantic['nodes']:
    if n['id'] not in seen_ids:
        merged_nodes.append(n)
        seen_ids.add(n['id'])

merged_edges = ast['edges'] + merged_semantic['edges']
merged_hyperedges = merged_semantic.get('hyperedges', [])
extraction = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': merged_semantic.get('input_tokens', 0),
    'output_tokens': merged_semantic.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(extraction, indent=2, ensure_ascii=False), encoding="utf-8")

# Build and cluster
detection = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding="utf-8"))
G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

# Generate default labels and questions
labels = {cid: 'Community ' + str(cid) for cid in communities}
questions = suggest_questions(G, communities, labels)

# Generate Outputs
report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '.', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding="utf-8")
to_json(G, communities, 'graphify-out/graph.json')
to_html(G, communities, 'graphify-out/graph.html', community_labels=labels)

analysis = {
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods,
    'surprises': surprises,
    'questions': questions,
}
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8")

save_manifest(detection['files'])

cost_path = Path('graphify-out/cost.json')
if cost_path.exists():
    cost = json.loads(cost_path.read_text(encoding="utf-8"))
else:
    cost = {'runs': [], 'total_input_tokens': 0, 'total_output_tokens': 0}

cost['runs'].append({
    'timestamp': datetime.now(timezone.utc).isoformat(),
    'input_tokens': extraction.get('input_tokens', 0),
    'output_tokens': extraction.get('output_tokens', 0)
})
cost['total_input_tokens'] += extraction.get('input_tokens', 0)
cost['total_output_tokens'] += extraction.get('output_tokens', 0)
cost_path.write_text(json.dumps(cost, indent=2), encoding="utf-8")

print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
