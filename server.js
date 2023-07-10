import http from 'http';
import JSDB from './dist/index.js';
import { parse } from 'url';

// works with absolute or relative path
const db = new JSDB('./db');

await db.createCollection('users'); // 500kb
await db.createCollection('products'); // 500kb

const server = http.createServer((req, res) => {
  let data = '';

  req.on('data', (chunk) => {
    data += chunk.toString();
  });

  req.on('end', async () => {
    const url = parse(req.url, true);
    const splitPath = url.pathname.split('/');
    const collectionName = splitPath[1];
    const id = +splitPath[2];
    const collection = await db.getCollection(collectionName);

    try {
      switch (req.method) {
        case 'POST':
          const item = JSON.parse(data);
          const result = await collection.insert(item);
          res.end(JSON.stringify(result));
          break;

        case 'GET':
          const getItem = await collection.get(id);
          res.end(JSON.stringify(getItem));
          break;

        case 'PUT':
          const updatedItem = JSON.parse(data);
          await collection.update(updatedItem.id, updatedItem);
          res.end('Item updated');
          break;

        case 'DELETE':
          await collection.delete(id);
          res.end('Item deleted');
          break;

        default:
          res.statusCode = 404;
          res.end('Not found');
      }

      return;
    } catch (err) {
      res.statusCode = 500;
      res.end(err.message);
    }
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
