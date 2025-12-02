import React from 'react';
import { render, screen } from '@testing-library/react';
import GroupRenderer from './GroupRenderer';

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

    render(
      <GroupRenderer
        groupId="g1"
        messages={[msg]}
        fromSelfMsg={false}
        resolveReplyPreview={() => ''}
        onJumpToMessage={() => {}}
      />,
    );

    expect(
      screen.getByText(/This message has been deleted/i),
    ).toBeInTheDocument();
  });
}

