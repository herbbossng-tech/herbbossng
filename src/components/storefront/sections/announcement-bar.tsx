import type { AnnouncementBarData } from '@/types/landing-sections';

export function AnnouncementBar({ data }: { data: AnnouncementBarData }) {
  return (
    <div className="bg-brand-dark py-2 text-center text-xs font-medium text-white sm:text-sm">
      {data.icon && <span className="mr-2">{data.icon}</span>}
      {data.text}
    </div>
  );
}
