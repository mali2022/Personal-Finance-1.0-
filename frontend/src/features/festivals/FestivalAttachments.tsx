import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, List, Upload } from 'antd';
import { apiClient } from '../../api/client';
import { read, errorText } from './api';
export function FestivalAttachments({
  id,
  version,
  onSaved,
}: {
  id: string;
  version: string;
  onSaved: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['festival-attachments', id],
    queryFn: () =>
      read<{ id: string; name: string; size: number }[]>(
        '/' + id + '/attachments',
      ),
  });
  return (
    <>
      <Upload
        showUploadList={false}
        accept="image/png,image/jpeg,application/pdf"
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            const data = new FormData();
            data.append('file', file);
            await apiClient.post('/festivals/' + id + '/attachments', data, {
              headers: {
                'Content-Type': 'multipart/form-data',
                'If-Match': version,
              },
            });
            await qc.invalidateQueries({
              queryKey: ['festival-attachments', id],
            });
            await onSaved();
            onSuccess?.({});
            message.success('附件已保存');
          } catch (e) {
            onError?.(e as Error);
            message.error(errorText(e));
          }
        }}
      >
        <Button>上传采购图片 / 凭据（PNG、JPEG、PDF）</Button>
      </Upload>
      <List
        dataSource={q.data}
        renderItem={(x) => (
          <List.Item>
            <Button
              type="link"
              onClick={async () => {
                try {
                  const response = await apiClient.get(
                    '/festivals/' + id + '/attachments/' + x.id,
                    { responseType: 'blob' },
                  );
                  const url = URL.createObjectURL(response.data);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = x.name;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (e) {
                  message.error(errorText(e));
                }
              }}
            >
              {x.name}
            </Button>
          </List.Item>
        )}
      />
      {q.isError && <Button onClick={() => q.refetch()}>重试附件列表</Button>}
    </>
  );
}
