import type { AvatarVariant } from './utils';

interface WorkHQAvatarProps {
  initials: string;
  variant?: AvatarVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function WorkHQAvatar({ initials, variant = 'green', size = 'md' }: WorkHQAvatarProps) {
  const sizeClass =
    size === 'xl' ? 'whq-avatar-xl'
    : size === 'lg' ? 'whq-avatar-lg'
    : size === 'sm' ? 'whq-avatar-sm'
    : '';
  return (
    <div
      className={`whq-avatar whq-avatar-${variant} ${sizeClass}`.trim()}
      aria-hidden
    >
      {initials}
    </div>
  );
}
