// Modified by Heard: scroll view choices within a narrow database header.
import { ViewCreateButton } from '@colanode/ui/components/databases/view-create-button';
import { ViewTab } from '@colanode/ui/components/databases/view-tab';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseViews } from '@colanode/ui/contexts/database-views';

export const ViewTabs = () => {
  const database = useDatabase();
  const databaseViews = useDatabaseViews();

  return (
    <div className="flex min-w-0 w-full items-center gap-3 overflow-x-auto overscroll-x-contain whitespace-nowrap sm:w-auto sm:flex-1">
      {databaseViews.views.map((view) => (
        <ViewTab
          key={view.id}
          view={view}
          isActive={view.id === databaseViews.activeViewId}
          onClick={() => databaseViews.onActiveViewChange(view.id)}
        />
      ))}
      {database.canEdit && !database.isLocked && <ViewCreateButton />}
    </div>
  );
};
