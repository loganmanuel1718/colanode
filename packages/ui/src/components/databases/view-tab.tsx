// Modified by Heard: make view selection keyboard accessible and touch sized.
import { LocalDatabaseViewNode } from '@colanode/client/types';
import { ViewIcon } from '@colanode/ui/components/databases/view-icon';
import { cn } from '@colanode/ui/lib/utils';

interface ViewTabProps {
  view: LocalDatabaseViewNode;
  isActive: boolean;
  onClick: () => void;
}

export const ViewTab = ({ view, isActive, onClick }: ViewTabProps) => {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 shrink-0 cursor-pointer flex-row items-center gap-1 border-b-2 px-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
        isActive ? 'border-border' : 'border-transparent'
      )}
      onClick={onClick}
    >
      <ViewIcon
        id={view.id}
        name={view.name}
        avatar={view.avatar}
        layout={view.layout}
        className="size-4"
      />
      {view.name}
    </button>
  );
};
