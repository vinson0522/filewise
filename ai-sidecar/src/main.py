"""FileWise AI Sidecar 入口"""
import json
import sys
import logging
from security import sanitize_for_ai, validate_ai_response
from token_budget import TokenBudgetManager

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


def handle_classify(payload: dict) -> dict:
    """处理文件分类请求（Layer 2: 本地 AI）"""
    files = payload.get('files', [])
    dir_summary = payload.get('dir_summary', {})
    model = payload.get('model', 'qwen2.5:7b')

    budget_manager = TokenBudgetManager(model=model)
    tree_summary = budget_manager.compress_tree(dir_summary)

    # 脱敏文件名列表
    safe_files = [sanitize_for_ai(f, mode='filename') for f in files]

    # TODO: 调用 Ollama 进行分类
    results = []
    for f in safe_files:
        result = {'file': f, 'target': 'misc/', 'category': '其他', 'confidence': 0.5}
        if validate_ai_response(result):
            results.append(result)

    return {'results': results, 'tree_tokens': budget_manager._estimate_tokens(tree_summary)}


def handle_search_embed(payload: dict) -> dict:
    """处理语义搜索 Embedding 请求"""
    query = sanitize_for_ai(payload.get('query', ''), mode='filename')
    # TODO: 使用 sentence-transformers 生成 embedding 并查询 Qdrant
    return {'results': [], 'query': query}


HANDLERS = {
    'classify': handle_classify,
    'search_embed': handle_search_embed,
}


def main() -> None:
    logger.info('FileWise AI Sidecar 启动')
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            action = request.get('action', '')
            handler = HANDLERS.get(action)
            if handler is None:
                response = {'error': f'未知操作: {action}'}
            else:
                response = handler(request.get('payload', {}))
            print(json.dumps(response, ensure_ascii=False), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({'error': f'JSON 解析失败: {e}'}), flush=True)
        except Exception as e:
            logger.exception('处理请求时发生错误')
            print(json.dumps({'error': str(e)}), flush=True)


if __name__ == '__main__':
    main()
