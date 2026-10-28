// Modified by Heard: share the phone-accessible database view header.
import { Fragment } from 'react';

import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { TableViewBody } from '@colanode/ui/components/databases/tables/table-view-body';
import { TableViewHeader } from '@colanode/ui/components/databases/tables/table-view-header';
import { TableViewRecordCreateRow } from '@colanode/ui/components/databases/tables/table-view-record-create-row';
import { TableViewSettings } from '@colanode/ui/components/databases/tables/table-view-settings';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewHeader } from '@colanode/ui/components/databases/view-header';

export const TableView = () => {
  return (
    <Fragment>
      <ViewHeader
        actions={
          <>
            <ViewFullscreenButton />
            <TableViewSettings />
            <ViewSortButton />
            <ViewFilterButton />
          </>
        }
      />
      <ViewSearchBar />
      <div className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5">
        <TableViewHeader />
        <TableViewBody />
        <TableViewRecordCreateRow />
      </div>
    </Fragment>
  );
};
