interface AvatarProps {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

const TONE_CLASSES = [
  "avatar--tone-1",
  "avatar--tone-2",
  "avatar--tone-3",
  "avatar--tone-4",
  "avatar--tone-5",
  "avatar--tone-6",
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TONE_CLASSES[hash % TONE_CLASSES.length];
}

export function Avatar({ name, size = "md", className, "aria-hidden": ariaHidden }: AvatarProps) {
  const resolved = name?.trim() ? name : "?";
  const initials = initialsOf(resolved);
  const tone = toneFor(resolved);
  const sizeClass = size === "sm" ? "avatar--sm" : size === "lg" ? "avatar--lg" : size === "xl" ? "avatar--xl" : "";
  return (
    <span
      className={["avatar", sizeClass, tone, className].filter(Boolean).join(" ").trim()}
      aria-hidden={ariaHidden ?? true}
    >
      {initials}
    </span>
  );
}