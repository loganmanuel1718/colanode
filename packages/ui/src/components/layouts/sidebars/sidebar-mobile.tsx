// Modified by Heard: provide a phone-sized navigation target in the web workspace.
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useLocation } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Sidebar } from '@colanode/ui/components/layouts/sidebars/sidebar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@colanode/ui/components/ui/sheet';

export const SidebarMobile = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <VisuallyHidden>
        <SheetTitle>Sidebar</SheetTitle>
        <SheetDescription>Colanode sidebar for mobile devices</SheetDescription>
      </VisuallyHidden>
      <SheetTrigger asChild>
        <button
          className="flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open sidebar"
        >
          <Menu className="size-5 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[90%] max-w-sm p-0 border-0"
        showCloseButton={false}
        aria-describedby="mobile-sidebar-description"
      >
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
};
