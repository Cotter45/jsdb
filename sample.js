import JSDB from './dist/index.js';
import fs from 'fs';

async function insertTest(collection) {
  const ids = [];
  const values = [];
  for (let i = 0; i < 1000; i++) {
    ids.push(i + 1);
    values.push({
      id: i + 1,
      name: `test-${i + 1}`,
      value: i + 1,
    });
  }

  const start = performance.now();

  await Promise.all(
    ids.map((id, index) => collection.insert({ id, ...values[index] })),
  );

  const end = performance.now();
  console.log(`Insertion took ${end - start} milliseconds.`);
  // Insertion took 138.8942918777466 milliseconds.
}

async function getTest(collection) {
  const start = performance.now();
  await collection.get(1);
  const end = performance.now();
  console.log(`Get 1 took ${end - start} milliseconds.`);
  // Get 1 took 0.22166681289672852 milliseconds.

  const start2 = performance.now();
  await collection.get(999);
  const end2 = performance.now();
  console.log(`Get 999 took ${end2 - start2} milliseconds.`);
  // Get 999 took 0.26908397674560547 milliseconds.
}

async function getManyTest(collection) {
  const start = performance.now();
  await collection.getMany([1, 2, 3, 4, 5]);
  const end = performance.now();
  console.log(`Get 1-5 took ${end - start} milliseconds.`);
  // Get 1-5 took 0.4840831756591797 milliseconds.

  const start2 = performance.now();
  await collection.getMany([999, 998, 997, 996, 995]);
  const end2 = performance.now();
  console.log(`Get 995-999 took ${end2 - start2} milliseconds.`);
  // Get 995-999 took 0.48058366775512695 milliseconds.
}

async function updateTest(collection) {
  const start = performance.now();
  await collection.update(1, { name: 'test-1', value: 1 });
  const end = performance.now();
  console.log(`Update 1 took ${end - start} milliseconds.`);
  // Update 1 took 0.796208381652832 milliseconds.
}

async function main() {
  const db = new JSDB('test');
  const collection = await db.createCollection('users');

  await insertTest(collection);
  await getTest(collection);
  await getManyTest(collection);
  await updateTest(collection);

  fs.rmSync('./test', { recursive: true });
}

main();
