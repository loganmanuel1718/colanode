// Modified by Heard: make the inline database expansion reachable on phones.
import { Fullscreen } from 'lucide-react';

import { Link } from '@colanode/ui/components/ui/link';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';

export const ViewFullscreenButton = () => {
  const database = useDatabase();
  const views = useDatabaseViews();

  if (!views.inline) {
    return null;
  }

  return (
    <Link
      from="/workspace/$userId"
      to="$nodeId"
      params={{ nodeId: database.id }}
      className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5"
      aria-label="Open full database"
    >
      <Fullscreen className="size-4" />
    </Link>
  );
};
