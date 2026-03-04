"""AI 调用安全模块：脱敏 + 响应校验"""
import re
from typing import Any

SENSITIVE_PATTERNS = [
    (r'\d{15,18}',         '疑似身份证号'),
    (r'\d{16,19}',         '疑似银行卡号'),
    (r'password\s*[=:]',   '疑似密码配置'),
    (r'secret\s*[=:]',     '疑似密钥'),
    (r'-----BEGIN.*KEY',   '疑似私钥文件'),
    (r'1[3-9]\d{9}',       '疑似手机号'),
]


def sanitize_for_ai(content: str, mode: str = 'filename') -> str:
    """发送给 AI 前脱敏处理。filename 模式只截断，content 模式先脱敏再截断。"""
    if mode == 'filename':
        return content[:200]

    # content 模式：脱敏后截断
    for pattern, _ in SENSITIVE_PATTERNS:
        content = re.sub(pattern, '[REDACTED]', content)
    return content[:2000]


def detect_sensitive(content: str) -> list[str]:
    """检测文件内容中的敏感信息（本地检测，结果不上传）"""
    found = []
    for pattern, label in SENSITIVE_PATTERNS:
        if re.search(pattern, content):
            found.append(label)
    return found


def validate_ai_response(resp: Any) -> bool:
    """严格验证 AI 返回的分类结果合法性"""
    if not isinstance(resp, dict):
        return False
    required = ['file', 'target', 'category', 'confidence']
    if not all(k in resp for k in required):
        return False
    try:
        confidence = float(resp['confidence'])
        if not (0.0 <= confidence <= 1.0):
            return False
    except (ValueError, TypeError):
        return False
    # 目标路径不能是绝对路径（防越权）
    target = str(resp.get('target', ''))
    if target.startswith('/') or (len(target) > 1 and target[1] == ':'):
        return False
    # 路径穿越检测
    if '..' in target:
        return False
    return True
