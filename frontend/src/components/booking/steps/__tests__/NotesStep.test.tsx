import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { useForm, Control, FieldValues } from 'react-hook-form';
import { NotesStep } from '../../wizard/Steps';
import * as api from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('../../../ui/Toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));


function Wrapper() {
  const { control, setValue } = useForm();
  return (
    <NotesStep
      control={control as unknown as Control<FieldValues>}
      setValue={setValue}
    />
  );
}

describe('NotesStep attachment upload', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows upload progress and disables Next button', async () => {
    let resolveUpload: () => void;
    (api.uploadBookingAttachment as jest.Mock).mockImplementation(
      (_form: FormData, cb?: (e: { loaded: number; total: number }) => void) => {
        cb?.({ loaded: 25, total: 100 });
        return new Promise((res) => {
          resolveUpload = () => {
            cb?.({ loaded: 100, total: 100 });
            res({ data: { url: '/file' } });
          };
        });
      },
    );

    await act(async () => {
      root.render(React.createElement(Wrapper));
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await flushPromises();

    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    await act(async () => {
      resolveUpload();
    });

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});
