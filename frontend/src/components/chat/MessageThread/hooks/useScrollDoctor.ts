// components/chat/MessageThread/hooks/useScrollDoctor.ts
// Optional debug harness for scroll events; leave disabled by default.
import * as React from 'react';

export function useScrollDoctor(keys: number[]) {
  const last = React.useRef({ len: 0, hash: '' });
  React.useEffect(() => {
    const hash = keys.join('|');
    const len = keys.length;
    // Uncomment for targeted diagnostics only
    // console.table({ time: new Date().toISOString(), len, keysChanged: hash !== last.current.hash });
    last.current = { len, hash };
  }, [keys]);
}

