use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecurityError {
    #[error("路径不合法: {0}")]
    InvalidPath(String),
    #[error("禁止访问系统路径: {0}")]
    ForbiddenPath(String),
    #[error("路径包含符号链接逃逸")]
    SymlinkEscape,
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}

pub struct PathGuard {
    forbidden_prefixes: Vec<PathBuf>,
}

impl PathGuard {
    pub fn new() -> Self {
        Self {
            forbidden_prefixes: vec![
                PathBuf::from("C:\\Windows"),
                PathBuf::from("C:\\System32"),
                PathBuf::from("C:\\Program Files"),
                PathBuf::from("C:\\Program Files (x86)"),
                PathBuf::from("C:\\ProgramData\\Microsoft"),
            ],
        }
    }

    pub fn validate(&self, path: &Path) -> Result<PathBuf, SecurityError> {
        // 1. 规范化消除路径穿越
        let canonical = path
            .canonicalize()
            .map_err(|_| SecurityError::InvalidPath(path.to_string_lossy().into_owned()))?;

        // 2. 系统路径黑名单
        for forbidden in &self.forbidden_prefixes {
            if canonical.starts_with(forbidden) {
                return Err(SecurityError::ForbiddenPath(
                    canonical.to_string_lossy().into_owned(),
                ));
            }
        }

        // 3. 符号链接检测（防逃逸）
        if path.is_symlink() {
            let real = std::fs::read_link(path)?;
            let real_canonical = real
                .canonicalize()
                .map_err(|_| SecurityError::SymlinkEscape)?;
            for forbidden in &self.forbidden_prefixes {
                if real_canonical.starts_with(forbidden) {
                    return Err(SecurityError::SymlinkEscape);
                }
            }
        }

        Ok(canonical)
    }

    pub fn is_safe_to_delete(path: &Path) -> bool {
        // 额外的删除安全检查：确保不是系统关键文件
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let dangerous_names = ["pagefile.sys", "hiberfil.sys", "swapfile.sys", "ntldr", "bootmgr"];
        !dangerous_names.iter().any(|&n| name.eq_ignore_ascii_case(n))
    }
}

impl Default for PathGuard {
    fn default() -> Self {
        Self::new()
    }
}
