interface Tag {
  key: string;
  labelEn: string;
  colorHex?: string | null;
}

interface Props {
  tags: Tag[];
  max?: number;
}

export function JobTagChips({ tags, max = 4 }: Props) {
  if (tags.length === 0) return null;

  const visible = tags.slice(0, max);
  const overflow = tags.length - max;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <span
          key={tag.key}
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={
            tag.colorHex
              ? {
                  backgroundColor: `${tag.colorHex}18`,
                  borderColor: `${tag.colorHex}40`,
                  color: tag.colorHex,
                }
              : undefined
          }
        >
          {tag.labelEn}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">+{overflow}</span>
      )}
    </div>
  );
}
