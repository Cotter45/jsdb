const http = require('http');
const JSDB = require('./dist/index.js').default;
const { parse } = require('url');

// works with absolute or relative path
const db = new JSDB('./db');

db.createCollection('users'); // 500kb
db.createCollection('products'); // 500kb

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
    const collection = db.getCollection(collectionName);

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
          await collection.update(id, updatedItem);
          res.end(JSON.stringify(updatedItem));
          break;

        case 'DELETE':
          const deletedItem = await collection.delete(id);
          res.end(JSON.stringify(deletedItem));
          break;

        default:
          res.statusCode = 404;
          res.end('Not found');
      }

      return;
    } catch (err) {
      console.log(err);
      res.statusCode = 500;
      res.end('Server error');
    }
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
