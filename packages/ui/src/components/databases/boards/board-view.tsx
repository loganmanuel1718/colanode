// Modified by Heard: share the phone-accessible database view header.
import { Fragment } from 'react';

import { BoardViewColumns } from '@colanode/ui/components/databases/boards/board-view-columns';
import { BoardViewNoGroup } from '@colanode/ui/components/databases/boards/board-view-no-group';
import { BoardViewSettings } from '@colanode/ui/components/databases/boards/board-view-settings';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewHeader } from '@colanode/ui/components/databases/view-header';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const BoardView = () => {
  const database = useDatabase();
  const view = useDatabaseView();

  const groupByField = database.fields.find(
    (field) => field.id === view.groupBy
  );

  return (
    <Fragment>
      <ViewHeader
        actions={
          <>
            <ViewFullscreenButton />
            <BoardViewSettings />
            <ViewSortButton />
            <ViewFilterButton />
          </>
        }
      />
      <ViewSearchBar />
      <div className="mt-2 flex w-full min-w-full max-w-full flex-row gap-2 overflow-auto pr-5">
        {groupByField ? (
          <BoardViewColumns field={groupByField} />
        ) : (
          <BoardViewNoGroup />
        )}
      </div>
    </Fragment>
  );
};
