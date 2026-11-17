import { t as tr, useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { useUI } from '../../stores/ui';
import { useEffect, useRef, useState } from 'react';
import { App, Button, List, Modal, Space, Upload } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachmentApi } from '../../api/operations';
import { ErrorState } from '../../components/Feedback';
import { formatDate } from '../../utils/finance';
import type { ApiError, Attachment } from '../../types';
import { saveBlob } from '../../utils/download';
export function AttachmentsPanel({
  transactionId,
  readOnly = false,
}: {
  transactionId: string;
  readOnly?: boolean;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [preview, setPreview] = useState<{
    url: string;
    attachment: Attachment;
  }>();
  const url = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const q = useQuery({
    queryKey: ['attachments', transactionId],
    queryFn: () => attachmentApi.list(transactionId),
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['attachments', transactionId] }),
      cache.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
  };
  const upload = useMutation({
    mutationFn: (file: File) => attachmentApi.upload(transactionId, file),
    onSuccess: async () => {
      await refresh();
      message.success(tr("附件已上传"));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) =>
      attachmentApi.remove(transactionId, attachment),
    onSuccess: refresh,
    onError: (e: ApiError) => message.error(e.message),
  });
  const content = useMutation({
    mutationFn: ({
      attachment,
      download,
    }: {
      attachment: Attachment;
      download: boolean;
    }) =>
      attachmentApi
        .content(transactionId, attachment.id)
        .then((blob) => ({ blob, attachment, download })),
    onSuccess: ({ blob, attachment, download }) => {
      if (download) {
        saveBlob(blob, attachment.name);
        return;
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      setPreview({ url: url.current, attachment });
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const close = () => {
    setPreview(undefined);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = undefined;
  };
  return (
    <section className="mt20">
      <h3>{tr("附件")}</h3>
      {!readOnly && (
        <Upload
          accept=".jpg,.jpeg,.png,.pdf"
          showUploadList={false}
          disabled={upload.isPending}
          beforeUpload={(file) => {
            if (!file.size || file.size > 10 * 1024 * 1024) {
              message.error(tr("附件须为1字节至10MB"));
              return false;
            }
            upload.mutate(file);
            return false;
          }}
        >
          <Button loading={upload.isPending}>{tr("上传凭证")}</Button>
        </Upload>
      )}
      <p className="muted">{tr("JPG / PNG / PDF，每笔最多5个，每个最多10MB。")}</p>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <List
          loading={q.isPending}
          dataSource={q.data}
          locale={{ emptyText: tr("暂无附件") }}
          renderItem={(attachment) => (
            <List.Item>
              <div>
                <strong>
                  <Sensitive>{attachment.name}</Sensitive>
                </strong>
                <p className="muted">
                  {(attachment.size / 1024).toFixed(1)} KB ·{' '}
                  {formatDate(attachment.uploadedAt, true)}
                </p>
                <Space wrap>
                  <Button
                    type="link"
                    loading={content.isPending}
                    onClick={() =>
                      content.mutate({ attachment, download: false })
                    }
                  >
                    {tr("查看附件")}</Button>
                  <Button
                    type="link"
                    onClick={() =>
                      content.mutate({ attachment, download: true })
                    }
                  >
                    {tr("下载附件")}</Button>
                  {!readOnly && (
                    <Button
                      danger
                      disabled={remove.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: tr("删除这个附件？"),
                          content: tr("删除凭证不会改变交易金额或账户余额。"),
                          onOk: () => remove.mutateAsync(attachment),
                        })
                      }
                    >
                      {tr("删除附件")}</Button>
                  )}
                </Space>
              </div>
            </List.Item>
          )}
        />
      )}
      <Modal
        title={preview?.attachment.name}
        open={!!preview && !hidden}
        onCancel={close}
        footer={<Button onClick={close}>{tr("关闭预览")}</Button>}
        width="min(800px,95vw)"
      >
        {preview &&
          (preview.attachment.contentType === 'application/pdf' ? (
            <iframe
              title={tr("PDF 凭证预览")}
              src={preview.url}
              sandbox=""
              style={{ width: '100%', height: 500, border: 0 }}
            />
          ) : (
            <img
              src={preview.url}
              alt={preview.attachment.name}
              style={{ width: '100%', maxHeight: 600, objectFit: 'contain' }}
            />
          ))}
      </Modal>
    </section>
  );
}
