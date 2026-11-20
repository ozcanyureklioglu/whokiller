// Başlatma: `npm start` (varsayılan port 3000, PORT ile değiştirilebilir)
import os from 'node:os';
import { startServer } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const { port: actual } = await startServer({ port });

console.log('\nWhoKiller sunucusu çalışıyor');
console.log(`  Bu bilgisayar : http://localhost:${actual}`);
for (const list of Object.values(os.networkInterfaces())) {
  for (const n of list ?? []) {
    if (n.family === 'IPv4' && !n.internal) {
      console.log(`  Aynı ağdaki telefon/PC : http://${n.address}:${actual}`);
    }
  }
}
console.log('\nDurdurmak için Ctrl+C\n');
