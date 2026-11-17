import { useEffect, useState } from 'react';
import { Avatar } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { profileApi } from '../api/profile';
export function UserAvatar({
  userId,
  updatedAt,
  name,
  size = 30,
}: {
  userId?: string;
  updatedAt?: string | null;
  name?: string;
  size?: number;
}) {
  const q = useQuery({
    queryKey: ['avatar', userId, updatedAt],
    queryFn: profileApi.avatar,
    enabled: !!userId && !!updatedAt,
    retry: false,
    staleTime: Infinity,
  });
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!q.data) {
      setSrc(undefined);
      return;
    }
    const url = URL.createObjectURL(q.data);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [q.data]);
  return (
    <Avatar
      size={size}
      src={src}
      style={{ background: '#dcece5', color: '#267b70' }}
    >
      {name?.slice(0, 1) || 'P'}
    </Avatar>
  );
}
