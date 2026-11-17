import { useState } from 'react';
import { App, Button, Space, Upload, Image } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import type { PurchaseRecord } from './interestApi';
export function InterestFiles({
  record,
  onVersion,
}: {
  record: PurchaseRecord;
  onVersion: (version: string) => void;
}) {
  const { message } = App.useApp();
  const [preview, setPreview] = useState<string>();
  const files = useQuery({
    queryKey: ['music-files', record.id],
    queryFn: () =>
      apiClient
        .get<ApiResponse<{ id: string; name: string; contentType: string }[]>>(
          `/concerts/interests/purchases/${record.id}/attachments`,
        )
        .then((r) => r.data.data),
  });
  const open = async (id: string, type: string) => {
    try {
      const r = await apiClient.get(
        `/concerts/interests/purchases/${record.id}/attachments/${id}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(r.data);
      if (type.startsWith('image/')) {
        if (preview) URL.revokeObjectURL(preview);
        setPreview(url);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download =
          files.data?.find((f) => f.id === id)?.name || 'receipt.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      message.error((e as Error).message || '操作失败，请重试');
    }
  };
  return (
    <Space wrap>
      <Upload
        accept=".png,.jpg,.jpeg,.pdf"
        showUploadList={false}
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            const form = new FormData();
            form.append('file', file);
            const r = await apiClient.post<ApiResponse<{ version: string }>>(
              `/concerts/interests/purchases/${record.id}/attachments`,
              form,
              {
                headers: {
                  'Content-Type': 'multipart/form-data',
                  'If-Match': record.version,
                },
              },
            );
            onVersion(r.data.data.version);
            await files.refetch();
            onSuccess?.({});
          } catch (e) {
            onError?.(e as Error);
            message.error((e as Error).message || '操作失败，请重试');
          }
        }}
      >
        <Button>上传商品图片 / 购买凭证</Button>
      </Upload>
      {files.data?.map((f) => (
        <Button key={f.id} onClick={() => open(f.id, f.contentType)}>
          {f.name}
        </Button>
      ))}
      {preview && (
        <Image style={{ maxHeight: 200, maxWidth: 250 }} src={preview} />
      )}
    </Space>
  );
}
