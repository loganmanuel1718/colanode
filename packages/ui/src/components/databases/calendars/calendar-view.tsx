// Modified by Heard: share the phone-accessible database view header.
import { Fragment } from 'react';

import { CalendarViewGrid } from '@colanode/ui/components/databases/calendars/calendar-view-grid';
import { CalendarViewNoGroup } from '@colanode/ui/components/databases/calendars/calendar-view-no-group';
import { CalendarViewNoValueCount } from '@colanode/ui/components/databases/calendars/calendar-view-no-value-count';
import { CalendarViewSettings } from '@colanode/ui/components/databases/calendars/calendar-view-settings';
import { ViewFilterButton } from '@colanode/ui/components/databases/search/view-filter-button';
import { ViewSearchBar } from '@colanode/ui/components/databases/search/view-search-bar';
import { ViewSortButton } from '@colanode/ui/components/databases/search/view-sort-button';
import { ViewFullscreenButton } from '@colanode/ui/components/databases/view-fullscreen-button';
import { ViewHeader } from '@colanode/ui/components/databases/view-header';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const CalendarView = () => {
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
            {groupByField && <CalendarViewNoValueCount field={groupByField} />}
            <ViewFullscreenButton />
            <CalendarViewSettings />
            <ViewSortButton />
            <ViewFilterButton />
          </>
        }
      />
      <ViewSearchBar />
      <div className="mt-2 w-full min-w-full max-w-full overflow-auto pr-5">
        {groupByField ? (
          <CalendarViewGrid field={groupByField} />
        ) : (
          <CalendarViewNoGroup />
        )}
      </div>
    </Fragment>
  );
};
