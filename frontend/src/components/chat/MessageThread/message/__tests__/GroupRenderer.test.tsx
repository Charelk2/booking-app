import React from 'react';
import { render, screen } from '@testing-library/react';
import GroupRenderer from '../GroupRenderer';
import type { MessageGroup } from '../../grouping/types';

describe('GroupRenderer tombstone rendering', () => {
  it('renders deleted bubble for backend tombstone messages', () => {
    const msg: any = {
      id: 1,
      message_type: 'SYSTEM',
      system_key: 'message_deleted_v1',
      content: 'This message was deleted.',
      timestamp: new Date().toISOString(),
      sender_id: 123,
    };

    const group: MessageGroup = {
      sender_id: msg.sender_id,
      sender_type: 'CLIENT',
      messages: [msg],
      showDayDivider: false,
    };

    render(
      <GroupRenderer
        group={group}
        myUserId={999}
      />,
    );

    expect(
      screen.getByText(/This message has been deleted/i),
    ).toBeInTheDocument();
  });
});

