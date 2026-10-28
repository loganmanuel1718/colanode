// Modified by Heard: give database view creation a usable touch and keyboard target.
import { Plus } from 'lucide-react';
import { Fragment, useState } from 'react';

import { ViewCreateDialog } from '@colanode/ui/components/databases/view-create-dialog';

export const ViewCreateButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <button
        type="button"
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Create database view"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
      </button>
      <ViewCreateDialog open={open} onOpenChange={setOpen} />
    </Fragment>
  );
};
