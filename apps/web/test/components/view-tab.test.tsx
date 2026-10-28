// Modified by Heard: cover keyboard-accessible database view selection.
import { describe, expect, it, vi } from 'vitest';

import { LocalDatabaseViewNode } from '@colanode/client/types';
import { ViewTab } from '@colanode/ui/components/databases/view-tab';

import { customRender, fireEvent, screen } from '../test-utils';

const view = {
  id: '01aaaaaaaaaaaaaaaaaaaaaaaadv',
  name: 'Kitchen inventory',
  avatar: null,
  layout: 'table',
} as LocalDatabaseViewNode;

describe('ViewTab', () => {
  it('exposes the active view as a focusable button', () => {
    const onClick = vi.fn();
    customRender(<ViewTab view={view} isActive onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Kitchen inventory' });
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
