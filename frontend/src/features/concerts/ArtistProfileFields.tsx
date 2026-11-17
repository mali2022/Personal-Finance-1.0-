import { Button, Card, Form, Input, Select, Space } from 'antd';
import type { Topic } from './interestApi';
export function ArtistProfileFields({ topics, currentId }: { topics: Topic[]; currentId?: string }) {
  const type = Form.useWatch(['artistProfile', 'type']);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Form.Item name={['artistProfile', 'type']} label="艺人类别" rules={[{ required: true }]}>
      <Select options={[{ value: 'Solo', label: '个人艺人' }, { value: 'Band', label: '乐队 / 组合' }]} />
    </Form.Item>
    <Form.Item name={['artistProfile', 'aliases']} label="别名" rules={[{ type: 'array', max: 20 }]}>
      <Select mode="tags" tokenSeparators={[',', '，']} placeholder="输入别名后按回车，最多20个" />
    </Form.Item>
    {type === 'Band' && <Form.List name={['artistProfile', 'members']}>
      {(fields, { add, remove }) => <>
        {fields.map(field => <Card size="small" key={field.key} title={`成员 ${field.name + 1}`} extra={<Button onClick={() => remove(field.name)}>移除成员关系</Button>}>
          <Form.Item name={[field.name, 'artistId']} label="成员艺人" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={topics.filter(t => t.id !== currentId && t.input.kind === 'Artist' && t.input.artistProfile?.type !== 'Band').map(t => ({ value: t.id, label: t.input.name }))} />
          </Form.Item>
          <Form.Item name={[field.name, 'role']} label="成员角色"><Input maxLength={100} placeholder="例如主唱、吉他手" /></Form.Item>
          <Form.Item name={[field.name, 'joinedOn']} label="加入日期"><Input type="date" /></Form.Item>
          <Form.Item name={[field.name, 'leftOn']} label="离开日期"><Input type="date" /></Form.Item>
        </Card>)}
        <Button disabled={fields.length >= 100} onClick={() => add({ artistId: undefined, role: '', joinedOn: null, leftOn: null })}>添加成员关系</Button>
      </>}
    </Form.List>}
  </Space>;
}
