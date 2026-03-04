"""Token 预算管理器：防止 AI 上下文溢出"""

MODEL_CONTEXT: dict[str, int] = {
    'qwen2.5:7b':   8_192,
    'qwen2.5:14b':  32_768,
    'llama3.2:3b':  4_096,
    'gpt-4o-mini':  128_000,
    'qwen-plus':    32_768,
}

RESERVED = {
    'system_prompt': 800,
    'user_input': 300,
    'history': 1_000,
    'output': 2_000,
    'safety': 500,
}


class TokenBudgetManager:
    def __init__(self, model: str = 'qwen2.5:7b') -> None:
        self.model = model
        self.total = MODEL_CONTEXT.get(model, 8_192)
        self.reserved = sum(RESERVED.values())

    @property
    def file_budget(self) -> int:
        return self.total - self.reserved

    def compress_tree(self, dir_stats: dict) -> str:
        """将目录统计压缩到 token 预算内，逐步降精度"""
        for depth in [3, 2, 1, 0]:
            summary = self._render(dir_stats, max_depth=depth)
            if self._estimate_tokens(summary) <= self.file_budget:
                return summary
        # 极限压缩
        total = dir_stats.get('total_files', 0)
        size = dir_stats.get('total_size_gb', 0)
        return f"根目录共 {total} 个文件，{size:.1f} GB"

    def _render(self, node: dict, max_depth: int, depth: int = 0) -> str:
        indent = '  ' * depth
        size = self._fmt_size(node.get('total_size', 0))
        types = self._fmt_types(node.get('type_counts', {}))
        count = node.get('file_count', 0)
        name = node.get('name', '')
        line = f"{indent}{name}/ ({count}文件, {size}) [{types}]\n"
        if depth < max_depth:
            for child in list(node.get('children', []))[:15]:
                line += self._render(child, max_depth, depth + 1)
        return line

    def _estimate_tokens(self, text: str) -> int:
        chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        return chinese + (len(text) - chinese) // 4

    def _fmt_size(self, b: int) -> str:
        for unit, div in [('GB', 1e9), ('MB', 1e6), ('KB', 1e3)]:
            if b >= div:
                return f'{b / div:.1f}{unit}'
        return f'{b}B'

    def _fmt_types(self, counts: dict) -> str:
        total = sum(counts.values()) or 1
        top = sorted(counts.items(), key=lambda x: -x[1])[:3]
        return ' '.join(f'{t}:{v * 100 // total}%' for t, v in top)
