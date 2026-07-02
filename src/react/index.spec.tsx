import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { VisualFeedback } from './index.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const overlayHost = (): Element | undefined =>
  [...document.body.children].find((child) => child.shadowRoot != null);

describe('<VisualFeedback />', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('mounts the overlay on render and removes it on unmount', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(() => {
      root.render(<VisualFeedback />);
    });
    expect(overlayHost()?.shadowRoot?.querySelector('.vf-fab')).toBeTruthy();

    await act(() => {
      root.unmount();
    });
    expect(overlayHost()).toBeUndefined();
  });
});
