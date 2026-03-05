import { useState, useEffect } from 'react';
import { Button, Card, Tag, Input, Empty, Spin, message, Table, Tooltip, Select, Image } from 'antd';
import { PictureOutlined, SearchOutlined, FolderOpenOutlined, TagsOutlined, DeleteOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import { pickFolder, tagImages, searchImagesByTag, listTaggedImages, removeImageTag, checkOllama, listOllamaModels } from '../services/file.service';
import type { ImageTag, TagProgress } from '../services/file.service';
import { formatSize } from '../utils/path.util';

export default function ImagePage() {
  const [images, setImages] = useState<ImageTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [progress, setProgress] = useState<TagProgress | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('llava:7b');

  useEffect(() => {
    loadImages();
    checkOllama().then(online => {
      setOllamaOnline(online);
      if (online) {
        listOllamaModels().then(models => {
          const names = models.map(m => m.name);
          setVisionModels(names);
          // Auto-select a vision model if available
          const vision = names.find(n => /llava|moondream|bakllava|minicpm-v/i.test(n));
          if (vision) setSelectedModel(vision);
        }).catch(() => {});
      }
    }).catch(() => setOllamaOnline(false));
  }, []);

  async function loadImages() {
    setLoading(true);
    try {
      const list = await listTaggedImages();
      setImages(list);
    } catch (e) {
      message.error('加载图片列表失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleTagDirectory() {
    const folder = await pickFolder();
    if (!folder) return;

    setTagging(true);
    setProgress(null);
    try {
      const result = await tagImages(folder, selectedModel);
      setProgress(result);
      if (result.completed > 0) {
        message.success(`成功标记 ${result.completed} 张图片`);
        await loadImages();
      } else if (result.total === 0) {
        message.info('该目录没有发现新的图片文件');
      } else {
        message.warning(`所有 ${result.total} 张图片标记失败`);
      }
    } catch (e) {
      message.error('标记失败: ' + String(e));
    } finally {
      setTagging(false);
    }
  }

  async function handleSearch() {
    if (!searchKeyword.trim()) {
      await loadImages();
      return;
    }
    setLoading(true);
    try {
      const results = await searchImagesByTag(searchKeyword.trim());
      setImages(results);
    } catch (e) {
      message.error('搜索失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: number) {
    try {
      await removeImageTag(id);
      setImages(prev => prev.filter(img => img.id !== id));
      message.success('已删除标签记录');
    } catch (e) {
      message.error('删除失败: ' + String(e));
    }
  }

  // Collect all unique tags for the tag cloud
  const allTags: Record<string, number> = {};
  images.forEach(img => {
    img.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean).forEach(tag => {
      allTags[tag] = (allTags[tag] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 20);

  const columns = [
    {
      title: '预览',
      key: 'preview',
      width: 72,
      render: (_: unknown, record: ImageTag) => (
        <Image
          src={convertFileSrc(record.path)}
          width={48}
          height={48}
          style={{ objectFit: 'cover', borderRadius: 6 }}
          fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNmMGYwZjQiLz48dGV4dCB4PSIyNCIgeT0iMjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNiZmJmYmYiIGZvbnQtc2l6ZT0iMTIiPj88L3RleHQ+PC9zdmc+"
          preview={{
            mask: <EyeOutlined style={{ fontSize: 14 }} />,
          }}
        />
      ),
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      width: 200,
      ellipsis: true,
      render: (name: string, record: ImageTag) => (
        <Tooltip title={record.path}>
          <span><PictureOutlined style={{ marginRight: 6, color: '#1677ff' }} />{name}</span>
        </Tooltip>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 300,
      render: (tags: string) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.split(/[,，]/).map(t => t.trim()).filter(Boolean).map((tag, i) => (
            <Tag key={i} color="blue" style={{ cursor: 'pointer' }}
              onClick={() => { setSearchKeyword(tag); searchImagesByTag(tag).then(setImages); }}>
              {tag}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => formatSize(size),
    },
    {
      title: '标记时间',
      dataIndex: 'tagged_at',
      key: 'tagged_at',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: ImageTag) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => handleRemove(record.id)} />
      ),
    },
  ];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2><PictureOutlined style={{ marginRight: 8 }} />图片智能标签</h2>
          <p>使用 AI 视觉模型自动识别图片内容并打标签</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag color={ollamaOnline ? 'success' : 'error'}>
            {ollamaOnline ? 'Ollama 在线' : 'Ollama 离线'}
          </Tag>
        </div>
      </div>

      {/* 操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            value={selectedModel}
            onChange={setSelectedModel}
            style={{ width: 200 }}
            placeholder="选择视觉模型"
            options={visionModels.length > 0
              ? visionModels.map(m => ({ value: m, label: m }))
              : [{ value: 'llava:7b', label: 'llava:7b (需先拉取)' }, { value: 'moondream', label: 'moondream (轻量)' }]
            }
          />
          <Button type="primary" icon={<FolderOpenOutlined />}
            onClick={handleTagDirectory} loading={tagging}
            disabled={!ollamaOnline}>
            {tagging ? '正在标记...' : '选择目录并标记'}
          </Button>
          <div style={{ flex: 1 }} />
          <Input.Search
            placeholder="按标签或描述搜索图片..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 280 }}
            enterButton={<SearchOutlined />}
            allowClear
            onClear={loadImages}
          />
          <Button icon={<ReloadOutlined />} onClick={loadImages}>刷新</Button>
        </div>
      </Card>

      {/* 标记进度 */}
      {progress && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div>
            <strong>最近标记结果：</strong>
            共 {progress.total} 张，成功 {progress.completed} 张
            {progress.errors.length > 0 && (
              <span style={{ color: '#ff4d4f', marginLeft: 8 }}>
                失败 {progress.errors.length} 张
              </span>
            )}
          </div>
          {progress.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              {progress.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </Card>
      )}

      {/* 标签云 */}
      {sortedTags.length > 0 && (
        <Card size="small" title={<span><TagsOutlined /> 热门标签</span>} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sortedTags.map(([tag, count]) => (
              <Tag key={tag} color="processing" style={{ cursor: 'pointer', fontSize: 13 }}
                onClick={() => { setSearchKeyword(tag); searchImagesByTag(tag).then(setImages); }}>
                {tag} ({count})
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 图片列表 */}
      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : images.length === 0 ? (
          <Empty
            image={<PictureOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
            description={
              <span>
                暂无标记的图片
                <br />
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  点击「选择目录并标记」开始分析图片
                  {!ollamaOnline && '（需要先启动 Ollama 并拉取视觉模型如 llava:7b）'}
                </span>
              </span>
            }
          />
        ) : (
          <Table
            dataSource={images}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showTotal: t => `共 ${t} 张图片` }}
          />
        )}
      </Card>
    </div>
  );
}
