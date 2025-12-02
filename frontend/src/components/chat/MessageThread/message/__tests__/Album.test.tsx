import { fireEvent, render } from '@testing-library/react';
import Album, { AlbumItem } from '../Album';

describe('Album', () => {
  it('calls onOpenItem with absolute index and surfaces descriptive labels', () => {
    const items: AlbumItem[] = [
      { id: 1, url: '/1.jpg', alt: 'First photo' },
      { id: 2, url: '/2.jpg', alt: 'Second photo' },
      { id: 3, url: '/3.jpg', alt: 'Third photo' },
      { id: 4, url: '/4.jpg', alt: 'Fourth photo' },
      { id: 5, url: '/5.jpg', alt: 'Fifth photo' },
    ];

    const onOpenItem = jest.fn();
    const { getByAltText, getByLabelText } = render(<Album items={items} onOpenItem={onOpenItem} />);

    expect(getByAltText('First photo')).toBeInTheDocument();

    fireEvent.click(getByLabelText(/Fourth photo \(image 4 of 5\), plus 1 more/i));
    expect(onOpenItem).toHaveBeenCalledWith(3);
  });

  it('falls back to default labels and alt text when metadata is missing', () => {
    const items: AlbumItem[] = [{ id: 10, url: '/one.jpg' }];
    const { getByAltText, getByLabelText } = render(<Album items={items} />);

    expect(getByAltText('Image attachment')).toBeInTheDocument();
    expect(getByLabelText('Open image 1 of 1')).toBeInTheDocument();
  });
});
