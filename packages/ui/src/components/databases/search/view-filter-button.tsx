// Modified by Heard: keep filtering reachable by touch in the mobile view header.
import { Filter } from 'lucide-react';

import { ViewFilterAddPopover } from '@colanode/ui/components/databases/search/view-filter-add-popover';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const ViewFilterButton = () => {
  const view = useDatabaseView();

  if (view.filters.length > 0) {
    return (
      <button
        type="button"
        aria-label="Show filters"
        className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5"
        onClick={() => view.openSearchBar()}
      >
        <Filter className="size-4" />
      </button>
    );
  }

  return (
    <ViewFilterAddPopover>
      <button
        type="button"
        aria-label="Add filter"
        className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5"
      >
        <Filter className="size-4" />
      </button>
    </ViewFilterAddPopover>
  );
};
