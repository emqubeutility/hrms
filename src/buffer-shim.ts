// Polyfill for Node.js versions (e.g. 26+) where buffer.SlowBuffer was removed.
// jsonwebtoken and its buffer-equal-constant-time dependency need it.
import * as buffer from 'buffer';
if (!buffer.SlowBuffer) {
  (buffer as any).SlowBuffer = buffer.Buffer;
}
