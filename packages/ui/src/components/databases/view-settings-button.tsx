// Modified by Heard: size the database settings trigger for phone use.
import { Settings } from 'lucide-react';

export const ViewSettingsButton = () => {
  return (
    <div className="flex size-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent sm:size-auto sm:p-1.5">
      <Settings className="size-4" />
    </div>
  );
};
