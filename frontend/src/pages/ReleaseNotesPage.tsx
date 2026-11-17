import { ProductVersion } from '../features/releases/product';
import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { t, useLocale } from '../i18n';
import {
  activateUpdate,
  bundledReleases,
  fetchReleases,
  isNewerVersion,
} from '../features/releases/catalog';
import '../design/releases.css';

const kindLabels = { new: '新增功能', improved: '体验优化', fixed: '问题修复' };
const kindColors = { new: 'blue', improved: 'cyan', fixed: 'orange' };
export default function ReleaseNotesPage({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const locale = useLocale();
  const lang = locale === 'en' ? 'en' : 'zh';
  const { message, modal } = App.useApp();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState(false);
  const remote = useQuery({
    queryKey: ['release-info'],
    queryFn: fetchReleases,
    retry: false,
    staleTime: 60000,
  });
  const catalog = remote.data ?? bundledReleases;
  const hasUpdate =
    !!remote.data &&
    isNewerVersion(remote.data.currentVersion, bundledReleases.currentVersion);
  const normalized = search.trim().toLocaleLowerCase();
  const rows = catalog.releases.filter((r) =>
    [
      r.version ?? '',
      r.productVersion ?? '',
      r.date,
      r.title[lang],
      ...r.changes.map((x) => x[lang]),
    ].some((s) => s.toLocaleLowerCase().includes(normalized)),
  );
  const Container = standalone ? 'main' : 'section';
  async function check() {
    const result = await remote.refetch();
    if (result.error) {
      void message.warning(t('暂时无法检查更新，已显示本机更新记录'));
      return;
    }
    if (
      result.data &&
      !isNewerVersion(
        result.data.currentVersion,
        bundledReleases.currentVersion,
      )
    )
      void message.success(t('当前已是最新版本'));
  }
  function update() {
    modal.confirm({
      title: t('更新并刷新'),
      content: t('页面将重新加载，请先保存未提交的内容。'),
      okText: t('更新并刷新'),
      cancelText: t('取消'),
      onOk: async () => {
        setUpdating(true);
        try {
          await activateUpdate();
        } catch {
          setUpdating(false);
          void message.error(t('更新未完成，请检查网络后重试'));
        }
      },
    });
  }
  return (
    <Container
      className={`release-page${standalone ? ' release-page-standalone' : ''}`}
    >
      <ProductVersion />
      <div className="page-heading">
        <div>
          <PageTitle>{t('版本更新')}</PageTitle>
        </div>
        {standalone && <Link to="/settings/updates">{t('返回应用')}</Link>}
      </div>
      <Card className="release-current">
        <div className="release-current-row">
          <div className="release-version">
            <RocketOutlined aria-hidden="true" />
            <div>
              <span className="muted">{t('当前页面版本')}</span>
              <strong>v{bundledReleases.product?.version ?? bundledReleases.currentVersion}</strong>
              <Typography.Text type="secondary">{lang === 'zh' ? '发布号' : 'Release'}: {bundledReleases.currentVersion}</Typography.Text>
            </div>
          </div>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={remote.isFetching}
              onClick={() => void check()}
            >
              {t('检查更新')}
            </Button>
            {hasUpdate && (
              <Button type="primary" loading={updating} onClick={update}>
                {t('更新并刷新')}
              </Button>
            )}
          </Space>
        </div>
      </Card>
      {hasUpdate && (
        <Alert
          showIcon
          type="info"
          message={t('发现新版本：v{0}', catalog.currentVersion)}
          description={t('下方已展示最新更新内容，刷新后即可使用新版本。')}
        />
      )}
      {remote.isError && (
        <Alert
          showIcon
          type="warning"
          message={t('暂时无法检查更新，已显示本机更新记录')}
        />
      )}
      <Input.Search
        className="release-search"
        aria-label={t('搜索更新内容')}
        placeholder={t('搜索功能、修复或版本号')}
        allowClear
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <div className="release-list">
        {rows.slice((page - 1) * 5, page * 5).map((r) => (
          <Card className="release-entry" key={r.id}>
            <div className="release-entry-meta">
              <Space wrap>
                <Tag color={kindColors[r.kind]}>{t(kindLabels[r.kind])}</Tag>
                {(r.productVersion || r.version) && (
                  <Typography.Text strong>
                  {[
                    'Personal Finance',
                    catalog.product?.channel === 'beta'
                      ? lang === 'zh'
                        ? '测试版'
                        : 'Beta'
                      : null,
                    r.productVersion ?? r.version,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </Typography.Text>
                )}
                {r.version && <Typography.Text type="secondary">{lang === 'zh' ? '发布号' : 'Release'}: {r.version}</Typography.Text>}
              </Space>
              <time dateTime={r.date}>{r.date}</time>
            </div>
            <Typography.Title level={2}>{r.title[lang]}</Typography.Title>
            <ul>
              {r.changes.map((change, index) => (
                <li key={index}>{change[lang]}</li>
              ))}
            </ul>
          </Card>
        ))}
        {!rows.length && <Empty description={t('没有匹配的更新记录')} />}
      </div>
      {rows.length > 5 && (
        <Pagination
          aria-label={t('更新记录分页')}
          simple
          current={page}
          total={rows.length}
          pageSize={5}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
    </Container>
  );
}
