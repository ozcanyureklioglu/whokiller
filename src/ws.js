// Bağımlılıksız minimal WebSocket sunucusu (RFC 6455, yalnızca metin mesajları).
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024;

class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragSize = 0;
    this.fragOpcode = 0;
    this.closed = false;
    this.closeFired = false;
    this.lastSeen = Date.now();
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (d) => this._data(d));
    socket.on('close', () => this._finish());
    socket.on('error', () => this._finish());
  }

  _data(d) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > MAX_PAYLOAD * 2) return this.close(1009);
    for (;;) {
      const f = this._parse();
      if (!f) break;
      this._frame(f);
      if (this.closed) return;
    }
  }

  _parse() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      if (b.readUInt32BE(2) !== 0) { this.close(1009); return null; }
      len = b.readUInt32BE(6);
      off = 10;
    }
    if (len > MAX_PAYLOAD) { this.close(1009); return null; }
    const need = off + (masked ? 4 : 0) + len;
    if (b.length < need) return null;
    let payload;
    if (masked) {
      const mask = b.subarray(off, off + 4);
      payload = Buffer.from(b.subarray(off + 4, need));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    } else {
      payload = Buffer.from(b.subarray(off, need));
    }
    this.buf = b.subarray(need);
    return { fin, opcode, payload };
  }

  _frame({ fin, opcode, payload }) {
    if (opcode === 0x8) return this.close(1000);
    if (opcode === 0x9) return this._send(0xa, payload); // ping -> pong
    if (opcode === 0xa) return; // pong
    if (opcode === 0x1 || opcode === 0x2) {
      this.fragOpcode = opcode;
      this.fragments = [payload];
      this.fragSize = payload.length;
    } else if (opcode === 0x0) {
      this.fragments.push(payload);
      this.fragSize += payload.length;
      if (this.fragSize > MAX_PAYLOAD) return this.close(1009);
    } else {
      return this.close(1002);
    }
    if (fin) {
      const full = Buffer.concat(this.fragments);
      this.fragments = [];
      this.fragSize = 0;
      if (this.fragOpcode === 0x1 && this.onmessage) this.onmessage(full.toString('utf8'));
    }
  }

  _send(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  send(str) {
    if (this.closed) return;
    if (this.socket.writableLength > 512 * 1024) return; // çok yavaş istemciye mesaj biriktirme
    this._send(0x1, Buffer.from(str, 'utf8'));
  }

  ping() {
    this._send(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (this.closed) return;
    try {
      const p = Buffer.alloc(2);
      p.writeUInt16BE(code);
      this._send(0x8, p);
    } catch { /* yoksay */ }
    this.closed = true;
    this.socket.end();
    const t = setTimeout(() => this.socket.destroy(), 500);
    t.unref();
    this._finish();
  }

  _finish() {
    this.closed = true;
    if (this.closeFired) return;
    this.closeFired = true;
    if (this.onclose) this.onclose();
  }
}

/** http.Server'a WebSocket yükseltmesi ekler. */
export function attachWebSocket(httpServer, onConnection) {
  httpServer.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'),
    );
    socket.setNoDelay(true);
    onConnection(new WSConn(socket), req);
  });
}
