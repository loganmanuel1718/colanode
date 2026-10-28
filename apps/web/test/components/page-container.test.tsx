// Modified by Heard: protect phone page reading from automatic keyboard focus.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalPageNode } from '@colanode/client/types';
import { PageContainer } from '@colanode/ui/components/pages/page-container';
import { AppContext } from '@colanode/ui/contexts/app';

import { customRender, screen } from '../test-utils';

vi.mock('@colanode/ui/components/documents/document', () => ({
  Document: ({ autoFocus }: { autoFocus?: string }) => (
    <div data-testid="document" data-autofocus={autoFocus ?? 'none'} />
  ),
}));

const page = { id: '01aaaaaaaaaaaaaaaaaaaaaaaapg' } as LocalPageNode;

describe('PageContainer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens mobile web pages without focusing the editor', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    customRender(
      <AppContext.Provider value={{ type: 'web' }}>
        <PageContainer page={page} role="editor" />
      </AppContext.Provider>
    );
    expect(screen.getByTestId('document')).toHaveAttribute(
      'data-autofocus',
      'none'
    );
  });

  it('keeps desktop editor autofocus', () => {
    customRender(
      <AppContext.Provider value={{ type: 'web' }}>
        <PageContainer page={page} role="editor" />
      </AppContext.Provider>
    );
    expect(screen.getByTestId('document')).toHaveAttribute(
      'data-autofocus',
      'start'
    );
  });
});
