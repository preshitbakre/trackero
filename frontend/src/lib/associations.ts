export type StoredLinkType = 'belongs_to' | 'relates_to' | 'blocks' | 'caused_by';
export type VirtualLinkType = 'contains' | 'blocked_by';
export type LinkType = StoredLinkType | VirtualLinkType;

export const LINK_TYPE_OPTIONS: { value: LinkType; label: string }[] = [
  { value: 'belongs_to', label: 'Part of' },
  { value: 'contains', label: 'Contains' },
  { value: 'relates_to', label: 'Related' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'blocked_by', label: 'Blocked by' },
  { value: 'caused_by', label: 'Caused by' },
];

export const LINK_TYPE_LABELS: Record<LinkType, string> = Object.fromEntries(
  LINK_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<LinkType, string>;

export function isVirtualLinkType(type: string): type is VirtualLinkType {
  return type === 'contains' || type === 'blocked_by';
}
