interface Props {
  title: string;
  desc: string;
}

export default function PlaceholderPage({ title, desc }: Props) {
  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div style={{
        background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0',
        padding: '60px 0', textAlign: 'center', color: '#bfbfbf', fontSize: 14,
      }}>
        该页面正在开发中
      </div>
    </div>
  );
}
